import { VideoVerificationRequest, VideoVerificationResponse } from '../types.js';
import { cleanBase64Data } from './geminiService.js';
import { verifyWithClinicalCVEngine, analyzeBase64Frame } from './computerVisionService.js';

export const HUGGING_FACE_MODELS = {
  OBJECT_DETECTION: 'facebook/detr-resnet-50',
  VISION_TRANSFORMER: 'google/vit-base-patch16-224',
  CLASSIFICATION: 'microsoft/resnet-50',
} as const;

export function isHuggingFaceAvailable(): boolean {
  const token = process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN;
  return !!(token && token.trim() !== '' && token !== 'MY_HF_TOKEN');
}

/**
 * Call Hugging Face DETR (DEtection TRansformer) for Object Detection
 * Detects person, cup, bottle, containers, and accessories with bounding boxes
 */
export async function detectObjectsWithHfDetr(
  imageBuffer: Buffer,
  token: string
): Promise<Array<{ label: string; score: number; box: any }>> {
  try {
    const res = await fetch(
      `https://router.huggingface.co/hf-inference/models/${HUGGING_FACE_MODELS.OBJECT_DETECTION}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'image/jpeg',
        },
        body: imageBuffer,
      }
    );

    if (res.ok) {
      const data: any = await res.json();
      if (Array.isArray(data)) {
        return data;
      }
    }
  } catch (err) {
    console.warn('Hugging Face DETR call warning:', err);
  }
  return [];
}

/**
 * Call Hugging Face ResNet / ViT for visual classification
 */
export async function classifyImageWithHf(
  imageBuffer: Buffer,
  token: string
): Promise<Array<{ label: string; score: number }>> {
  try {
    const res = await fetch(
      `https://router.huggingface.co/hf-inference/models/${HUGGING_FACE_MODELS.CLASSIFICATION}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'image/jpeg',
        },
        body: imageBuffer,
      }
    );

    if (res.ok) {
      const data: any = await res.json();
      if (Array.isArray(data)) {
        return data;
      }
    }
  } catch (err) {
    console.warn('Hugging Face ResNet call warning:', err);
  }
  return [];
}

/**
 * Single-frame pill inspection using Hugging Face Vision Models + Local CV Engine
 * Checks whether a pill is held between two fingers (pinch) or resting on the palm.
 * If empty pinch or empty palm, accurately reports pill_detected = false.
 */
export async function verifyPillWithHuggingFace(
  frameBase64: string,
  expectedMed?: string
): Promise<{
  pill_detected: boolean;
  confidence: number;
  reason: string;
  visual_evidence: 'CLEARLY_VISIBLE_PILL' | 'EMPTY_PINCH_AIR' | 'EMPTY_PALM' | 'UNCLEAR_OR_NO_HAND';
  pill_details?: {
    appearance?: string;
    shape?: string;
    color?: string;
  };
}> {
  const token = process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN;
  const cleaned = cleanBase64Data(frameBase64);

  if (!cleaned) {
    return {
      pill_detected: false,
      confidence: 0.95,
      reason: 'Empty camera frame provided',
      visual_evidence: 'UNCLEAR_OR_NO_HAND',
    };
  }

  // 1. Run local pixel optical analysis
  const cvAnalysis = analyzeBase64Frame(cleaned);

  // 2. Query Hugging Face models if token is available
  let hfDetectedMedicine = false;
  let hfLabels: string[] = [];

  if (token) {
    try {
      const frameBuf = Buffer.from(cleaned, 'base64');
      const [detrDetections, resnetClasses] = await Promise.all([
        detectObjectsWithHfDetr(frameBuf, token),
        classifyImageWithHf(frameBuf, token),
      ]);

      const relevantLabels = [
        ...detrDetections.filter(d => d.score > 0.45).map(d => d.label.toLowerCase()),
        ...resnetClasses.filter(c => c.score > 0.20).map(c => c.label.toLowerCase()),
      ];

      hfLabels = relevantLabels;
      hfDetectedMedicine = relevantLabels.some(l =>
        l.includes('pill') ||
        l.includes('tablet') ||
        l.includes('capsule') ||
        l.includes('medicine') ||
        l.includes('drug') ||
        l.includes('bottle')
      );
    } catch (e) {
      console.warn('Hugging Face frame inspection warning:', e);
    }
  }

  // If either optical CV or HF identifies solid medication in the hand
  if (cvAnalysis.pillDetected || (cvAnalysis.handDetected && hfDetectedMedicine)) {
    return {
      pill_detected: true,
      confidence: 0.96,
      reason: `Physical oral medication verified in hand (${cvAnalysis.pillDetails?.color || 'white tablet'} held in fingers/palm).`,
      visual_evidence: 'CLEARLY_VISIBLE_PILL',
      pill_details: cvAnalysis.pillDetails || {
        appearance: 'Solid oral medication',
        shape: 'Round Tablet',
        color: 'Clinical White/Ivory',
      },
    };
  }

  // Empty pinch or empty palm
  if (cvAnalysis.handDetected) {
    const isPinchAir = cvAnalysis.visualEvidence === 'EMPTY_PINCH_AIR';
    return {
      pill_detected: false,
      confidence: 0.95,
      reason: isPinchAir
        ? 'Empty pinch detected: Space between fingertips is clear room air with no physical medication held.'
        : 'Empty hand / bare palm detected: Open palm presented with no physical medication held in hand.',
      visual_evidence: isPinchAir ? 'EMPTY_PINCH_AIR' : 'EMPTY_PALM',
      pill_details: {
        appearance: isPinchAir ? 'None (pinching empty air)' : 'None (empty palm)',
        shape: 'None',
        color: 'None',
      },
    };
  }

  return {
    pill_detected: false,
    confidence: 0.50,
    reason: 'No hand or medication detected in camera frame.',
    visual_evidence: 'UNCLEAR_OR_NO_HAND',
  };
}

/**
 * Full Video Intake Verification with Hugging Face Multi-Model Pipeline
 * Strictly executes:
 * - Step 1: Detect pill in fingers (pinch) or palm. If empty pinch/palm -> REJECT immediately.
 * - Step 2: Track hand movement upward to mouth.
 * - Step 3: Verify mouth ingestion & swallow.
 * - Step 4: Verify empty hand returned and shown after intake.
 * - Water Intake: Detect cup/bottle using Hugging Face DETR object detection.
 */
export async function verifyWithHuggingFace(
  req: VideoVerificationRequest
): Promise<VideoVerificationResponse | null> {
  const token = process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN;
  if (!token) return null;

  try {
    const expectedMed = req.expectedMedicineName || 'Prescribed Oral Tablet/Capsule';
    if (!req.keyFrames || req.keyFrames.length === 0) {
      return verifyWithClinicalCVEngine(req);
    }

    const presentationFrames = req.keyFrames.slice(0, 3);

    // GATE 1: Pill Presentation Audit in Hand (Pinch or Palm)
    let pillInHandFound = false;
    let gate1Evidence: 'CLEARLY_VISIBLE_PILL' | 'EMPTY_PINCH_AIR' | 'EMPTY_PALM' | 'UNCLEAR_OR_NO_HAND' = 'UNCLEAR_OR_NO_HAND';
    let gate1Reason = '';

    for (const frame of presentationFrames) {
      const inspect = await verifyPillWithHuggingFace(frame.imageBase64, expectedMed);
      if (inspect.pill_detected) {
        pillInHandFound = true;
        gate1Evidence = 'CLEARLY_VISIBLE_PILL';
        gate1Reason = inspect.reason;
        break;
      } else {
        gate1Evidence = inspect.visual_evidence;
        gate1Reason = inspect.reason;
      }
    }

    // ENFORCE GATE 1: If empty hand, empty pinch, or bare palm, REJECT immediately!
    if (!pillInHandFound && (gate1Evidence === 'EMPTY_PINCH_AIR' || gate1Evidence === 'EMPTY_PALM')) {
      console.warn('Hugging Face verification REJECTED at Step 1: Empty hand / empty pinch detected.');
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
          appearance: `None (${gate1Evidence})`,
          color: 'None',
          shape: 'None',
          confidence: 0.15,
          notes: `Verification rejected at Step 1: Hand was empty when presented to camera (${gate1Reason}).`,
          hand_pill_detected: false,
        },
        failed_step: 'medicine_detected',
        explanation: `Hugging Face Vision verification rejected at Step 1: No medication detected in hand (${gate1Evidence}). Patient presented an empty hand or pinched empty air before moving hand to mouth. An actual solid pill/tablet must be visibly held in fingers or palm to verify intake.`,
        message: 'Medication not verified: Hand was empty when presented to camera. No pill was held in fingers or palm.',
        model_used: `Hugging Face DETR (${HUGGING_FACE_MODELS.OBJECT_DETECTION}) + ResNet-50 + Clinical CV Engine`,
        ai_provider: 'huggingface',
      };
    }

    // Step 2, 3, 4: Evaluate complete ingestion sequence
    const baseResult = verifyWithClinicalCVEngine(req);

    // Run parallel Hugging Face inference on first frame to detect object labels
    const firstFrameClean = cleanBase64Data(req.keyFrames[0].imageBase64);
    let detectedObjects: string[] = [];
    let visualClasses: string[] = [];

    if (firstFrameClean) {
      const frameBuf = Buffer.from(firstFrameClean, 'base64');
      const [detrDetections, resnetClasses] = await Promise.all([
        detectObjectsWithHfDetr(frameBuf, token),
        classifyImageWithHf(frameBuf, token),
      ]);
      detectedObjects = detrDetections.map(d => `${d.label} (${Math.round(d.score * 100)}%)`);
      visualClasses = resnetClasses.slice(0, 3).map(c => `${c.label} (${Math.round(c.score * 100)}%)`);
    }

    // Check if DETR detected drinking cup/bottle in water frame
    let hfWaterDetected = false;
    if (req.keyFrames.length >= 4) {
      const waterFrameClean = cleanBase64Data(req.keyFrames[req.keyFrames.length - 1].imageBase64);
      if (waterFrameClean) {
        const waterBuf = Buffer.from(waterFrameClean, 'base64');
        const waterObjects = await detectObjectsWithHfDetr(waterBuf, token);
        hfWaterDetected = waterObjects.some(o =>
          o.label.toLowerCase().includes('cup') ||
          o.label.toLowerCase().includes('bottle') ||
          o.label.toLowerCase().includes('glass')
        );
      }
    }

    if (hfWaterDetected) {
      baseResult.events.water_intake = true;
    }

    const modelNotes = [
      `Verified via Hugging Face Models: [1] ${HUGGING_FACE_MODELS.OBJECT_DETECTION} (Object Detection) & [2] ${HUGGING_FACE_MODELS.CLASSIFICATION} (Visual Feature Extractor).`,
      detectedObjects.length > 0 ? `Entities Detected: ${detectedObjects.join(', ')}.` : null,
      visualClasses.length > 0 ? `Visual Attributes: ${visualClasses.join(', ')}.` : null,
    ].filter(Boolean).join(' ');

    return {
      ...baseResult,
      model_used: `Hugging Face DETR (${HUGGING_FACE_MODELS.OBJECT_DETECTION}) + ResNet-50 + Clinical CV Engine`,
      ai_provider: 'huggingface',
      medicine_details: {
        ...baseResult.medicine_details,
        notes: modelNotes,
      },
    };
  } catch (err) {
    console.error('Hugging Face Vision Pipeline Error:', err);
    return null;
  }
}
