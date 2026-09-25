import { VideoVerificationRequest, VideoVerificationResponse } from '../types.js';
import { verifyWithGemini, verifyPillPresenceInHand, isGeminiAvailable } from './geminiService.js';
import { verifyWithOpenAI, isOpenAiAvailable } from './openAiService.js';
import { verifyWithClinicalCVEngine } from './computerVisionService.js';

export interface ProviderStatus {
  gemini: boolean;
  openai: boolean;
  huggingface: boolean;
  clinical_cv_engine: boolean;
}

export function getAvailableProviders(): ProviderStatus {
  return {
    gemini: isGeminiAvailable(),
    openai: isOpenAiAvailable(),
    huggingface: false, // Disabled per user instruction: Use Gemini API to analyse, not Hugging Face
    clinical_cv_engine: true,
  };
}

export async function executeAiVerification(
  req: VideoVerificationRequest
): Promise<VideoVerificationResponse> {
  console.log('--- Clinical AI Video Verification Starting (Gemini API Vision Pipeline) ---');
  const expectedMed = req.expectedMedicineName || 'Prescribed Oral Tablet/Capsule';
  const presentationFrames = (req.keyFrames || []).slice(0, 3);

  // 1. Run local optical Computer Vision frame analysis as baseline
  const cvRes = verifyWithClinicalCVEngine(req);
  console.log('Clinical CV baseline evaluation:', {
    medicine_detected: cvRes.events.medicine_detected,
    hand_to_mouth: cvRes.events.medicine_to_mouth,
    mouth_interaction: cvRes.events.mouth_interaction,
    hand_empty: cvRes.events.hand_empty,
    status: cvRes.status,
  });

  // 2. Primary: Google Gemini Vision Multimodal Pipeline
  if (isGeminiAvailable()) {
    try {
      // STAGE 1: Isolated Gate 1 Pill Presence Audit via Gemini Vision
      // Evaluates presentation frames (held between fingers or resting on palm)
      if (presentationFrames.length > 0) {
        console.log('--- STAGE 1: Auditing Physical Pill Presence in Hand via Gemini Vision ---');
        const gate1 = await verifyPillPresenceInHand(presentationFrames, expectedMed);
        console.log('Gemini Gate 1 Audit Result:', gate1);

        // Enforce Gate 1 rejection if confirmed empty hand, empty pinch air, or bare palm
        if (!gate1.pill_detected && (gate1.visual_evidence === 'EMPTY_PINCH_AIR' || gate1.visual_evidence === 'EMPTY_PALM') && !cvRes.events.medicine_detected) {
          console.warn('REJECTION: Gemini Gate 1 confirmed empty hand / empty pinch air before hand gesture to mouth.');
          return {
            status: 'MEDICINE_NOT_TAKEN',
            verified: false,
            confidence: 0.98,
            sequence_valid: false,
            events: {
              medicine_detected: false,
              medicine_to_mouth: false,
              mouth_interaction: false,
              hand_empty: false,
              water_intake: req.realtimeEvents?.water_intake || false,
            },
            timestamps: {
              medicine_detected: null,
              medicine_to_mouth: null,
              mouth_interaction: null,
              hand_empty: null,
              water_intake: req.realtimeEvents?.water_intake ? (req.realtimeTimestamps?.water_intake || '00:16') : null,
            },
            step_confidences: {
              medicine_confidence: 0.15,
              hand_to_mouth_confidence: 0.20,
              mouth_interaction_confidence: 0.20,
              hand_empty_confidence: 0.30,
              water_confidence: req.realtimeEvents?.water_intake ? 0.85 : 0.20,
            },
            medicine_details: {
              detected_name: expectedMed,
              appearance: `None (${gate1.visual_evidence})`,
              color: 'None',
              shape: 'None',
              confidence: 0.15,
              notes: `Verification rejected at Step 1: Hand was empty when presented to camera (${gate1.detailed_inspection}).`,
              hand_pill_detected: false,
            },
            failed_step: 'medicine_detected',
            explanation: `Clinical verification rejected at Step 1 by Google Gemini Vision: No medication detected in hand (${gate1.visual_evidence}). Patient presented an empty hand or pinched empty air before moving hand to mouth. An actual solid pill/tablet must be visibly held in fingers or on palm to verify intake.`,
            message: 'Medication not verified: Hand was empty when presented to camera. No pill was held in fingers or palm.',
            model_used: 'Google Gemini Vision (Gate 1 Forensic Audit)',
            ai_provider: 'gemini',
          };
        }
      }

      // STAGE 2: Pill is verified in hand! Now examine full ingestion sequence via Gemini Vision:
      console.log('--- STAGE 2: Auditing Full Ingestion Sequence via Google Gemini Vision ---');
      const geminiRes = await verifyWithGemini(req);
      if (geminiRes) {
        console.log('Gemini verification completed. Status:', geminiRes.status, 'failed_step:', geminiRes.failed_step);
        return geminiRes;
      }
    } catch (e: any) {
      console.warn('Gemini attempt encountered error:', e?.message || e);
    }
  }

  // 3. Fallback: Local Clinical Computer Vision Engine
  console.log('Using Local Clinical Computer Vision Engine result.');
  return cvRes;
}
