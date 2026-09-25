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
  const { deviceId, dose1Hour, dose1Minute, dose2Hour, dose2Minute, windowMinutes } = req.body || {};
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
    windowMinutes ? Number(windowMinutes) : undefined
  );
  return res.status(200).json({
    status: 'updated',
    schedule: updated,
  });
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
