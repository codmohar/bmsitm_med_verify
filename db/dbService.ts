import fs from 'fs';
import path from 'path';
import { Patient, CareWorker, Alert, DoseRecord, DatabaseStats } from './types.js';
import { SEED_CARE_WORKERS, SEED_PATIENTS, SEED_ALERTS } from './seeds.js';

class DatabaseService {
  private dbDir: string;
  private patientsFile: string;
  private doctorsFile: string;
  private alertsFile: string;
  private dosesFile: string;
  private hardwareFile: string;

  // In-memory indexing caches for sub-millisecond retrieval
  private patientsById: Map<string, Patient> = new Map();
  private patientsByPillbox: Map<string, Patient> = new Map();
  private doctorsById: Map<string, CareWorker> = new Map();
  private alertsById: Map<string, Alert> = new Map();
  private doseRecords: DoseRecord[] = [];
  private hardwareData: Record<string, any> = {};

  constructor() {
    this.dbDir = path.resolve(process.cwd(), 'db');
    this.patientsFile = path.join(this.dbDir, 'patients.json');
    this.doctorsFile = path.join(this.dbDir, 'doctors.json');
    this.alertsFile = path.join(this.dbDir, 'alerts.json');
    this.dosesFile = path.join(this.dbDir, 'doses.json');
    this.hardwareFile = path.join(process.cwd(), 'hardware', 'hardware.json');

    this.ensureDirectoryAndFiles();
    this.loadAllFromDisk();
  }

  /**
   * Ensure directory exists and auto-seed initial JSON files if missing
   */
  private ensureDirectoryAndFiles(): void {
    if (!fs.existsSync(this.dbDir)) {
      fs.mkdirSync(this.dbDir, { recursive: true });
    }

    // Auto-seed doctors.json
    if (!fs.existsSync(this.doctorsFile)) {
      this.writeJsonAtomic(this.doctorsFile, SEED_CARE_WORKERS);
      console.log(`[DoseSure DB] Seeded ${SEED_CARE_WORKERS.length} doctors into ${this.doctorsFile}`);
    }

    // Auto-seed patients.json
    if (!fs.existsSync(this.patientsFile)) {
      this.writeJsonAtomic(this.patientsFile, SEED_PATIENTS);
      console.log(`[DoseSure DB] Seeded ${SEED_PATIENTS.length} patients into ${this.patientsFile}`);
    }

    // Auto-seed alerts.json
    if (!fs.existsSync(this.alertsFile)) {
      this.writeJsonAtomic(this.alertsFile, SEED_ALERTS);
      console.log(`[DoseSure DB] Seeded ${SEED_ALERTS.length} alerts into ${this.alertsFile}`);
    }

    // Auto-seed doses.json (accumulate baseline patient histories)
    if (!fs.existsSync(this.dosesFile)) {
      const initialDoses: DoseRecord[] = [];
      SEED_PATIENTS.forEach((p) => {
        if (p.history && Array.isArray(p.history)) {
          p.history.forEach((h) => initialDoses.push({ ...h, patientId: p.id }));
        }
      });
      this.writeJsonAtomic(this.dosesFile, initialDoses);
      console.log(`[DoseSure DB] Seeded ${initialDoses.length} dose records into ${this.dosesFile}`);
    }

    // Auto-seed hardware.json
    if (!fs.existsSync(this.hardwareFile)) {
      const initialHardware: Record<string, any> = {
        'BOX01': {
          deviceId: 'BOX01',
          patientId: 'DS-TB-1024',
          patientName: 'Ramesh Kumar',
          status: 'Online',
          compartments: [
            { compartment: 1, slot: 'Morning', hour: 8, minute: 0 },
            { compartment: 2, slot: 'Evening', hour: 20, minute: 0 }
          ],
          windowMinutes: 30,
          lastSync: new Date().toISOString()
        },
        'DSBOX-04': {
          deviceId: 'DSBOX-04',
          patientId: 'DS-TB-1024',
          patientName: 'Ramesh Kumar',
          status: 'Online',
          compartments: [
            { compartment: 1, slot: 'Morning', hour: 8, minute: 0 },
            { compartment: 2, slot: 'Evening', hour: 20, minute: 0 }
          ],
          windowMinutes: 30,
          lastSync: new Date().toISOString()
        }
      };
      this.writeJsonAtomic(this.hardwareFile, initialHardware);
    }
  }

  /**
   * Atomic file writing helper to prevent partial writes
   */
  private writeJsonAtomic(filePath: string, data: any): void {
    const jsonStr = JSON.stringify(data, null, 2);
    try {
      const tmpFile = `${filePath}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpFile, jsonStr, 'utf-8');
      try {
        fs.renameSync(tmpFile, filePath);
      } catch (renameErr) {
        // Fallback for Windows / OneDrive temporary file lock
        fs.writeFileSync(filePath, jsonStr, 'utf-8');
        try { fs.unlinkSync(tmpFile); } catch (_) {}
      }
    } catch (e) {
      fs.writeFileSync(filePath, jsonStr, 'utf-8');
    }
  }

  /**
   * Load all datasets from disk into in-memory index caches
   */
  public loadAllFromDisk(): void {
    try {
      // Load doctors
      if (fs.existsSync(this.doctorsFile)) {
        const raw = fs.readFileSync(this.doctorsFile, 'utf-8');
        const list: CareWorker[] = JSON.parse(raw);
        this.doctorsById.clear();
        list.forEach((doc) => this.doctorsById.set(doc.id, doc));
      }

      // Load patients
      if (fs.existsSync(this.patientsFile)) {
        const raw = fs.readFileSync(this.patientsFile, 'utf-8');
        const list: Patient[] = JSON.parse(raw);
        this.patientsById.clear();
        this.patientsByPillbox.clear();
        list.forEach((p) => {
          this.patientsById.set(p.id, p);
          if (p.pillboxId) this.patientsByPillbox.set(p.pillboxId, p);
        });
      }

      // Load alerts
      if (fs.existsSync(this.alertsFile)) {
        const raw = fs.readFileSync(this.alertsFile, 'utf-8');
        const list: Alert[] = JSON.parse(raw);
        this.alertsById.clear();
        list.forEach((a) => this.alertsById.set(a.id, a));
      }

      // Load doses
      if (fs.existsSync(this.dosesFile)) {
        const raw = fs.readFileSync(this.dosesFile, 'utf-8');
        this.doseRecords = JSON.parse(raw);
      }

      // Load hardware
      if (fs.existsSync(this.hardwareFile)) {
        const raw = fs.readFileSync(this.hardwareFile, 'utf-8');
        this.hardwareData = JSON.parse(raw);
      }

      console.log(`[DoseSure DB] Successfully loaded into memory: ${this.patientsById.size} patients, ${this.doctorsById.size} doctors, ${this.alertsById.size} alerts, ${this.doseRecords.length} doses.`);
    } catch (err) {
      console.error('[DoseSure DB] Error loading database files from disk:', err);
    }
  }

  // ==========================================
  // PATIENT OPERATIONS
  // ==========================================
  public getAllPatients(): Patient[] {
    return Array.from(this.patientsById.values());
  }

  public getPatientById(id: string): Patient | undefined {
    return this.patientsById.get(id);
  }

  public getPatientByPillboxId(pillboxId: string): Patient | undefined {
    return this.patientsByPillbox.get(pillboxId);
  }

  public getPatientByName(name: string): Patient | undefined {
    if (!name) return undefined;
    const clean = name.trim().toLowerCase();
    return Array.from(this.patientsById.values()).find(
      (p) => p.fullName.trim().toLowerCase() === clean
    );
  }

  public savePatient(patient: Patient): Patient {
    this.patientsById.set(patient.id, patient);
    if (patient.pillboxId) {
      this.patientsByPillbox.set(patient.pillboxId, patient);
    }
    this.persistPatients();
    return patient;
  }

  public savePatientsBulk(patients: Patient[]): Patient[] {
    patients.forEach((p) => {
      this.patientsById.set(p.id, p);
      if (p.pillboxId) this.patientsByPillbox.set(p.pillboxId, p);
    });
    this.persistPatients();
    return Array.from(this.patientsById.values());
  }

  public updatePatient(id: string, updates: Partial<Patient>): Patient | null {
    const existing = this.patientsById.get(id);
    if (!existing) return null;

    const updated: Patient = { ...existing, ...updates };
    this.patientsById.set(id, updated);
    if (updated.pillboxId) {
      this.patientsByPillbox.set(updated.pillboxId, updated);
    }
    this.persistPatients();
    return updated;
  }

  public deletePatient(id: string): boolean {
    const existing = this.patientsById.get(id);
    if (!existing) return false;

    this.patientsById.delete(id);
    if (existing.pillboxId) this.patientsByPillbox.delete(existing.pillboxId);
    this.persistPatients();
    return true;
  }

  private persistPatients(): void {
    const list = Array.from(this.patientsById.values());
    this.writeJsonAtomic(this.patientsFile, list);
  }

  // ==========================================
  // DOCTOR / CARE WORKER OPERATIONS
  // ==========================================
  public getAllDoctors(): CareWorker[] {
    return Array.from(this.doctorsById.values());
  }

  public getDoctorById(id: string): CareWorker | undefined {
    return this.doctorsById.get(id);
  }

  public saveDoctor(doctor: CareWorker): CareWorker {
    this.doctorsById.set(doctor.id, doctor);
    this.persistDoctors();
    return doctor;
  }

  public updateDoctor(id: string, updates: Partial<CareWorker>): CareWorker | null {
    const existing = this.doctorsById.get(id);
    if (!existing) return null;

    const updated = { ...existing, ...updates };
    this.doctorsById.set(id, updated);
    this.persistDoctors();
    return updated;
  }

  private persistDoctors(): void {
    const list = Array.from(this.doctorsById.values());
    this.writeJsonAtomic(this.doctorsFile, list);
  }

  // ==========================================
  // ALERT OPERATIONS
  // ==========================================
  public getAllAlerts(): Alert[] {
    return Array.from(this.alertsById.values());
  }

  public saveAlert(alert: Alert): Alert {
    this.alertsById.set(alert.id, alert);
    this.persistAlerts();
    return alert;
  }

  public saveAlertsBulk(alerts: Alert[]): Alert[] {
    alerts.forEach((a) => this.alertsById.set(a.id, a));
    this.persistAlerts();
    return Array.from(this.alertsById.values());
  }

  public updateAlert(id: string, updates: Partial<Alert>): Alert | null {
    const existing = this.alertsById.get(id);
    if (!existing) return null;

    const updated = { ...existing, ...updates };
    this.alertsById.set(id, updated);
    this.persistAlerts();
    return updated;
  }

  private persistAlerts(): void {
    const list = Array.from(this.alertsById.values());
    this.writeJsonAtomic(this.alertsFile, list);
  }

  // ==========================================
  // DOSE & INGESTION RECORD OPERATIONS
  // ==========================================
  public getAllDoses(): DoseRecord[] {
    return this.doseRecords;
  }

  public recordDose(doseRecord: DoseRecord): DoseRecord {
    this.doseRecords.unshift(doseRecord);
    this.persistDoses();

    // If patientId is specified, also link it directly to the patient's history in patients.json
    if (doseRecord.patientId && this.patientsById.has(doseRecord.patientId)) {
      const patient = this.patientsById.get(doseRecord.patientId)!;
      patient.history = [doseRecord, ...(patient.history || [])];
      this.persistPatients();
    }

    return doseRecord;
  }

  private persistDoses(): void {
    this.writeJsonAtomic(this.dosesFile, this.doseRecords);
  }

  // ==========================================
  // HARDWARE STATE OPERATIONS
  // ==========================================
  public getHardwareState(): Record<string, any> {
    return this.hardwareData;
  }

  public saveHardwareState(deviceId: string, data: any): void {
    this.hardwareData[deviceId] = {
      ...(this.hardwareData[deviceId] || {}),
      ...data,
      lastUpdated: new Date().toISOString(),
    };
    this.writeJsonAtomic(this.hardwareFile, this.hardwareData);
  }

  // ==========================================
  // DATABASE STATS & EXPORT / IMPORT
  // ==========================================
  public getDatabaseStats(): DatabaseStats {
    const getFileSize = (filePath: string) => {
      try {
        return fs.statSync(filePath).size;
      } catch {
        return 0;
      }
    };

    return {
      status: 'active',
      storageDirectory: this.dbDir,
      totalPatients: this.patientsById.size,
      totalDoctors: this.doctorsById.size,
      totalAlerts: this.alertsById.size,
      totalDoseRecords: this.doseRecords.length,
      lastUpdated: new Date().toISOString(),
      files: [
        {
          name: 'patients.json',
          path: this.patientsFile,
          sizeBytes: getFileSize(this.patientsFile),
          recordCount: this.patientsById.size,
        },
        {
          name: 'doctors.json',
          path: this.doctorsFile,
          sizeBytes: getFileSize(this.doctorsFile),
          recordCount: this.doctorsById.size,
        },
        {
          name: 'alerts.json',
          path: this.alertsFile,
          sizeBytes: getFileSize(this.alertsFile),
          recordCount: this.alertsById.size,
        },
        {
          name: 'doses.json',
          path: this.dosesFile,
          sizeBytes: getFileSize(this.dosesFile),
          recordCount: this.doseRecords.length,
        },
        {
          name: 'hardware.json',
          path: this.hardwareFile,
          sizeBytes: getFileSize(this.hardwareFile),
          recordCount: Object.keys(this.hardwareData).length,
        },
      ],
    };
  }

  public exportFullDatabase() {
    return {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      doctors: this.getAllDoctors(),
      patients: this.getAllPatients(),
      alerts: this.getAllAlerts(),
      doses: this.getAllDoses(),
      hardware: this.getHardwareState(),
    };
  }

  public syncFromClient(payload: {
    patients?: Patient[];
    alerts?: Alert[];
    doses?: DoseRecord[];
    doctors?: CareWorker[];
  }) {
    if (payload.patients && Array.isArray(payload.patients)) {
      this.savePatientsBulk(payload.patients);
    }
    if (payload.alerts && Array.isArray(payload.alerts)) {
      this.saveAlertsBulk(payload.alerts);
    }
    if (payload.doctors && Array.isArray(payload.doctors)) {
      payload.doctors.forEach((d) => this.saveDoctor(d));
    }
    if (payload.doses && Array.isArray(payload.doses)) {
      payload.doses.forEach((d) => this.recordDose(d));
    }

    return this.exportFullDatabase();
  }
}

export const dbService = new DatabaseService();
