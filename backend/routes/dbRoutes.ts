import { Router, Request, Response } from 'express';
import { dbService } from '../../db/dbService.js';
import { Patient, CareWorker, Alert, DoseRecord } from '../../db/types.js';

export const dbRouter = Router();

// ==========================================
// DB STATS & FULL EXPORT / SYNC
// ==========================================
dbRouter.get('/stats', (_req: Request, res: Response) => {
  try {
    const stats = dbService.getDatabaseStats();
    return res.status(200).json(stats);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed fetching database statistics' });
  }
});

dbRouter.get('/all', (_req: Request, res: Response) => {
  try {
    const data = dbService.exportFullDatabase();
    return res.status(200).json(data);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed retrieving database records' });
  }
});

dbRouter.post('/sync', (req: Request, res: Response) => {
  try {
    const payload = req.body || {};
    const updatedState = dbService.syncFromClient(payload);
    return res.status(200).json({
      status: 'synced',
      message: 'IndexedDB synchronised with server db folder',
      data: updatedState,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Sync failed' });
  }
});

// ==========================================
// PATIENT ENDPOINTS
// ==========================================
dbRouter.get('/patients', (_req: Request, res: Response) => {
  try {
    const patients = dbService.getAllPatients();
    return res.status(200).json(patients);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed reading patients' });
  }
});

dbRouter.get('/patients/:id', (req: Request, res: Response) => {
  try {
    const patient = dbService.getPatientById(req.params.id);
    if (!patient) {
      return res.status(404).json({ error: `Patient with ID ${req.params.id} not found` });
    }
    return res.status(200).json(patient);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed reading patient' });
  }
});

dbRouter.post('/patients', (req: Request, res: Response) => {
  try {
    const patient: Patient = req.body;
    if (!patient || !patient.id || !patient.fullName) {
      return res.status(400).json({ error: 'Patient ID and fullName are required' });
    }
    const saved = dbService.savePatient(patient);
    return res.status(201).json({ status: 'saved', patient: saved });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed saving patient' });
  }
});

dbRouter.put('/patients/:id', (req: Request, res: Response) => {
  try {
    const updates = req.body;
    const updated = dbService.updatePatient(req.params.id, updates);
    if (!updated) {
      return res.status(404).json({ error: `Patient with ID ${req.params.id} not found` });
    }
    return res.status(200).json({ status: 'updated', patient: updated });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed updating patient' });
  }
});

dbRouter.delete('/patients/:id', (req: Request, res: Response) => {
  try {
    const success = dbService.deletePatient(req.params.id);
    if (!success) {
      return res.status(404).json({ error: `Patient with ID ${req.params.id} not found` });
    }
    return res.status(200).json({ status: 'deleted', id: req.params.id });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed deleting patient' });
  }
});

// ==========================================
// DOCTOR / CARE WORKER ENDPOINTS
// ==========================================
dbRouter.get('/doctors', (_req: Request, res: Response) => {
  try {
    const doctors = dbService.getAllDoctors();
    return res.status(200).json(doctors);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed reading doctors' });
  }
});

dbRouter.get('/doctors/:id', (req: Request, res: Response) => {
  try {
    const doctor = dbService.getDoctorById(req.params.id);
    if (!doctor) {
      return res.status(404).json({ error: `Doctor with ID ${req.params.id} not found` });
    }
    return res.status(200).json(doctor);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed reading doctor' });
  }
});

dbRouter.post('/doctors', (req: Request, res: Response) => {
  try {
    const doctor: CareWorker = req.body;
    if (!doctor || !doctor.id || !doctor.name) {
      return res.status(400).json({ error: 'Doctor ID and name are required' });
    }
    const saved = dbService.saveDoctor(doctor);
    return res.status(201).json({ status: 'saved', doctor: saved });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed saving doctor' });
  }
});

dbRouter.put('/doctors/:id', (req: Request, res: Response) => {
  try {
    const updates = req.body;
    const updated = dbService.updateDoctor(req.params.id, updates);
    if (!updated) {
      return res.status(404).json({ error: `Doctor with ID ${req.params.id} not found` });
    }
    return res.status(200).json({ status: 'updated', doctor: updated });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed updating doctor' });
  }
});

// ==========================================
// ALERT ENDPOINTS
// ==========================================
dbRouter.get('/alerts', (_req: Request, res: Response) => {
  try {
    const alerts = dbService.getAllAlerts();
    return res.status(200).json(alerts);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed reading alerts' });
  }
});

dbRouter.post('/alerts', (req: Request, res: Response) => {
  try {
    const alert: Alert = req.body;
    if (!alert || !alert.id || !alert.patientId) {
      return res.status(400).json({ error: 'Alert ID and patientId are required' });
    }
    const saved = dbService.saveAlert(alert);
    return res.status(201).json({ status: 'saved', alert: saved });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed saving alert' });
  }
});

dbRouter.put('/alerts/:id', (req: Request, res: Response) => {
  try {
    const updates = req.body;
    const updated = dbService.updateAlert(req.params.id, updates);
    if (!updated) {
      return res.status(404).json({ error: `Alert with ID ${req.params.id} not found` });
    }
    return res.status(200).json({ status: 'updated', alert: updated });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed updating alert' });
  }
});

// ==========================================
// DOSE RECORD ENDPOINTS
// ==========================================
dbRouter.get('/doses', (_req: Request, res: Response) => {
  try {
    const doses = dbService.getAllDoses();
    return res.status(200).json(doses);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed reading dose history' });
  }
});

dbRouter.post('/doses', (req: Request, res: Response) => {
  try {
    const dose: DoseRecord = req.body;
    if (!dose || !dose.id || !dose.date) {
      return res.status(400).json({ error: 'Dose ID and date are required' });
    }
    const saved = dbService.recordDose(dose);
    return res.status(201).json({ status: 'recorded', dose: saved });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed recording dose' });
  }
});
