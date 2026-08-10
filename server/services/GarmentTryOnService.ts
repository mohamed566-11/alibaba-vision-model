import path from 'path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { QwenImageEditService } from './QwenImageEditService';

export interface GarmentInput {
  imagePath: string; // Absolute path on server disk
  description: string;
  category: string;
  color?: string;
}

// ─── Garment Layer Classification ────────────────────────────────────────────
// Ensures garments are applied in the correct order: bottom → base top → outerwear → shoes

type GarmentLayer = 'bottom' | 'base_top' | 'outerwear' | 'footwear' | 'accessory';

interface LayeredGarment extends GarmentInput {
  layer: GarmentLayer;
}

function classifyLayer(category: string): GarmentLayer {
  const cat = category.toLowerCase().trim();
  if (/jacket|blazer|coat|overcoat|cardigan|hoodie|parka|windbreaker|waistcoat|vest|anorak/.test(cat)) return 'outerwear';
  if (/pant|trouser|jean|short|skirt|legging|chino|slack|jogger|culotte/.test(cat)) return 'bottom';
  if (/shoe|boot|sneaker|heel|loafer|sandal|slipper|oxford|pump|mule/.test(cat)) return 'footwear';
  if (/hat|cap|scarf|belt|bag|watch|glasses|sunglasses|tie|bow tie|necklace|bracelet|ring/.test(cat)) return 'accessory';
  return 'base_top'; // shirt, t-shirt, blouse, dress, top, sweater, etc.
}

// Layer rendering order: lower numbers render first (bottoms before tops before jackets)
const LAYER_ORDER: Record<GarmentLayer, number> = {
  bottom: 1, base_top: 2, outerwear: 3, footwear: 4, accessory: 5,
};

// Precise body position description for each layer (drives AI placement accuracy)
const LAYER_BODY_POSITION: Record<GarmentLayer, string> = {
  bottom: 'lower body — from natural waist down to the ankles, replacing any original pants or skirt',
  base_top: 'upper body — covering the torso as the INNERMOST clothing layer (worn directly against skin), replacing the original shirt or top',
  outerwear: 'outer layer over the entire torso — worn ON TOP OF all base shirts or tops; keep any visible shirt collar or hem visible below the jacket',
  footwear: 'both feet — replacing original shoes; laces or buckles naturally fastened',
  accessory: 'natural and proportional position on the body',
};

// Specific fit instruction for each layer
const LAYER_FIT: Record<GarmentLayer, string> = {
  bottom: 'Waistband sits at the natural waist. Fabric drapes naturally down the legs with correct fit.',
  base_top: 'Fitted against the body as the innermost top layer. Tuck or leave untucked based on garment style.',
  outerwear: 'Draped over the shirt. The shirt collar MUST remain visible at the neckline. Sleeves aligned with arms.',
  footwear: 'Both feet fully shod. Shoe silhouette matches the reference exactly.',
  accessory: 'Placed proportionally without obstructing other garments.',
};

// ─── Model Chain — each model has a preferred output size ────────────────────
// qwen-image-2.0-pro uses 768*1024 (safer), edit-plus/max use 1024*1536

const TRYON_MODEL_CHAIN: Array<{ model: string; outputSize: string }> = [
  { model: 'qwen-image-edit-plus', outputSize: '1024*1536' },
  { model: 'qwen-image-2.0-pro', outputSize: '768*1024' },
  { model: 'qwen-image-edit-max', outputSize: '1024*1536' },
];

// ─── Helper: Garment description without color duplication ───────────────────
// Fixes "black black suit pants" → "BLACK SUIT PANTS"
function describeGarment(g: GarmentInput): string {
  const color = (g.color || '').trim().toLowerCase();
  const desc = g.description.trim();
  if (color && color !== 'original' && !new RegExp(`\\b${color}\\b`, 'i').test(desc)) {
    return `${color.toUpperCase()} ${desc}`;
  }
  return desc;
}

// ─── Main Service ─────────────────────────────────────────────────────────────

export class GarmentTryOnService {
  private static DASHSCOPE_URL = 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

  /**
   * Performs multi-garment virtual try-on.
   *
   * Pipeline:
   *   1. Classify each garment into a body layer (bottom/base_top/outerwear/footwear)
   *   2. Sort garments into correct layering order
   *   3. HQ-compress all images (768px / quality 80)
   *   4. Build a category-aware, layered prompt with exact body positions
   *   5. Try model chain until one succeeds (with per-model output sizes)
   *   6. Post-process result: trim → pad → sharpen → save
   */
  public static async executeTryOn(
    personImagePath: string,
    garments: GarmentInput[],
    apiKey: string,
    generatedDir: string
  ): Promise<{ localPath: string; publicUrl: string; generatedFilename: string; modelUsed: string }> {

    console.log(`[TryOn] Starting try-on for ${garments.length} garment(s)...`);

    // ── Step 1: Classify + sort garments into body layers ─────────────────────
    const layered: LayeredGarment[] = garments
      .map(g => ({ ...g, layer: classifyLayer(g.category) }))
      .sort((a, b) => LAYER_ORDER[a.layer] - LAYER_ORDER[b.layer]);

    const layerLog = layered.map(g => `${g.category}[${g.layer}]`).join(' → ');
    console.log(`[TryOn] Layer order: ${layerLog}`);

    // ── Step 2: HQ compress (768px / quality 80) ──────────────────────────────
    const { base64: personBase64 } = await QwenImageEditService.compressInputImageHQ(personImagePath);
    const garmentBase64s: string[] = [];
    for (const g of layered) {
      const { base64 } = await QwenImageEditService.compressInputImageHQ(g.imagePath);
      garmentBase64s.push(base64);
    }
    console.log(`[TryOn] HQ compressed: 1 person + ${garmentBase64s.length} garment(s) @ 768px.`);

    // ── Step 3: Build category-aware, layered prompt ───────────────────────────
    const photoReferenceList = layered
      .map((_, idx) => `- Photo ${idx + 2}: Garment reference #${idx + 1} — the EXACT clothing item to apply onto the person.`)
      .join('\n');

    const garmentInstructions = layered.map((g, idx) => {
      const photoRef = `Photo ${idx + 2}`;
      const desc = describeGarment(g);
      const position = LAYER_BODY_POSITION[g.layer];
      const fit = LAYER_FIT[g.layer];
      const layerLabel = g.layer.replace('_', ' ').toUpperCase();
      return `   [${layerLabel}] ${photoRef} → "${desc}"
     Position: ${position}.
     Fit: ${fit}`;
    }).join('\n\n');

    const prompt = `VIRTUAL TRY-ON — FOLLOW EVERY STEP PRECISELY.

═══ PHOTO REFERENCES ═══
- Photo 1: Target person (face and body identity to preserve — NOT their pose or background).
${photoReferenceList}

⚠️ CANVAS & FRAMING RULE (READ FIRST — APPLIES TO THE ENTIRE IMAGE) ⚠️
- The output image MUST show the COMPLETE FULL BODY of the person:
  → FROM the very TOP of their hair/head (leave at least 8% empty white space ABOVE the head)
  → TO the very BOTTOM of their feet (leave at least 5% empty white space BELOW the feet)
- Scale the person DOWN if needed so that both the head AND feet fit fully within the frame.
- NEVER crop, clip, or cut the head, face, hair, or feet — not even by 1 pixel.
- This framing rule overrides everything else.

═══ STEP 1 — IDENTITY LOCK (FACE & BODY ONLY) ═══
- Preserve Photo 1's person's FACE, hair, skin tone, eyes, nose, mouth, and body proportions 100% IDENTICALLY.
- DO NOT smooth, slim, beautify, or alter the person's facial features or skin in any way.

═══ STEP 2 — POSE NORMALIZATION (CRITICAL — MANDATORY) ═══
- DISCARD the original pose from Photo 1 completely.
- Redraw the person standing FULLY UPRIGHT in a sharp, professional fashion e-commerce model stance:
  • Both legs straight, feet flat on the ground — one foot slightly in front or angled at ~15° for a natural stance.
  • ARM POSITION — professional fashion model style:
    - Right arm: hanging slightly away from the body, elbow very subtly bent (~5-10°), hand relaxed with fingers loosely curled downward — creating a natural gap between arm and torso.
    - Left arm: similar relaxed position OR lightly resting with fingertips barely touching the side of the thigh — NOT stiff, NOT a military stance.
    - Both hands COMPLETELY EMPTY — no bags, objects, or accessories in either hand.
    - The overall arm posture should feel CONFIDENT and STYLISH, as seen in high-end fashion catalog shoots.
  • Head upright, chin slightly raised, gaze forward — sharp, confident model expression.
  • Body front-facing or a slight 3/4 angle toward the viewer.
  • NO leaning, sitting, crouching, walking, or casual poses from Photo 1.
- This pose is mandatory regardless of what pose or accessories appear in Photo 1.

═══ STEP 3 — REMOVE ALL ORIGINAL CLOTHING ═══
- Completely erase every garment the person is currently wearing in Photo 1.
- Replace removed areas with natural underlying skin or body texture — no ghosting or remnants.

═══ STEP 4 — APPLY GARMENTS IN EXACT ORDER ═══
Apply each garment from the reference photos precisely as described:

${garmentInstructions}

Garments must look naturally worn — draping, folding, and creasing realistically with correct fabric weight.

═══ STEP 5 — ENVIRONMENT ═══
- Pure white (#FFFFFF) background with NO patterns, gradients, shadows, railings, stairs, or any real-world objects.
- Soft, even professional studio lighting from above and front.

═══ ABSOLUTE PROHIBITIONS ═══
- NO cropped heads, no cropped hair, no cropped faces — head must be FULLY visible with space above it.
- NO cropped feet — feet must be FULLY visible with space below them.
- NO text, captions, labels, watermarks, logos.
- NO grid lines, borders, or dividers.
- NO extra floating garments or hallucinated accessories.
- NO duplicated people or extra limbs.
- NO original background (stairs, railing, walls, floors) from Photo 1.
- NO leaning, sitting, or non-upright poses.`;


    console.log(`[TryOn] Prompt: ${prompt.length} chars — ${layered.length} garment(s), layered.`);

    // ── Step 4: Build API payload ──────────────────────────────────────────────
    const contentPayload: any[] = [
      { image: personBase64 },
      ...garmentBase64s.map(b => ({ image: b })),
      { text: prompt }
    ];

    // ── Step 5: Try model chain ────────────────────────────────────────────────
    let outputUrl: string | null = null;
    let modelUsed = '';

    for (const { model, outputSize } of TRYON_MODEL_CHAIN) {
      let retries = 0;
      const maxRetries = 2;

      while (retries <= maxRetries) {
        try {
          console.log(`[TryOn] → ${model} @ ${outputSize} (attempt ${retries + 1})...`);

          const reqBody = {
            model,
            input: { messages: [{ role: 'user', content: contentPayload }] },
            parameters: { n: 1, prompt_extend: false, watermark: false, output_size: outputSize }
          };

          const response = await fetch(this.DASHSCOPE_URL, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(reqBody),
            signal: AbortSignal.timeout(90000) // 90s hard timeout per attempt
          });

          // Handle 429 Rate Limit with backoff
          if (response.status === 429) {
            retries++;
            if (retries <= maxRetries) {
              const delay = Math.pow(2, retries) * 2000;
              console.warn(`[TryOn] 429 on ${model}. Retrying in ${delay / 1000}s...`);
              await new Promise(r => setTimeout(r, delay));
              continue;
            }
            console.warn(`[TryOn] ${model} rate-limited, exhausted retries → next model.`);
            break;
          }

          // Handle other HTTP errors
          if (!response.ok) {
            const errText = await response.text();
            console.warn(`[TryOn] ${model} → HTTP ${response.status}: ${errText.slice(0, 200)} → next model.`);
            break;
          }

          const data = await response.json();

          // Parse image URL — handles both API response schemas
          const candidate =
            data.output?.choices?.[0]?.message?.content?.[0]?.image ||
            data.output?.results?.[0]?.url ||
            data.output?.render_urls?.[0];

          if (!candidate) {
            console.warn(`[TryOn] ${model} returned no image URL. Raw:`, JSON.stringify(data).slice(0, 400));
            break;
          }

          outputUrl = candidate;
          modelUsed = model;
          console.log(`[TryOn] ✓ Success via: ${modelUsed}`);
          break;

        } catch (err: any) {
          const reason = err.name === 'TimeoutError' ? 'timed out after 90s' : err.message;
          console.warn(`[TryOn] ${model} threw: ${reason} → next model.`);
          break;
        }
      }

      if (outputUrl) break;
    }

    if (!outputUrl) {
      throw new Error('[TryOn] All models in the chain failed to produce a try-on result.');
    }

    // ── Step 6: Download result ────────────────────────────────────────────────
    const imgRes = await fetch(outputUrl, { signal: AbortSignal.timeout(60000) });
    if (!imgRes.ok) throw new Error(`[TryOn] Failed to download result image: HTTP ${imgRes.status}`);
    const rawBuffer = Buffer.from(await imgRes.arrayBuffer());

    // ── Step 7: Post-process → trim + pad + sharpen → save ────────────────────
    const filename = `tryon_${uuidv4()}.png`;
    const localPath = path.join(generatedDir, filename);

    try {
      // A) Skip aggressive trim — we preserve the full head & feet as generated.
      //    Only remove near-pure-white borders if they're more than 3% of image width
      //    to avoid accidentally cutting into the head/hair area.
      const meta0 = await sharp(rawBuffer).metadata();
      const rawW = meta0.width || 768;
      const rawH = meta0.height || 1024;

      // Add conservative 3% padding directly to the raw image (no trim).
      // This ensures head room at top and foot room at bottom are preserved.
      const pad = Math.round(Math.max(rawW, rawH) * 0.03);

      const padded = await sharp(rawBuffer)
        .extend({
          top: pad, bottom: pad, left: pad, right: pad,
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .toBuffer();

      // B) Subtle sharpening — enhances fabric texture & garment edge clarity
      await sharp(padded)
        .sharpen({ sigma: 0.6, m1: 0.5, m2: 2.0 })
        .png({ compressionLevel: 8 })
        .toFile(localPath);

    } catch {
      // Fallback: save raw buffer as-is
      await sharp(rawBuffer).png().toFile(localPath);
    }

    const publicUrl = `/uploads/generated/${filename}`;
    console.log(`[TryOn] ✓ Saved: ${filename} — model: ${modelUsed}`);

    return { localPath, publicUrl, generatedFilename: filename, modelUsed };
  }
}
