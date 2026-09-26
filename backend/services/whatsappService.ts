import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

export interface WhatsAppSendResult {
  success: boolean;
  messageSid?: string;
  recipient?: string;
  error?: string;
  skippedReason?: string;
}

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  toNumber: string;
  contentSid: string;
  isConfigured: boolean;
}

/**
 * DoseSure Twilio WhatsApp Notification Service
 * 
 * Sends WhatsApp notifications when AI video verification is completed.
 * 
 * IMPORTANT FOR TRIAL ACCOUNTS:
 * 1. Go to https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn
 * 2. You'll see a Sandbox number (e.g., +14155238886) and a join code (e.g., "join <word>-<word>")
 * 3. From your WhatsApp (+916380985423), send that join code to the Sandbox number
 * 4. After receiving confirmation, messages will be delivered
 * 5. Update TWILIO_WHATSAPP_NUMBER in backend/.env to the Sandbox number
 */
class WhatsAppNotificationService {
  private lastSentTime: number = 0;

  /**
   * Loads Twilio config directly from backend/.env file
   */
  public getTwilioConfig(): TwilioConfig {
    const backendEnvPath = path.resolve(process.cwd(), 'backend', '.env');
    let envVars: Record<string, string> = {};

    if (fs.existsSync(backendEnvPath)) {
      try {
        const content = fs.readFileSync(backendEnvPath, 'utf-8');
        envVars = dotenv.parse(content);
      } catch (err) {
        console.error('[WhatsApp] Failed to read backend/.env:', err);
      }
    }

    const accountSid = envVars['TWILIO_ACCOUNT_SID'] || process.env['TWILIO_ACCOUNT_SID'] || '';
    const authToken = envVars['TWILIO_AUTH_TOKEN'] || process.env['TWILIO_AUTH_TOKEN'] || '';
    const fromNumber = envVars['TWILIO_WHATSAPP_NUMBER'] || process.env['TWILIO_WHATSAPP_NUMBER'] || '';
    const toNumber = envVars['TWILIO_TO_NUMBER'] || process.env['TWILIO_TO_NUMBER'] || '';
    const contentSid = envVars['TWILIO_CONTENT_SID'] || process.env['TWILIO_CONTENT_SID'] || '';

    return {
      accountSid,
      authToken,
      fromNumber,
      toNumber,
      contentSid,
      isConfigured: Boolean(accountSid && authToken && fromNumber && toNumber),
    };
  }

  /**
   * Send WhatsApp message using Twilio REST API.
   * 
   * Strategy (tries in order):
   * 1. ContentSid template (for WhatsApp Business API)
   * 2. Plain body text (for Sandbox / Trial accounts)
   * 3. Sandbox number fallback with body text
   */
  private async sendMessage(config: TwilioConfig, bodyText: string): Promise<WhatsAppSendResult> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;
    const authHeader = 'Basic ' + Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64');

    // ---------- ATTEMPT 1: ContentSid template ----------
    if (config.contentSid) {
      console.log(`[WhatsApp] Attempt 1: Sending with ContentSid template...`);
      const params1 = new URLSearchParams();
      params1.append('To', config.toNumber);
      params1.append('From', config.fromNumber);
      params1.append('ContentSid', config.contentSid);

      try {
        const res1 = await fetch(url, {
          method: 'POST',
          headers: { 'Authorization': authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params1.toString(),
        });
        const data1 = await res1.json() as any;

        if (res1.ok && data1.sid) {
          console.log(`[WhatsApp] ✅ ContentSid message accepted! SID: ${data1.sid}`);
          // Check if it's actually going to be delivered (trial accounts may accept but not deliver)
          return { success: true, messageSid: data1.sid, recipient: config.toNumber };
        }
        console.warn(`[WhatsApp] ContentSid failed (${res1.status}): ${data1.message || JSON.stringify(data1)}`);
      } catch (err: any) {
        console.warn(`[WhatsApp] ContentSid error:`, err.message);
      }
    }

    // ---------- ATTEMPT 2: Plain body text with configured From number ----------
    console.log(`[WhatsApp] Attempt 2: Sending with plain body text from ${config.fromNumber}...`);
    const params2 = new URLSearchParams();
    params2.append('To', config.toNumber);
    params2.append('From', config.fromNumber);
    params2.append('Body', bodyText);

    try {
      const res2 = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params2.toString(),
      });
      const data2 = await res2.json() as any;

      if (res2.ok && data2.sid) {
        console.log(`[WhatsApp] ✅ Body text message sent! SID: ${data2.sid}, Status: ${data2.status}`);
        return { success: true, messageSid: data2.sid, recipient: config.toNumber };
      }
      console.warn(`[WhatsApp] Body text failed (${res2.status}): ${data2.message || JSON.stringify(data2)}`);
      
      // If error is about ContentSid required (21654), try sandbox
      if (data2.code === 21654 || data2.code === 63032) {
        console.log(`[WhatsApp] Twilio requires template. Trying Sandbox fallback...`);
      }
    } catch (err: any) {
      console.warn(`[WhatsApp] Body text error:`, err.message);
    }

    // ---------- ATTEMPT 3: Twilio Sandbox number fallback ----------
    const sandboxNumber = 'whatsapp:+14155238886';
    if (config.fromNumber !== sandboxNumber) {
      console.log(`[WhatsApp] Attempt 3: Trying Twilio Sandbox number (${sandboxNumber})...`);
      const params3 = new URLSearchParams();
      params3.append('To', config.toNumber);
      params3.append('From', sandboxNumber);
      params3.append('Body', bodyText);

      try {
        const res3 = await fetch(url, {
          method: 'POST',
          headers: { 'Authorization': authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params3.toString(),
        });
        const data3 = await res3.json() as any;

        if (res3.ok && data3.sid) {
          console.log(`[WhatsApp] ✅ Sandbox message sent! SID: ${data3.sid}, Status: ${data3.status}`);
          return { success: true, messageSid: data3.sid, recipient: config.toNumber };
        }
        console.warn(`[WhatsApp] Sandbox failed (${res3.status}): ${data3.message || JSON.stringify(data3)}`);
      } catch (err: any) {
        console.warn(`[WhatsApp] Sandbox error:`, err.message);
      }
    }

    // All attempts failed
    console.error('\n============================================================');
    console.error('[WhatsApp] ❌ ALL ATTEMPTS FAILED — MESSAGE NOT DELIVERED');
    console.error('============================================================');
    console.error('[WhatsApp] Your Twilio account is a TRIAL account.');
    console.error('[WhatsApp] To receive WhatsApp messages, you MUST:');
    console.error('[WhatsApp]');
    console.error('[WhatsApp]   1. Go to: https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn');
    console.error('[WhatsApp]   2. Find your Sandbox number and join code');
    console.error('[WhatsApp]   3. From WhatsApp on +916380985423, send the join code');
    console.error('[WhatsApp]      (e.g., send "join magic-pizza" to +14155238886)');
    console.error('[WhatsApp]   4. Wait for confirmation message');
    console.error('[WhatsApp]   5. Update TWILIO_WHATSAPP_NUMBER in backend/.env to: whatsapp:+14155238886');
    console.error('[WhatsApp]   6. Restart the server');
    console.error('============================================================\n');

    return { success: false, error: 'All delivery attempts failed. See console for Twilio Trial setup instructions.' };
  }

  /**
   * PILLBOX NOTIFICATION — Suppressed per user request.
   */
  public async sendPillboxOpenedNotification(options: {
    patientName: string;
    compartment: number;
    slot?: string;
    recipientPhone?: string;
  }): Promise<WhatsAppSendResult> {
    return { success: true, skippedReason: 'NOTIFICATION_RESTRICTED_TO_AI_VERIFICATION' };
  }

  /**
   * AI VERIFICATION SUCCESS NOTIFICATION
   * 
   * Called ONLY when the page shows "MEDICINE TAKEN ✓"
   */
  public async sendAiVerificationSuccessNotification(options: {
    patientName: string;
    doseSlot?: string;
    recipientPhone?: string;
  }): Promise<WhatsAppSendResult> {
    const config = this.getTwilioConfig();

    if (!config.isConfigured) {
      console.warn('[WhatsApp] ⚠️ Twilio not configured. Check backend/.env');
      return { success: false, skippedReason: 'TWILIO_NOT_CONFIGURED' };
    }

    // Debounce: skip if sent within last 30 seconds
    const now = Date.now();
    if (now - this.lastSentTime < 30000) {
      console.log('[WhatsApp] Debounced (sent within last 30s)');
      return { success: true, skippedReason: 'DEBOUNCED' };
    }
    this.lastSentTime = now;

    // Override recipient if provided
    if (options.recipientPhone) {
      const phone = options.recipientPhone.trim();
      config.toNumber = phone.startsWith('whatsapp:') ? phone : `whatsapp:${phone.startsWith('+') ? '' : '+91'}${phone}`;
    }

    console.log(`\n========================================`);
    console.log(`[WhatsApp] 💊 AI Verification Complete!`);
    console.log(`[WhatsApp] Patient: ${options.patientName}`);
    console.log(`[WhatsApp] Dose: ${options.doseSlot || 'Scheduled'}`);
    console.log(`[WhatsApp] Sending to: ${config.toNumber}`);
    console.log(`[WhatsApp] From: ${config.fromNumber}`);
    console.log(`========================================\n`);

    const bodyMessage = `💊 DoseSure — ai video verification done\n\nPatient: ${options.patientName}\nDose: ${options.doseSlot || 'Scheduled'}\nStatus: ✅ Medication intake verified by AI\n\n— DoseSure Medication Monitoring`;

    return await this.sendMessage(config, bodyMessage);
  }
}

export const whatsappService = new WhatsAppNotificationService();
