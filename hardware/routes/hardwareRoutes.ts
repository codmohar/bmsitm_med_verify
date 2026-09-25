import { Router, Request, Response } from 'express';
import { hardwareService, HardwareEventPayload } from '../services/hardwareService.js';

export const hardwareRouter = Router();

// ========================================================
// PHASE 3 — BASIC CONNECTIVITY PING TEST
// ========================================================
hardwareRouter.get('/ping', (req: Request, res: Response) => {
  const deviceId = (req.query.deviceId as string) || 'BOX01';
  const clientIp = req.headers['x-forwarded-for']?.toString() || req.socket.remoteAddress || '';
  const result = hardwareService.registerPing(deviceId, clientIp);
  return res.status(200).json({
    status: 'ok',
    message: 'Backend connection successful.',
    deviceId,
    clientIp,
    timestamp: result.timestamp,
  });
});

hardwareRouter.post('/ping', (req: Request, res: Response) => {
  const deviceId = req.body?.deviceId || req.body?.device_id || 'BOX01';
  const clientIp = req.headers['x-forwarded-for']?.toString() || req.socket.remoteAddress || '';
  const result = hardwareService.registerPing(deviceId, clientIp);
  return res.status(200).json({
    status: 'ok',
    message: 'Backend connection successful.',
    deviceId,
    clientIp,
    timestamp: result.timestamp,
  });
});

// ========================================================
// PHASE 4 — DYNAMIC SCHEDULE ENDPOINT
// ========================================================
hardwareRouter.get('/schedule', (req: Request, res: Response) => {
  const deviceId = (req.query.deviceId as string) || 'BOX01';
  const schedule = hardwareService.getSchedule(deviceId);
  return res.status(200).json(schedule);
});

// Update schedule dynamically (from frontend UI or care worker)
hardwareRouter.post('/schedule', (req: Request, res: Response) => {
  const { deviceId, dose1Hour, dose1Minute, dose2Hour, dose2Minute, windowMinutes, patientName, patientId } = req.body || {};
  if (dose1Hour === undefined || dose1Minute === undefined || dose2Hour === undefined || dose2Minute === undefined) {
    return res.status(400).json({
      error: 'dose1Hour, dose1Minute, dose2Hour, and dose2Minute are required integer values.',
    });
  }
  const updated = hardwareService.updateSchedule(
    deviceId || 'BOX01',
    Number(dose1Hour),
    Number(dose1Minute),
    Number(dose2Hour),
    Number(dose2Minute),
    windowMinutes ? Number(windowMinutes) : undefined,
    patientName,
    patientId
  );
  return res.status(200).json({
    status: 'updated',
    schedule: updated,
  });
});

// Explicit device-to-patient assignment endpoint
hardwareRouter.post('/assign', (req: Request, res: Response) => {
  const { deviceId, patientId } = req.body || {};
  if (!deviceId || !patientId) {
    return res.status(400).json({ error: 'deviceId and patientId are required.' });
  }
  try {
    const updated = hardwareService.assignPatient(deviceId, patientId);
    return res.status(200).json({
      status: 'assigned',
      schedule: updated,
    });
  } catch (err: any) {
    return res.status(404).json({ error: err.message || 'Failed to assign device' });
  }
});

// Real-time synchronization with currently OPEN website patient page
hardwareRouter.post('/active-patient', (req: Request, res: Response) => {
  const { patientId, deviceId, dose1Hour, dose1Minute, dose2Hour, dose2Minute, windowMinutes } = req.body || {};
  if (!patientId) {
    return res.status(400).json({ error: 'patientId is required' });
  }
  try {
    const customSched = (dose1Hour !== undefined && dose2Hour !== undefined) ? {
      dose1Hour: Number(dose1Hour),
      dose1Minute: Number(dose1Minute),
      dose2Hour: Number(dose2Hour),
      dose2Minute: Number(dose2Minute),
      windowMinutes: windowMinutes ? Number(windowMinutes) : undefined,
    } : undefined;
    const schedule = hardwareService.setActivePatient(patientId, deviceId || 'BOX01', customSched);
    return res.status(200).json({ status: 'active_patient_set', schedule });
  } catch (err: any) {
    return res.status(404).json({ error: err.message || 'Failed to set active patient' });
  }
});

// ========================================================
// PHASE 7 & 8 — LDR HARDWARE EVENT & IDEMPOTENCY ENDPOINT
// ========================================================
hardwareRouter.post('/event', (req: Request, res: Response) => {
  const payload: HardwareEventPayload = req.body || {};
  if (!payload.event_id || !payload.device_id || payload.compartment === undefined) {
    return res.status(400).json({
      error: 'event_id, device_id, and compartment are required.',
    });
  }

  const result = hardwareService.recordEvent(payload);
  return res.status(200).json(result);
});

// Device status inspect
hardwareRouter.get('/status', (req: Request, res: Response) => {
  const deviceId = (req.query.deviceId as string) || 'BOX01';
  const status = hardwareService.getDeviceStatus(deviceId);
  return res.status(200).json(status);
});

// Live ESP32 Telemetry streaming endpoint (GET & POST)
hardwareRouter.get('/telemetry', (req: Request, res: Response) => {
  const deviceId = (req.query.deviceId as string) || 'BOX01';
  const telemetry = hardwareService.getTelemetry(deviceId);
  return res.status(200).json(telemetry);
});

hardwareRouter.post('/telemetry', (req: Request, res: Response) => {
  const updated = hardwareService.updateTelemetry(req.body || {});
  return res.status(200).json({ status: 'ok', telemetry: updated });
});

// Real-time serial log pipe from Web Serial or bridge
hardwareRouter.post('/serial-log', (req: Request, res: Response) => {
  const { deviceId, logLine } = req.body || {};
  if (!logLine) return res.status(400).json({ error: 'logLine is required' });
  const logs = hardwareService.appendSerialLog(deviceId || 'BOX01', logLine);
  return res.status(200).json({ status: 'ok', logs });
});
