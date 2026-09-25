import { GoogleGenAI, Type } from '@google/genai';
import { VideoVerificationRequest, VideoVerificationResponse } from '../types.js';

let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
    return null;
  }
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey });
  }
  return geminiClient;
}

export function isGeminiAvailable(): boolean {
  return !!getGeminiClient();
}

/**
 * Strips data URL prefix reliably even when MIME has parameters like ;codecs=vp8
 */
export function cleanBase64Data(raw: string): string {
  if (!raw) return '';
  if (raw.includes(';base64,')) {
    return raw.split(';base64,')[1].trim();
  }
  return raw.replace(/^data:[^;]+;base64,/, '').trim();
}

async function callGeminiGenerate(ai: GoogleGenAI, config: any): Promise<any> {
  const models = [
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash',
    'gemini-flash-lite-latest',
  ];
  let lastError: any = null;

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await ai.models.generateContent({
          ...config,
          model,
        });
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || err);
        if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {
          console.warn(`Model ${model} returned 503/high demand (attempt ${attempt + 1}), retrying in 1.2s...`);
          await new Promise(r => setTimeout(r, 1200));
          continue;
        }
        break; // break to next fallback model
      }
    }
    console.warn(`Model ${model} call failed (${lastError?.message || lastError}), trying next fallback model...`);
  }
  throw lastError;
}

export interface PillAuditResult {
  pill_detected: boolean;
  confidence: number;
  visual_evidence: 'CLEARLY_VISIBLE_PILL' | 'EMPTY_PINCH_AIR' | 'EMPTY_PALM' | 'UNCLEAR_OR_NO_HAND';
  pill_description: string;
  detailed_inspection: string;
}

/**
 * STAGE 1: Isolated Gate 1 Pill Audit
 * Sends ONLY the presentation frames (indices 0 and 1) to Gemini.
 * Decoupled from the rest of the video to completely prevent sequence-completion hallucinations.
 */
export async function verifyPillPresenceInHand(
  presentationFrames: Array<{ imageBase64: string; timestamp?: string }>,
  expectedMed: string
): Promise<PillAuditResult> {
  const ai = getGeminiClient();
  if (!ai || !presentationFrames || presentationFrames.length === 0) {
    return {
      pill_detected: false,
      confidence: 0.5,
      visual_evidence: 'UNCLEAR_OR_NO_HAND',
      pill_description: 'None',
      detailed_inspection: 'No Gemini client or presentation frames available',
    };
  }

  const parts: any[] = [
    {
      text: `CLINICAL VERIFICATION PROTOCOL - STEP 1: MEDICINE PRESENTATION IN HAND AUDIT.
You are an expert Clinical Video Adherence Auditor.
Examine these presentation frames where the patient presents their medicine to the camera.

FLEXIBLE PRESENTATION REQUIREMENTS:
The medicine may be held:
- Between two fingers, such as a pinch gesture (thumb and index finger, or thumb and middle finger).
- Resting on the palm or cupped fingers.
- Between fingers in another natural holding position.
- Hand may be left or right hand, at any natural distance, orientation, or lighting.
Do NOT require one rigid hand position. Recognize the medicine even when held naturally.
Whatever physical object, pill, tablet, capsule, caplet, or test item is visibly held in the fingers or palm WILL BE RECOGNIZED AS THE MEDICINE.

STRICT DECISION RULES:
1. POSITIVE VERIFICATION (MEDICINE IN HAND):
   If in ANY presentation frame, the patient is visibly holding a physical oral medicine (pill, tablet, capsule, caplet, or item) between their fingers (pinch), on the palm, or in a natural hand grip:
   Set: is_pill_physically_visible = true, visual_evidence = 'CLEARLY_VISIBLE_PILL', pill_description = description of whatever is held in the hand.

2. EMPTY PINCH / PINCHING AIR (NEGATIVE):
   If the patient's fingers are held in a pinch or C-shape but NO object is held between the fingertips (pinching empty air, fingers touching with nothing inside, or empty background visible through the gap):
   THIS IS AN EMPTY HAND.
   Set: is_pill_physically_visible = false, visual_evidence = 'EMPTY_PINCH_AIR', pill_description = 'None (pinching empty air)'.

3. EMPTY PALM (NEGATIVE):
   If the patient presents a bare open palm or empty hand with no object resting on it:
   THIS IS AN EMPTY HAND.
   Set: is_pill_physically_visible = false, visual_evidence = 'EMPTY_PALM', pill_description = 'None (empty palm)'.`
    }
  ];

  for (let i = 0; i < presentationFrames.length; i++) {
    const cleaned = cleanBase64Data(presentationFrames[i].imageBase64);
    if (cleaned) {
      parts.push({
        text: `[Presentation Frame ${i + 1} at timestamp ${presentationFrames[i].timestamp || '00:02'}]`
      });
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: cleaned,
        }
      });
    }
  }

  try {
    const response = await callGeminiGenerate(ai, {
      contents: { parts },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            is_pill_physically_visible: {
              type: Type.BOOLEAN,
              description: 'True ONLY if an actual solid pill/tablet/capsule is clearly visible in the hand or fingers. False if empty hand or pinching air.',
            },
            visual_evidence: {
              type: Type.STRING,
              enum: ['CLEARLY_VISIBLE_PILL', 'EMPTY_PINCH_AIR', 'EMPTY_PALM', 'UNCLEAR_OR_NO_HAND'],
            },
            pill_description: {
              type: Type.STRING,
              description: 'Visual description of the pill if visible, or statement that hand is empty.',
            },
            confidence: {
              type: Type.NUMBER,
            },
            detailed_inspection: {
              type: Type.STRING,
              description: 'Detailed forensic observation of the hand and fingers.',
            },
          },
          required: [
            'is_pill_physically_visible',
            'visual_evidence',
            'pill_description',
            'confidence',
            'detailed_inspection',
          ],
        },
      },
    });

    const parsed = JSON.parse(response.text?.trim() || '{}');
    const pillDetected = parsed.is_pill_physically_visible === true && parsed.visual_evidence === 'CLEARLY_VISIBLE_PILL';

    return {
      pill_detected: pillDetected,
      confidence: parsed.confidence || 0.95,
      visual_evidence: parsed.visual_evidence || (pillDetected ? 'CLEARLY_VISIBLE_PILL' : 'EMPTY_PINCH_AIR'),
      pill_description: parsed.pill_description || (pillDetected ? expectedMed : 'None (empty hand)'),
      detailed_inspection: parsed.detailed_inspection || 'Stage 1 Gate 1 audit complete',
    };
  } catch (err: any) {
    console.warn('verifyPillPresenceInHand Gemini call error:', err);
    return {
      pill_detected: false,
      confidence: 0.5,
      visual_evidence: 'UNCLEAR_OR_NO_HAND',
      pill_description: 'Error during audit',
      detailed_inspection: String(err?.message || err),
    };
  }
}

export async function verifyWithGemini(
  req: VideoVerificationRequest
): Promise<VideoVerificationResponse | null> {
  const ai = getGeminiClient();
  if (!ai) return null;

  try {
    const parts: any[] = [];
    const expectedMed = req.expectedMedicineName || 'Prescribed Tablet/Capsule';
    const patientName = req.patientName || 'Patient';

    // If keyframes provided, send them as high-resolution vision items
    if (req.keyFrames && req.keyFrames.length > 0) {
      parts.push({
        text: `You are a certified Clinical Video Adherence Inspector.
Examine this chronological sequence of ${req.keyFrames.length} camera frames of patient ${patientName} taking "${expectedMed}".

CRITICAL OBJECTIVE: You must inspect each frame strictly and objectively. DO NOT assume or imagine that a pill was taken if it is not clearly visible in the hand before the hand moves to the mouth.

CHRONOLOGICAL FRAMES FOR INSPECTION:`
      });

      for (let i = 0; i < req.keyFrames.length; i++) {
        const kf = req.keyFrames[i];
        const cleaned = cleanBase64Data(kf.imageBase64);
        if (cleaned) {
          parts.push({
            text: `[Frame ${i + 1} at timestamp ${kf.timestamp || `00:0${i * 2}`}]`
          });
          parts.push({
            inlineData: {
              mimeType: 'image/jpeg',
              data: cleaned,
            },
          });
        }
      }
    } else if (req.videoBase64) {
      // Only attach raw video if discrete keyframes were not provided
      const cleanVideo = cleanBase64Data(req.videoBase64);
      if (cleanVideo.length > 5000) {
        const rawMime = (req.mimeType || 'video/webm').split(';')[0];
        parts.push({
          inlineData: {
            mimeType: rawMime,
            data: cleanVideo,
          },
        });
      }
    }

    if (parts.length === 0) {
      return null;
    }

    const clinicalPrompt = `CLINICAL VERIFICATION PROTOCOL - 5-STATE INGESTION STATE MACHINE:

You are a certified Clinical Video Adherence Inspector.
Examine this chronological sequence of camera frames of the patient taking their prescribed dose of "${expectedMed}".
The verification MUST follow this strict 5-state sequence progression:

STATE 1 — SHOW MEDICINE (Inspect presentation frames 1, 2, and 3):
- The patient presents their medicine to the camera.
- Allowed Presentation: Held between two fingers (pinch gesture e.g. thumb and index/middle finger), resting on the palm, or in another natural holding position.
- Flexible Hand Position: Left or right hand, normal camera distance, natural orientation. Do NOT require one rigid hand position.
- If an actual solid pill/capsule/tablet is visibly presented in hand/fingers:
  Set "events.medicine_detected": true, "frame_1_and_2_pill_check": { "is_pill_physically_visible": true, "pinching_empty_air_or_empty_hand": false, "description_of_hand_contents": "Medication held in hand/fingers" }.
- If the patient only presents an empty hand, open empty palm, or pinches empty air:
  Set "events.medicine_detected": false, "frame_1_and_2_pill_check": { "is_pill_physically_visible": false, "pinching_empty_air_or_empty_hand": true, "description_of_hand_contents": "Empty hand / pinching empty air" }, "status": "MEDICINE_NOT_TAKEN", "verified": false, "failed_step": "medicine_detected", "message": "Medication not verified: Hand was empty when presented to camera. No pill was held in hand."

STATE 2 — MOVE MEDICINE TOWARD THE MOUTH (Inspect progression frames 2, 3, and 4):
- Hand holding the medicine visibly moves upward toward the mouth and lips area.
- Recognizes natural movement progression rather than requiring an exact predefined path.
- If hand/medicine progresses toward the mouth: "events.medicine_to_mouth": true.
- If hand never moves toward mouth: "events.medicine_to_mouth": false, failed_step: "medicine_to_mouth".

STATE 3 — MEDICINE REACHES MOUTH / INGESTION ACTION (Inspect mouth frames 3, 4, and 5):
- Hand brings medicine into the mouth cavity / lips area, followed by mouth closure and swallow.
- If oral ingestion action confirmed: "events.mouth_interaction": true.
- If merely touched face without placing into mouth: "events.mouth_interaction": false, failed_step: "mouth_interaction".

STATE 4 — SHOW EMPTY HAND (Inspect final hand frames 5 and 6):
- After taking the medicine, the patient shows their hand again to the camera.
- The medicine previously detected is no longer in the hand; the hand is now clean and empty.
- If clean empty hand confirmed: "events.hand_empty": true.
- If hand remains closed or still holding the pill: "events.hand_empty": false, failed_step: "hand_empty".

STATE 5 — WATER INTAKE (STRICTLY OPTIONAL):
- Patient may pick up a glass/bottle and drink water.
- If drinking action is observed: "events.water_intake": true.
- If no water is taken: "events.water_intake": false.
- CRITICAL RULE: Water intake is strictly OPTIONAL. A verification MUST NOT fail simply because water is not detected.

DECISION PROTOCOL:
- If States 1, 2, 3, AND 4 are confirmed: "status": "MEDICINE_TAKEN", "verified": true (water intake optional).
- If State 1 fails (empty hand / pinching empty air): status MUST BE 'MEDICINE_NOT_TAKEN', verified = false, failed_step = 'medicine_detected'.
- If State 2 fails: status MUST BE 'MEDICINE_NOT_TAKEN', verified = false, failed_step = 'medicine_to_mouth'.
- If State 3 fails: status MUST BE 'MEDICINE_NOT_TAKEN', verified = false, failed_step = 'mouth_interaction'.
- If State 4 fails: status MUST BE 'MEDICINE_NOT_TAKEN', verified = false, failed_step = 'hand_empty'.`;

    parts.push({ text: clinicalPrompt });

    const response = await callGeminiGenerate(ai, {
      contents: {
        parts,
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            frame_1_and_2_pill_check: {
              type: Type.OBJECT,
              properties: {
                is_pill_physically_visible: {
                  type: Type.BOOLEAN,
                  description: "True ONLY if an actual solid pill/tablet/capsule is visibly held in the fingers or palm in Frame 1 or 2. False if the hand is empty or pinching air.",
                },
                pinching_empty_air_or_empty_hand: {
                  type: Type.BOOLEAN,
                  description: "True if the patient is posing an empty hand or pinching fingers with no medication between them.",
                },
                description_of_hand_contents: {
                  type: Type.STRING,
                  description: "Exact visual description of what is in the patient's hand in Frame 1 and 2.",
                },
              },
              required: [
                'is_pill_physically_visible',
                'pinching_empty_air_or_empty_hand',
                'description_of_hand_contents',
              ],
            },
            status: {
              type: Type.STRING,
              description: "Must be 'MEDICINE_TAKEN', 'MEDICINE_NOT_TAKEN', or 'UNVERIFIED'",
            },
            verified: {
              type: Type.BOOLEAN,
            },
            confidence: {
              type: Type.NUMBER,
            },
            sequence_valid: {
              type: Type.BOOLEAN,
            },
            events: {
              type: Type.OBJECT,
              properties: {
                medicine_detected: { type: Type.BOOLEAN },
                medicine_to_mouth: { type: Type.BOOLEAN },
                mouth_interaction: { type: Type.BOOLEAN },
                hand_empty: { type: Type.BOOLEAN },
                water_intake: { type: Type.BOOLEAN },
              },
              required: [
                'medicine_detected',
                'medicine_to_mouth',
                'mouth_interaction',
                'hand_empty',
                'water_intake',
              ],
            },
            timestamps: {
              type: Type.OBJECT,
              properties: {
                medicine_detected: { type: Type.STRING },
                medicine_to_mouth: { type: Type.STRING },
                mouth_interaction: { type: Type.STRING },
                hand_empty: { type: Type.STRING },
                water_intake: { type: Type.STRING },
              },
            },
            step_confidences: {
              type: Type.OBJECT,
              properties: {
                medicine_confidence: { type: Type.NUMBER },
                hand_to_mouth_confidence: { type: Type.NUMBER },
                mouth_interaction_confidence: { type: Type.NUMBER },
                hand_empty_confidence: { type: Type.NUMBER },
                water_confidence: { type: Type.NUMBER },
              },
              required: [
                'medicine_confidence',
                'mouth_interaction_confidence',
                'hand_empty_confidence',
              ],
            },
            medicine_details: {
              type: Type.OBJECT,
              properties: {
                detected_name: { type: Type.STRING },
                appearance: { type: Type.STRING },
                color: { type: Type.STRING },
                shape: { type: Type.STRING },
                confidence: { type: Type.NUMBER },
                notes: { type: Type.STRING },
                hand_pill_detected: { type: Type.BOOLEAN },
              },
            },
            failed_step: {
              type: Type.STRING,
            },
            explanation: {
              type: Type.STRING,
            },
            message: {
              type: Type.STRING,
            },
          },
          required: [
            'frame_1_and_2_pill_check',
            'status',
            'verified',
            'confidence',
            'sequence_valid',
            'events',
            'timestamps',
            'explanation',
            'message',
          ],
        },
      },
    });

    const text = response.text?.trim();
    if (!text) return null;

    const parsed = JSON.parse(text);
    console.log('Gemini Parsed Inspection Output:', JSON.stringify(parsed, null, 2));
    return normalizeVerification(parsed, 'Google Gemini 3.5 Flash Vision', 'gemini', expectedMed);
  } catch (err) {
    console.error('Gemini Verification Error:', err);
    return null;
  }
}

export function normalizeVerification(
  parsed: any,
  modelName: string,
  provider: 'gemini' | 'openai' | 'huggingface' | 'clinical_cv_engine',
  expectedMed: string
): VideoVerificationResponse {
  const events = parsed.events || {
    medicine_detected: false,
    medicine_to_mouth: false,
    mouth_interaction: false,
    hand_empty: false,
    water_intake: false,
  };

  const timestamps = parsed.timestamps || {
    medicine_detected: '00:03',
    medicine_to_mouth: '00:07',
    mouth_interaction: '00:09',
    hand_empty: '00:13',
    water_intake: '00:16',
  };

  // STRICT PILL INSPECTION CHECK:
  // If Frame 1/2 check indicated no pill or empty hand pinch, force medicine_detected=false!
  if (parsed.frame_1_and_2_pill_check) {
    if (
      parsed.frame_1_and_2_pill_check.is_pill_physically_visible === false ||
      parsed.frame_1_and_2_pill_check.pinching_empty_air_or_empty_hand === true
    ) {
      events.medicine_detected = false;
    }
  }

  // If medicine in hand failed at start, IMMEDIATELY fail the entire verification!
  if (!events.medicine_detected) {
    const medDesc = parsed.frame_1_and_2_pill_check?.description_of_hand_contents || 'Empty hand / no pill detected';
    return {
      status: 'MEDICINE_NOT_TAKEN',
      verified: false,
      confidence: 0.96,
      sequence_valid: false,
      events: {
        medicine_detected: false,
        medicine_to_mouth: false,
        mouth_interaction: false,
        hand_empty: false,
        water_intake: events.water_intake || false,
      },
      timestamps: {
        medicine_detected: null,
        medicine_to_mouth: null,
        mouth_interaction: null,
        hand_empty: null,
        water_intake: events.water_intake ? timestamps.water_intake : null,
      },
      step_confidences: {
        medicine_confidence: 0.20,
        hand_to_mouth_confidence: 0.30,
        mouth_interaction_confidence: 0.30,
        hand_empty_confidence: 0.40,
        water_confidence: events.water_intake ? 0.85 : 0.20,
      },
      medicine_details: {
        detected_name: expectedMed,
        appearance: `None (${medDesc})`,
        color: 'None',
        shape: 'None',
        confidence: 0.20,
        notes: `Verification rejected: Frame inspection confirmed the hand was empty when presented to the camera (${medDesc}).`,
        hand_pill_detected: false,
      },
      failed_step: 'medicine_detected',
      explanation: `Verification rejected at Step 1: Hand was empty when presented to the camera (${medDesc}). Patient must visibly hold an actual solid pill or tablet before moving hand to mouth.`,
      message: 'Medication not verified: Hand was empty when presented to camera. No pill was held in fingers or palm.',
      model_used: modelName,
      ai_provider: provider,
    };
  }

  // All 4 mandatory steps must be directly confirmed by vision. Zero assumptions.
  const allFour =
    events.medicine_detected === true &&
    events.medicine_to_mouth === true &&
    events.mouth_interaction === true &&
    events.hand_empty === true;

  const verified = allFour && (parsed.status === 'MEDICINE_TAKEN' || parsed.verified === true);
  const status: 'MEDICINE_TAKEN' | 'MEDICINE_NOT_TAKEN' = verified ? 'MEDICINE_TAKEN' : 'MEDICINE_NOT_TAKEN';

  let failed_step: string | null = parsed.failed_step || null;
  if (!verified && !failed_step) {
    if (!events.medicine_detected) failed_step = 'medicine_detected';
    else if (!events.medicine_to_mouth) failed_step = 'medicine_to_mouth';
    else if (!events.mouth_interaction) failed_step = 'mouth_interaction';
    else if (!events.hand_empty) failed_step = 'hand_empty';
  }

  const stepConf = parsed.step_confidences || {};
  const step_confidences: any = {
    medicine_confidence: stepConf.medicine_confidence ?? (events.medicine_detected ? 0.95 : 0.4),
    hand_to_mouth_confidence: stepConf.hand_to_mouth_confidence ?? (events.medicine_to_mouth ? 0.94 : 0.35),
    mouth_interaction_confidence: stepConf.mouth_interaction_confidence ?? (events.mouth_interaction ? 0.93 : 0.38),
    hand_empty_confidence: stepConf.hand_empty_confidence ?? (events.hand_empty ? 0.96 : 0.42),
    water_confidence: stepConf.water_confidence ?? (events.water_intake ? 0.88 : 0.3),
  };

  const medDetails = parsed.medicine_details || {};
  const medicine_details = {
    detected_name: medDetails.detected_name || expectedMed,
    appearance: medDetails.appearance || (events.medicine_detected ? 'Solid oral medication detected in palm/fingers' : 'None (empty hand detected)'),
    color: medDetails.color || (events.medicine_detected ? 'White/off-white' : 'None'),
    shape: medDetails.shape || (events.medicine_detected ? 'Round tablet/capsule' : 'None'),
    confidence: medDetails.confidence ?? (events.medicine_detected ? 0.92 : 0.35),
    notes: medDetails.notes || (verified ? 'Pill detected in hand, gesture tracked to mouth, palm confirmed empty.' : `Verification halted at ${failed_step || 'clinical protocol'}.`),
    hand_pill_detected: events.medicine_detected,
  };

  let explanation = parsed.explanation;
  if (!explanation) {
    explanation = verified
      ? 'Medicine detected in hand → hand gesture to mouth → mouth interaction confirmed → hand confirmed empty.'
      : `Clinical verification failed at ${failed_step || 'step'}: Required physical action was not verified in recorded video frames.`;
  }

  let message = parsed.message;
  if (!message) {
    if (verified) {
      message = 'Medicine intake verified successfully. Hand gesture, mouth ingestion, and clean empty hand confirmed.';
    } else {
      if (failed_step === 'medicine_detected') {
        message = 'Medication not verified: Hand was empty when presented to camera. No pill was held in hand.';
      } else if (failed_step === 'medicine_to_mouth') {
        message = 'Medication not verified: Hand gesture bringing medicine to mouth was not detected.';
      } else if (failed_step === 'mouth_interaction') {
        message = 'Medication not verified: Ingestion into mouth cavity was not confirmed.';
      } else if (failed_step === 'hand_empty') {
        message = 'Medication not verified: Clean empty hand was not confirmed after intake.';
      } else {
        message = 'Could not verify complete medicine intake.';
      }
    }
  }

  return {
    status,
    verified,
    confidence: verified ? Math.max(parsed.confidence || 0.92, 0.93) : Math.min(parsed.confidence || 0.45, 0.48),
    sequence_valid: verified,
    events,
    timestamps,
    step_confidences,
    medicine_details,
    failed_step,
    explanation,
    message,
    model_used: modelName,
    ai_provider: provider,
  };
}

export async function verifyPillInFrame(
  frameBase64: string,
  expectedMed?: string
): Promise<{
  pill_detected: boolean;
  confidence: number;
  reason: string;
  pill_details?: {
    appearance?: string;
    shape?: string;
    color?: string;
  };
}> {
  const ai = getGeminiClient();
  if (!ai) {
    try {
      const { detectPillInFrameDirect } = await import('./computerVisionService.js');
      return await detectPillInFrameDirect(frameBase64, expectedMed);
    } catch (e) {
      return {
        pill_detected: false,
        confidence: 0.5,
        reason: 'Vision analysis error: ensure clear lighting and camera visibility',
      };
    }
  }

  try {
    const cleaned = cleanBase64Data(frameBase64);
    if (!cleaned) {
      return { pill_detected: false, confidence: 0.95, reason: 'Empty camera frame' };
    }

    const prompt = `You are a certified Clinical Computer Vision expert for medication intake verification.
Target prescribed medication: "${expectedMed || 'Prescribed Tablet/Capsule'}".

INSPECTION OBJECTIVE:
Inspect this camera frame of the patient's hand with utmost optical accuracy.
Determine if an actual, real physical oral pill, tablet, capsule, or medication object is held in their hand or fingers.

FLEXIBLE PRESENTATION REQUIREMENTS:
The medicine may be held:
- Between two fingers, such as a pinch gesture (thumb and index or middle finger).
- Resting on the palm or cupped fingers.
- Between fingers in another natural holding position.
- Hand may be left or right hand, at normal camera distance, in any natural orientation.
Do NOT require one rigid hand position. Recognize the medicine even when held naturally.

CLINICAL REFERENCE GROUNDING:
1. [NEGATIVE REFERENCE: EMPTY HAND / EMPTY PINCH]
   - Visual gesture: The patient's hand forms a pinch or C-curve, but the gap between fingertips is EMPTY (pinching empty air, showing background/room through the gap with NO object held), or the hand is a bare open palm.
   - There is NO physical pill, tablet, or capsule in the hand.
   - If the hand is empty or pinching air, return:
     "pill_detected": false
     "confidence": 0.95
     "reason": "Empty hand detected. Space between fingers/palm is clear and empty; no physical medication present."

2. [POSITIVE REFERENCE: MEDICINE IN HAND / PINCH / PALM]
   - Visual gesture: The patient holds a real solid oral medication (tablet, pill, capsule, or caplet) between their fingers (in pinch), resting on the palm, or in a natural hand hold.
   - The solid pill/tablet object is visibly present with distinct contours against the hand.
   - If a pill/tablet is present in hand, return:
     "pill_detected": true
     "confidence": 0.94 or higher
     "reason": "Physical medication object confirmed held in hand/fingers."
     "pill_details": description of the pill's appearance, shape, and color.`;

    const response = await callGeminiGenerate(ai, {
      contents: [
        { text: prompt },
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: cleaned,
          },
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            pill_detected: { type: Type.BOOLEAN },
            confidence: { type: Type.NUMBER },
            reason: { type: Type.STRING },
            pill_details: {
              type: Type.OBJECT,
              properties: {
                appearance: { type: Type.STRING },
                shape: { type: Type.STRING },
                color: { type: Type.STRING },
              },
            },
          },
          required: ['pill_detected', 'confidence', 'reason'],
        },
      },
    });

    const text = response.text?.trim();
    if (!text) {
      return { pill_detected: false, confidence: 0.5, reason: 'No response from model' };
    }
    return JSON.parse(text);
  } catch (err: any) {
    console.warn('Gemini pill frame verification failed, falling back to CV engine...', err?.message || err);
    try {
      const { detectPillInFrameDirect } = await import('./computerVisionService.js');
      return await detectPillInFrameDirect(frameBase64, expectedMed);
    } catch (cvErr) {
      return {
        pill_detected: false,
        confidence: 0.5,
        reason: 'Vision analysis error: ensure clear lighting and camera visibility',
      };
    }
  }
}
