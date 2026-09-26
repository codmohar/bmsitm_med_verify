import { Router, Request, Response } from 'express';
import { whatsappService } from '../services/whatsappService.js';

export const whatsappRouter = Router();

/**
 * Health & configuration status of Twilio WhatsApp service
 */
whatsappRouter.get('/status', (_req: Request, res: Response) => {
  const config = whatsappService.getTwilioConfig();
  return res.status(200).json({
    isConfigured: config.isConfigured,
    accountSidConfigured: Boolean(config.accountSid),
    accountSidPreview: config.accountSid ? `${config.accountSid.substring(0, 6)}...` : null,
    authTokenConfigured: Boolean(config.authToken),
    fromNumber: config.fromNumber,
    defaultToNumber: config.defaultToNumber,
    envLocationsChecked: ['backend/.env', '.env'],
  });
});

/**
 * Manual test trigger for Pillbox notification
 */
whatsappRouter.post('/test/pillbox', async (req: Request, res: Response) => {
  try {
    const { patientName, compartment, slot, recipientPhone } = req.body || {};
    const result = await whatsappService.sendPillboxOpenedNotification({
      patientName: patientName || 'Test Patient',
      compartment: compartment || 1,
      slot: slot || 'Morning',
      recipientPhone,
    });
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || String(error) });
  }
});

/**
 * Called by the frontend when the page shows "MEDICINE TAKEN ✓"
 * This is the ONLY trigger for WhatsApp notifications.
 */
whatsappRouter.post('/notify-verification-done', async (req: Request, res: Response) => {
  try {
    const { patientName, doseSlot, recipientPhone } = req.body || {};
    console.log(`[WhatsApp Route] Frontend reported MEDICINE TAKEN for: ${patientName || 'Unknown'}`);
    const result = await whatsappService.sendAiVerificationSuccessNotification({
      patientName: patientName || 'Patient',
      doseSlot: doseSlot || 'Scheduled',
      recipientPhone,
    });
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || String(error) });
  }
});

/**
 * Manual test trigger for AI Verification notification
 */
whatsappRouter.post('/test/ai-verification', async (req: Request, res: Response) => {
  try {
    const { patientName, doseSlot, recipientPhone } = req.body || {};
    const result = await whatsappService.sendAiVerificationSuccessNotification({
      patientName: patientName || 'Test Patient',
      doseSlot: doseSlot || 'Morning',
      recipientPhone,
    });
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || String(error) });
  }
});
