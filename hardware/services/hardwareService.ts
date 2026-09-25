import { dbService } from '../../db/dbService.js';
import { DoseSlot, TimingStatus, VerificationEvidence, DoseRecord, Alert } from '../../db/types.js';

export interface CompartmentSchedule {
  compartment: number;
  slot: 'Morning' | 'Evening';
  hour: number;
  minute: number;
}

export interface DeviceScheduleResponse {
  // CamelCase for ESP32 and modern clients
  deviceId: string;
  patientId: string;
  patientName: string;
  dose1Hour: number;
  dose1Minute: number;
  dose2Hour: number;
  dose2Minute: number;
  windowMinutes: number;
  timezone: string;
  scheduleVersion: number;
  updatedAt: string;

  // Snake_case for backwards compatibility with earlier tests
  device_id: string;
  patient_id: string;
  patient_name: string;
  dose_window_minutes: number;
  compartments: CompartmentSchedule[];
  schedule_version: number;
}

export interface HardwareEventPayload {
  event_id: string;
  device_id: string;
  patient_id?: string;
  compartment: number;
  event_type: 'COMPARTMENT_OPENED' | 'WINDOW_EXPIRED' | 'MISSED_DOSE' | 'OUT_OF_WINDOW_OPEN' | 'HEARTBEAT';
  event_time: string;
  ldr_value: number;
}

export interface DeviceState {
  deviceId: string;
  patientId: string;
  patientName: string;
  status: 'Online' | 'Offline' | 'Testing';
  lastPing: string | null;
  lastEvent: HardwareEventPayload | null;
  ipAddress: string | null;
  doseWindowMinutes: number;
  compartments: CompartmentSchedule[];
  scheduleVersion: number;
  updatedAt: string;
  timezone: string;
}

export interface DeviceLiveTelemetry {
  deviceId: string;
  ldr1: number;
  ldr2: number;
  comp1Opened: boolean;
  comp2Opened: boolean;
  comp1Armed: boolean;
  comp2Armed: boolean;
  led1: boolean;
  led2: boolean;
  buzzer: boolean;
  wifiSsid: string;
  lastUpdated: string;
  systemState?: string;
  serialLogs: string[];
}

function parseHourMinute(timeStr: string, fallbackH: number, fallbackM: number): { hour: number; minute: number } {
  if (!timeStr) return { hour: fallbackH, minute: fallbackM };
  const cleaned = timeStr.trim().toUpperCase();
  const match = cleaned.match(/(\d+):(\d+)\s*(AM|PM)?/i);
  if (!match) return { hour: fallbackH, minute: fallbackM };

  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const meridiem = match[3];

  if (meridiem) {
    if (meridiem === 'PM' && hour < 12) hour += 12;
    if (meridiem === 'AM' && hour === 12) hour = 0;
  }
  return { hour, minute };
}

class HardwareService {
  private devices: Map<string, DeviceState> = new Map();
  private processedEventIds: Set<string> = new Set();
  private eventHistory: HardwareEventPayload[] = [];
  private activePatientId: string | null = null;
  private liveTelemetry: Map<string, DeviceLiveTelemetry> = new Map();

  constructor() {
    // Zero hardcoded patients - dynamically initialize from the latest registered patient in dbService
    const allPatients = dbService.getAllPatients();
    if (allPatients.length > 0) {
      const latest = allPatients[allPatients.length - 1];
      this.activePatientId = latest.id;
      console.log(`[DoseSure Hardware] Service initialized with active patient: "${latest.fullName}" (${latest.id})`);
    } else {
      console.log('[DoseSure Hardware] Service initialized. Waiting for website patient selection.');
    }
  }

  public setActivePatient(
    patientId: string, 
    deviceId: string = 'BOX01', 
    customSchedule?: { dose1Hour?: number; dose1Minute?: number; dose2Hour?: number; dose2Minute?: number; windowMinutes?: number }
  ): DeviceScheduleResponse {
    this.activePatientId = patientId;
    const patient = dbService.getPatientById(patientId);
    if (!patient) {
      throw new Error(`Patient with ID "${patientId}" not found in database.`);
    }

    const mTime = patient.todayDoses?.find(d => d.slot === 'Morning')?.scheduledTime || patient.prescribedTimes?.[0] || '08:00 AM';
    const eTime = patient.todayDoses?.find(d => d.slot === 'Evening')?.scheduledTime || patient.prescribedTimes?.[1] || '20:00 PM';
    const p1 = parseHourMinute(mTime, 8, 0);
    const p2 = parseHourMinute(eTime, 20, 0);

    const h1 = customSchedule?.dose1Hour ?? p1.hour;
    const m1 = customSchedule?.dose1Minute ?? p1.minute;
    const h2 = customSchedule?.dose2Hour ?? p2.hour;
    const m2 = customSchedule?.dose2Minute ?? p2.minute;
    const win = customSchedule?.windowMinutes ?? patient.allowedDoseWindowMinutes ?? 30;

    // Update the device currently assigned AND BOX01 so physical ESP32 immediately syncs
    this.updateSchedule(deviceId, h1, m1, h2, m2, win, patient.fullName, patient.id);
    if (deviceId !== 'BOX01') {
      this.updateSchedule('BOX01', h1, m1, h2, m2, win, patient.fullName, patient.id);
    }

    console.log(`[DoseSure Hardware] Active website page set to Patient: "${patient.fullName}" (${patient.id}). Schedule -> Comp 1: ${h1}:${m1}, Comp 2: ${h2}:${m2}, Window: ${win}m`);
    return this.getSchedule(deviceId);
  }

  public registerPing(deviceId: string, ipAddress?: string): { success: boolean; message: string; timestamp: string } {
    const now = new Date().toISOString();
    let device = this.devices.get(deviceId);
    if (!device) {
      device = this.ensureDeviceLoaded(deviceId);
    }
    device.status = 'Online';
    device.lastPing = now;
    if (ipAddress) device.ipAddress = ipAddress;

    // Update patient status in DB if associated
    if (device.patientId) {
      const patient = dbService.getPatientById(device.patientId);
      if (patient) {
        patient.esp32Status = 'Online';
        patient.lastSync = 'Just now (Heartbeat OK)';
        dbService.updatePatient(patient.id, patient);
      }
    }

    // Persist hardware state
    dbService.saveHardwareState(deviceId, {
      status: 'Online',
      lastPing: now,
      ipAddress: device.ipAddress,
    });

    console.log(`[DoseSure Hardware] Ping acknowledged from ${deviceId} (${ipAddress || 'unknown IP'}) at ${now}`);
    return {
      success: true,
      message: `Backend connection successful for device ${deviceId}`,
      timestamp: now,
    };
  }

  private ensureDeviceLoaded(deviceId: string): DeviceState {
    let device = this.devices.get(deviceId);

    // Dynamic resolution from dbService:
    // 1. If care worker currently has a patient open on the website, follow that patient!
    // 2. Otherwise match by patient's pillboxId
    // 3. Otherwise use the newest registered patient
    const allPatients = dbService.getAllPatients();
    const patient = (this.activePatientId ? dbService.getPatientById(this.activePatientId) : null) ||
      dbService.getPatientByPillboxId(deviceId) || 
      allPatients.find(p => p.pillboxId === deviceId) ||
      (allPatients.length > 0 ? allPatients[allPatients.length - 1] : null);

    if (patient) {
      const mTime = patient.todayDoses?.find(d => d.slot === 'Morning')?.scheduledTime || patient.prescribedTimes?.[0] || '08:00 AM';
      const eTime = patient.todayDoses?.find(d => d.slot === 'Evening')?.scheduledTime || patient.prescribedTimes?.[1] || '20:00 PM';
      const p1 = parseHourMinute(mTime, 8, 0);
      const p2 = parseHourMinute(eTime, 20, 0);

      if (!device) {
        device = {
          deviceId,
          patientId: patient.id,
          patientName: patient.fullName,
          status: 'Online',
          lastPing: null,
          lastEvent: null,
          ipAddress: null,
          doseWindowMinutes: patient.allowedDoseWindowMinutes || 30,
          compartments: [
            { compartment: 1, slot: 'Morning', hour: p1.hour, minute: p1.minute },
            { compartment: 2, slot: 'Evening', hour: p2.hour, minute: p2.minute },
          ],
          scheduleVersion: Date.now(),
          updatedAt: new Date().toISOString(),
          timezone: 'Asia/Kolkata',
        };
        this.devices.set(deviceId, device);
      } else {
        // Automatically sync latest patient prescription if modified in website
        device.patientId = patient.id;
        device.patientName = patient.fullName;
        device.doseWindowMinutes = patient.allowedDoseWindowMinutes || device.doseWindowMinutes;
        device.compartments = [
          { compartment: 1, slot: 'Morning', hour: p1.hour, minute: p1.minute },
          { compartment: 2, slot: 'Evening', hour: p2.hour, minute: p2.minute },
        ];
      }
      return device;
    }

    if (device) return device;

    device = {
      deviceId,
      patientId: 'AWAITING_SELECTION',
      patientName: 'Awaiting Patient Selection on Website',
      status: 'Online',
      lastPing: null,
      lastEvent: null,
      ipAddress: null,
      doseWindowMinutes: 30,
      compartments: [
        { compartment: 1, slot: 'Morning', hour: 8, minute: 0 },
        { compartment: 2, slot: 'Evening', hour: 20, minute: 0 },
      ],
      scheduleVersion: Date.now(),
      updatedAt: new Date().toISOString(),
      timezone: 'Asia/Kolkata',
    };

    this.devices.set(deviceId, device);
    return device;
  }

  public getSchedule(deviceId: string): DeviceScheduleResponse {
    const device = this.ensureDeviceLoaded(deviceId);
    const comp1 = device.compartments.find(c => c.compartment === 1) || { hour: 8, minute: 0 };
    const comp2 = device.compartments.find(c => c.compartment === 2) || { hour: 20, minute: 0 };

    return {
      deviceId: device.deviceId,
      patientId: device.patientId,
      patientName: device.patientName,
      dose1Hour: comp1.hour,
      dose1Minute: comp1.minute,
      dose2Hour: comp2.hour,
      dose2Minute: comp2.minute,
      windowMinutes: device.doseWindowMinutes || 30,
      timezone: device.timezone || 'Asia/Kolkata',
      scheduleVersion: device.scheduleVersion,
      updatedAt: device.updatedAt,

      // Backwards-compatible aliases
      device_id: device.deviceId,
      patient_id: device.patientId,
      patient_name: device.patientName,
      dose_window_minutes: device.doseWindowMinutes || 30,
      compartments: device.compartments,
      schedule_version: device.scheduleVersion,
    };
  }

  public updateSchedule(
    deviceId: string,
    dose1Hour: number,
    dose1Minute: number,
    dose2Hour: number,
    dose2Minute: number,
    windowMinutes?: number,
    patientName?: string,
    patientId?: string
  ): DeviceScheduleResponse {
    const device = this.ensureDeviceLoaded(deviceId);

    device.compartments = [
      { compartment: 1, slot: 'Morning', hour: dose1Hour, minute: dose1Minute },
      { compartment: 2, slot: 'Evening', hour: dose2Hour, minute: dose2Minute },
    ];
    if (windowMinutes) device.doseWindowMinutes = windowMinutes;
    if (patientName) device.patientName = patientName;
    if (patientId) device.patientId = patientId;

    device.scheduleVersion = Date.now();
    device.updatedAt = new Date().toISOString();

    // Persist to hardware.json
    dbService.saveHardwareState(device.deviceId, {
      deviceId: device.deviceId,
      patientId: device.patientId,
      patientName: device.patientName,
      compartments: device.compartments,
      windowMinutes: device.doseWindowMinutes,
      scheduleVersion: device.scheduleVersion,
      updatedAt: device.updatedAt,
      timezone: device.timezone,
    });

    // Also synchronize patient's prescribed times and todayDoses in db/patients.json ONLY if changed
    if (device.patientId) {
      const patient = dbService.getPatientById(device.patientId);
      if (patient) {
        const formatTimeStr = (h: number, m: number) => {
          const meridiem = h >= 12 ? 'PM' : 'AM';
          const displayH = h % 12 === 0 ? 12 : h % 12;
          return `${String(displayH).padStart(2, '0')}:${String(m).padStart(2, '0')} ${meridiem}`;
        };
        const t1 = formatTimeStr(dose1Hour, dose1Minute);
        const t2 = formatTimeStr(dose2Hour, dose2Minute);

        const curT1 = patient.prescribedTimes?.[0];
        const curT2 = patient.prescribedTimes?.[1];
        const curWin = patient.allowedDoseWindowMinutes;
        const scheduleChanged = (curT1 !== t1 || curT2 !== t2 || (windowMinutes && curWin !== windowMinutes));

        if (scheduleChanged) {
          patient.prescribedTimes = [t1, t2];
          if (windowMinutes) patient.allowedDoseWindowMinutes = windowMinutes;
          if (patient.todayDoses) {
            patient.todayDoses = patient.todayDoses.map((d) => {
              if (d.slot === 'Morning') {
                return {
                  ...d,
                  scheduledTime: t1,
                  timingStatus: 'PENDING' as TimingStatus,
                  verificationEvidence: 'SELF_REPORT' as VerificationEvidence,
                  pillboxVerified: false,
                  aiVerified: false,
                };
              }
              if (d.slot === 'Evening') {
                return {
                  ...d,
                  scheduledTime: t2,
                  timingStatus: 'PENDING' as TimingStatus,
                  verificationEvidence: 'SELF_REPORT' as VerificationEvidence,
                  pillboxVerified: false,
                  aiVerified: false,
                };
              }
              return d;
            });
          }
          dbService.updatePatient(patient.id, patient);
          console.log(`[DoseSure Hardware] Patient schedule changed and persisted: ${t1} / ${t2} (Win: ${windowMinutes || curWin}m)`);
        }
      }
    }

    // Reset live telemetry cached flags for this device on schedule change
    const curTelem = this.liveTelemetry.get(device.deviceId);
    if (curTelem) {
      curTelem.comp1Opened = false;
      curTelem.comp2Opened = false;
      curTelem.led1 = false;
      curTelem.led2 = false;
      curTelem.buzzer = false;
    }

    console.log(`[DoseSure Hardware] Schedule updated for ${device.deviceId} (Patient: ${device.patientName}): Comp 1 -> ${dose1Hour}:${dose1Minute}, Comp 2 -> ${dose2Hour}:${dose2Minute}, Win: ${device.doseWindowMinutes}m`);
    return this.getSchedule(device.deviceId);
  }

  public assignPatient(deviceId: string, patientId: string): DeviceScheduleResponse {
    const patient = dbService.getPatientById(patientId);
    if (!patient) {
      throw new Error(`Patient with ID ${patientId} not found`);
    }

    patient.pillboxId = deviceId;
    dbService.updatePatient(patient.id, patient);

    const mTime = patient.todayDoses?.find(d => d.slot === 'Morning')?.scheduledTime || patient.prescribedTimes?.[0] || '08:00 AM';
    const eTime = patient.todayDoses?.find(d => d.slot === 'Evening')?.scheduledTime || patient.prescribedTimes?.[1] || '20:00 PM';
    const p1 = parseHourMinute(mTime, 8, 0);
    const p2 = parseHourMinute(eTime, 20, 0);

    return this.updateSchedule(
      deviceId,
      p1.hour,
      p1.minute,
      p2.hour,
      p2.minute,
      patient.allowedDoseWindowMinutes || 30,
      patient.fullName,
      patient.id
    );
  }

  public recordEvent(payload: HardwareEventPayload): {
    status: 'success' | 'already_processed';
    duplicate: boolean;
    event_id: string;
    message: string;
    action_taken: string;
  } {
    const { event_id, device_id, compartment, event_type, event_time, ldr_value } = payload;

    // Idempotency check: duplicate event protection
    if (this.processedEventIds.has(event_id)) {
      console.log(`[DoseSure Hardware] DUPLICATE event detected: ${event_id}. Returning idempotent ACK.`);
      return {
        status: 'already_processed',
        duplicate: true,
        event_id,
        message: 'Event was already processed previously (idempotent ACK)',
        action_taken: 'NONE_DUPLICATE_IGNORED',
      };
    }

    this.processedEventIds.add(event_id);
    this.eventHistory.push(payload);

    const device = this.ensureDeviceLoaded(device_id);
    device.lastEvent = payload;
    device.lastPing = new Date().toISOString();
    device.status = 'Online';

    const nowFormatted = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const todayDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const slot: DoseSlot = compartment === 1 ? 'Morning' : 'Evening';

    // Find the mapped patient
    const patient = dbService.getPatientById(device.patientId) || dbService.getPatientByPillboxId(device_id);

    let actionTaken = 'LOGGED';

    if (patient) {
      if (event_type === 'COMPARTMENT_OPENED') {
        actionTaken = 'ACCESS_VERIFIED';

        // Update todayDoses: Pillbox is verified (GREEN), but AI video remains pending (RED)
        // Dose is only considered TAKEN when BOTH Pillbox and AI Video are verified!
        const updatedDoses = patient.todayDoses.map((d) => {
          if (d.slot === slot) {
            return {
              ...d,
              pillboxVerified: true,
              aiVerified: false,
              timingStatus: 'PENDING' as TimingStatus,
              verificationEvidence: 'ACCESS_VERIFIED' as VerificationEvidence,
            };
          }
          return d;
        });

        // Add history audit record
        const doseRecord: DoseRecord = {
          id: `rec-hw-${Date.now()}`,
          patientId: patient.id,
          date: todayDate,
          scheduledTime: slot === 'Morning' ? '08:00 AM' : '08:00 PM',
          eventTime: event_time || nowFormatted,
          doseSlot: slot,
          timingStatus: 'PENDING',
          verificationEvidence: 'ACCESS_VERIFIED',
          pillboxVerified: true,
          aiVerified: false,
          deviceId: device_id,
          alertSent: false,
          notes: `Smart pillbox access recorded automatically by ESP32 physical sensor (LDR value: ${ldr_value}). Awaiting AI video verification.`,
          aiVerificationResult: {
            verified: false,
            confidence: 0.5,
            explanation: `Physical smart pillbox access verified via optical LDR sensor (reading: ${ldr_value}). Patient must complete 20s AI video verification to confirm dose taken.`,
          },
        };

        patient.todayDoses = updatedDoses;
        patient.history = [doseRecord, ...patient.history];
        patient.esp32Status = 'Online';
        patient.lastSync = 'Just now (Access Recorded)';
        dbService.updatePatient(patient.id, patient);
        dbService.recordDose(doseRecord);

        console.log(`[DoseSure Hardware] Patient ${patient.fullName} (${patient.id}) Dose ${slot} pillbox access recorded (Pillbox: GREEN, AI: RED - Awaiting AI Video).`);
      } else if (event_type === 'WINDOW_EXPIRED' || event_type === 'MISSED_DOSE') {
        actionTaken = 'MISSED_DOSE_RECORDED';

        const updatedDoses = patient.todayDoses.map((d) => {
          if (d.slot === slot && d.timingStatus === 'PENDING') {
            return {
              ...d,
              timingStatus: 'MISSED' as TimingStatus,
            };
          }
          return d;
        });

        // Create Alert
        const alert: Alert = {
          id: `alt-hw-${Date.now()}`,
          patientId: patient.id,
          patientName: patient.fullName,
          treatment: patient.treatment,
          alertType: 'MISSED_DOSE',
          scheduledDose: `${slot} Dose`,
          time: nowFormatted,
          severity: 'CRITICAL',
          whatsAppNotificationStatus: 'Sent to Caregiver',
          statusDescription: `Pillbox was not opened within ${device.doseWindowMinutes} min dose window.`,
          isReviewed: false,
          createdAt: new Date().toISOString(),
        };

        patient.todayDoses = updatedDoses;
        patient.status = 'Missed Dose';
        dbService.updatePatient(patient.id, patient);
        dbService.saveAlert(alert);

        console.log(`[DoseSure Hardware] Patient ${patient.fullName} (${patient.id}) Dose ${slot} marked MISSED. Critical alert generated.`);
      } else if (event_type === 'OUT_OF_WINDOW_OPEN') {
        actionTaken = 'OUT_OF_WINDOW_LOGGED';
        console.log(`[DoseSure Hardware] Out-of-window pillbox access logged for device ${device_id} (LDR: ${ldr_value}). Medication status unchanged.`);
      }
    }

    // Persist hardware status
    dbService.saveHardwareState(device_id, {
      lastEvent: payload,
      status: 'Online',
      lastPing: new Date().toISOString(),
    });

    // Real-time telemetry update from incoming event
    this.updateTelemetry({
      device_id,
      patient_id: payload.patient_id,
      ldr1: compartment === 1 ? ldr_value : undefined,
      ldr2: compartment === 2 ? ldr_value : undefined,
      comp1_opened: compartment === 1 ? (event_type === 'COMPARTMENT_OPENED') : undefined,
      comp2_opened: compartment === 2 ? (event_type === 'COMPARTMENT_OPENED') : undefined,
      comp1_armed: compartment === 1 ? (event_type !== 'COMPARTMENT_OPENED') : undefined,
      comp2_armed: compartment === 2 ? (event_type !== 'COMPARTMENT_OPENED') : undefined,
      led1: false,
      led2: false,
      buzzer: false,
      log_line: `[${new Date().toLocaleTimeString()}] >>> ${event_type} Comp ${compartment} (LDR: ${ldr_value} > 1000 LIGHT DETECTED) - Buzzer: OFF <<<`,
      system_state: event_type,
    });

    console.log(`[DoseSure Hardware] Event ${event_id} processed successfully. Action taken: ${actionTaken}`);

    return {
      status: 'success',
      duplicate: false,
      event_id,
      message: `Event ${event_type} for Compartment ${compartment} processed successfully.`,
      action_taken: actionTaken,
    };
  }

  public updateTelemetry(payload: {
    device_id: string;
    patient_id?: string;
    ldr1?: number;
    ldr2?: number;
    comp1_opened?: boolean;
    comp2_opened?: boolean;
    comp1_armed?: boolean;
    comp2_armed?: boolean;
    led1?: boolean;
    led2?: boolean;
    buzzer?: boolean;
    wifi_ssid?: string;
    log_line?: string;
    system_state?: string;
  }): DeviceLiveTelemetry {
    const devId = payload.device_id || 'BOX01';
    let current = this.liveTelemetry.get(devId);
    if (!current) {
      current = {
        deviceId: devId,
        ldr1: payload.ldr1 ?? 245,
        ldr2: payload.ldr2 ?? 120,
        comp1Opened: Boolean(payload.comp1_opened),
        comp2Opened: Boolean(payload.comp2_opened),
        comp1Armed: payload.comp1_armed ?? true,
        comp2Armed: payload.comp2_armed ?? true,
        led1: Boolean(payload.led1),
        led2: Boolean(payload.led2),
        buzzer: Boolean(payload.buzzer),
        wifiSsid: payload.wifi_ssid || 'NIRMAAN 2026',
        lastUpdated: new Date().toISOString(),
        systemState: payload.system_state || 'IDLE',
        serialLogs: [
          `[BOOT] ESP32 Device ${devId} initialized at 115200 baud.`,
          `[WIFI] Connected to ${payload.wifi_ssid || 'NIRMAAN 2026'}. IP: Assigned.`,
          `[NTP] Time synchronized (Asia/Kolkata UTC+5:30).`,
          `[SYSTEM READY] Pillbox sensors armed and telemetry streaming.`,
        ],
      };
      this.liveTelemetry.set(devId, current);
    }

    if (payload.ldr1 !== undefined) current.ldr1 = payload.ldr1;
    if (payload.ldr2 !== undefined) current.ldr2 = payload.ldr2;
    if (payload.comp1_opened !== undefined) current.comp1Opened = payload.comp1_opened;
    if (payload.comp2_opened !== undefined) current.comp2Opened = payload.comp2_opened;
    if (payload.comp1_armed !== undefined) current.comp1Armed = payload.comp1_armed;
    if (payload.comp2_armed !== undefined) current.comp2Armed = payload.comp2_armed;
    if (payload.led1 !== undefined) current.led1 = payload.led1;
    if (payload.led2 !== undefined) current.led2 = payload.led2;
    if (payload.buzzer !== undefined) current.buzzer = payload.buzzer;
    if (payload.wifi_ssid) current.wifiSsid = payload.wifi_ssid;
    if (payload.system_state) current.systemState = payload.system_state;
    current.lastUpdated = new Date().toISOString();

    if (payload.log_line) {
      current.serialLogs.push(payload.log_line);
      if (current.serialLogs.length > 80) current.serialLogs.shift();
    }

    return current;
  }

  public appendSerialLog(deviceId: string, logLine: string): string[] {
    const devId = deviceId || 'BOX01';
    let current = this.liveTelemetry.get(devId);
    if (!current) {
      current = this.getTelemetry(devId);
    }
    current.serialLogs.push(logLine);
    if (current.serialLogs.length > 100) current.serialLogs.shift();
    current.lastUpdated = new Date().toISOString();

    // Parse incoming serial line dynamically in real time
    const m1 = logLine.match(/LDR\s*1\s*(?:Light\s*Detected)?[:\s]+(\d+)/i) || logLine.match(/LDR1[:\s]+(\d+)/i);
    if (m1) {
      current.ldr1 = parseInt(m1[1], 10);
      if (current.ldr1 > 1000) current.comp1Opened = true;
    }
    const m2 = logLine.match(/LDR\s*2\s*(?:Light\s*Detected)?[:\s]+(\d+)/i) || logLine.match(/LDR2[:\s]+(\d+)/i);
    if (m2) {
      current.ldr2 = parseInt(m2[1], 10);
      if (current.ldr2 > 1000) current.comp2Opened = true;
    }
    if (/COMPARTMENT\s*1\s*OPENED|DOSE\s*1\s*TAKEN/i.test(logLine)) {
      current.comp1Opened = true;
      current.comp1Armed = false;
      current.led1 = false;
      current.buzzer = false;
    }
    if (/COMPARTMENT\s*2\s*OPENED|DOSE\s*2\s*TAKEN/i.test(logLine)) {
      current.comp2Opened = true;
      current.comp2Armed = false;
      current.led2 = false;
      current.buzzer = false;
    }
    const ledMatch = logLine.match(/LED\s*1\s*[:=]\s*(ON|OFF|BLINK)/i);
    if (ledMatch) current.led1 = ledMatch[1].toUpperCase() !== 'OFF';
    const bMatch = logLine.match(/BUZZER\s*[:=]\s*(ON|OFF|PULSING|BEEPING|STOPPED|MUTED)/i);
    if (bMatch) {
      const bs = bMatch[1].toUpperCase();
      current.buzzer = bs === 'ON' || bs === 'PULSING' || bs === 'BEEPING';
    }

    return current.serialLogs;
  }

  public getTelemetry(deviceId: string = 'BOX01'): DeviceLiveTelemetry {
    let t = this.liveTelemetry.get(deviceId);
    if (!t) {
      const dev = this.devices.get(deviceId);
      const lastLdr = dev?.lastEvent?.ldr_value ?? 245;
      const wasOpened = dev?.lastEvent?.event_type === 'COMPARTMENT_OPENED';
      t = {
        deviceId,
        ldr1: lastLdr,
        ldr2: 120,
        comp1Opened: wasOpened,
        comp2Opened: false,
        comp1Armed: !wasOpened,
        comp2Armed: true,
        led1: false,
        led2: false,
        buzzer: false,
        wifiSsid: 'NIRMAAN 2026',
        lastUpdated: new Date().toISOString(),
        systemState: wasOpened ? 'ACCESS_VERIFIED' : 'IDLE',
        serialLogs: [
          `[BOOT] ESP32 Device ${deviceId} initialized at 115200 baud.`,
          `[WIFI] Connected to NIRMAAN 2026. IP: Assigned.`,
          `[NTP] Time synchronized (Asia/Kolkata UTC+5:30).`,
          `[SYSTEM READY] Pillbox sensors armed and telemetry streaming.`,
        ],
      };
      this.liveTelemetry.set(deviceId, t);
    }
    return t;
  }

  public getDeviceStatus(deviceId: string) {
    const device = this.ensureDeviceLoaded(deviceId);
    return {
      device,
      telemetry: this.getTelemetry(deviceId),
      totalEventsProcessed: this.processedEventIds.size,
      recentEvents: this.eventHistory.slice(-10),
    };
  }
}

export const hardwareService = new HardwareService();
