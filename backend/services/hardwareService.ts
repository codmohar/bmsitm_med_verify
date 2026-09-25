import { dbService } from '../../db/dbService.js';

export interface CompartmentSchedule {
  compartment: number;
  slot: 'Morning' | 'Evening';
  hour: number;
  minute: number;
}

export interface DeviceScheduleResponse {
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
  event_type: 'COMPARTMENT_OPENED' | 'WINDOW_EXPIRED' | 'HEARTBEAT';
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
}

class HardwareService {
  private devices: Map<string, DeviceState> = new Map();
  private processedEventIds: Set<string> = new Set();
  private eventHistory: HardwareEventPayload[] = [];

  constructor() {
    // Default prototype configuration: BOX01 mapped to primary Patient DS-TB-1024
    this.devices.set('BOX01', {
      deviceId: 'BOX01',
      patientId: 'DS-TB-1024',
      patientName: 'Ramesh Kumar',
      status: 'Testing',
      lastPing: null,
      lastEvent: null,
      ipAddress: null,
      doseWindowMinutes: 30,
      compartments: [
        { compartment: 1, slot: 'Morning', hour: 8, minute: 0 },
        { compartment: 2, slot: 'Evening', hour: 20, minute: 0 },
      ],
      scheduleVersion: Date.now(),
    });

    // Also support default ID DSBOX-04 from mock data
    this.devices.set('DSBOX-04', {
      deviceId: 'DSBOX-04',
      patientId: 'DS-TB-1024',
      patientName: 'Ramesh Kumar',
      status: 'Testing',
      lastPing: null,
      lastEvent: null,
      ipAddress: null,
      doseWindowMinutes: 30,
      compartments: [
        { compartment: 1, slot: 'Morning', hour: 8, minute: 0 },
        { compartment: 2, slot: 'Evening', hour: 20, minute: 0 },
      ],
      scheduleVersion: Date.now(),
    });
  }

  public registerPing(deviceId: string, ipAddress?: string): { success: boolean; message: string; timestamp: string } {
    const now = new Date().toISOString();
    let device = this.devices.get(deviceId);
    if (!device) {
      // Auto-register unknown test device and bind to default patient
      device = {
        deviceId,
        patientId: 'DS-TB-1024',
        patientName: 'Ramesh Kumar',
        status: 'Online',
        lastPing: now,
        lastEvent: null,
        ipAddress: ipAddress || null,
        doseWindowMinutes: 30,
        compartments: [
          { compartment: 1, slot: 'Morning', hour: 8, minute: 0 },
          { compartment: 2, slot: 'Evening', hour: 20, minute: 0 },
        ],
        scheduleVersion: Date.now(),
      };
      this.devices.set(deviceId, device);
    } else {
      device.status = 'Online';
      device.lastPing = now;
      if (ipAddress) device.ipAddress = ipAddress;
    }

    console.log(`[DoseSure Hardware] Ping acknowledged from ${deviceId} (${ipAddress || 'unknown IP'}) at ${now}`);
    return {
      success: true,
      message: `Backend connection successful for device ${deviceId}`,
      timestamp: now,
    };
  }

  public getSchedule(deviceId: string): DeviceScheduleResponse {
    const device = this.devices.get(deviceId) || this.devices.get('BOX01')!;
    return {
      device_id: device.deviceId,
      patient_id: device.patientId,
      patient_name: device.patientName,
      dose_window_minutes: device.doseWindowMinutes,
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
    let device = this.devices.get(deviceId);
    if (!device) {
      device = this.devices.get('BOX01')!;
    }

    device.compartments = [
      { compartment: 1, slot: 'Morning', hour: dose1Hour, minute: dose1Minute },
      { compartment: 2, slot: 'Evening', hour: dose2Hour, minute: dose2Minute },
    ];
    if (windowMinutes) device.doseWindowMinutes = windowMinutes;
    if (patientName) device.patientName = patientName;
    if (patientId) device.patientId = patientId;
    device.scheduleVersion = Date.now();

    console.log(`[DoseSure Hardware] Schedule updated for ${device.deviceId} (Patient: ${device.patientName}): Comp 1 -> ${dose1Hour}:${dose1Minute}, Comp 2 -> ${dose2Hour}:${dose2Minute}`);
    return this.getSchedule(device.deviceId);
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
      console.log(`[DoseSure Hardware] DUPLICATE event detected: ${event_id}. Returning ACK without re-processing.`);
      return {
        status: 'already_processed',
        duplicate: true,
        event_id,
        message: 'Event was already processed previously (idempotent ACK)',
        action_taken: 'NONE_DUPLICATE_IGNORED',
      };
    }

    // New event processing
    this.processedEventIds.add(event_id);
    this.eventHistory.push(payload);

    const device = this.devices.get(device_id) || this.devices.get('BOX01');
    if (device) {
      device.lastEvent = payload;
      device.lastPing = new Date().toISOString();
      device.status = 'Online';
    }

    // Persist hardware status into db/hardware.json
    dbService.saveHardwareState(device_id, {
      lastEvent: payload,
      status: 'Online',
      lastPing: new Date().toISOString(),
    });

    console.log(`[DoseSure Hardware] NEW EVENT RECORDED:`);
    console.log(`  Event ID    : ${event_id}`);
    console.log(`  Device      : ${device_id}`);
    console.log(`  Compartment : ${compartment}`);
    console.log(`  Type        : ${event_type}`);
    console.log(`  Event Time  : ${event_time}`);
    console.log(`  LDR Value   : ${ldr_value}`);
    console.log(`  Evidence    : ACCESS_VERIFIED (Smart pillbox access recorded)`);

    return {
      status: 'success',
      duplicate: false,
      event_id,
      message: `Compartment ${compartment} access recorded successfully.`,
      action_taken: 'ACCESS_VERIFIED',
    };
  }

  public getDeviceStatus(deviceId: string) {
    const device = this.devices.get(deviceId) || this.devices.get('BOX01');
    return {
      device,
      totalEventsProcessed: this.processedEventIds.size,
      recentEvents: this.eventHistory.slice(-10),
    };
  }
}

export const hardwareService = new HardwareService();
