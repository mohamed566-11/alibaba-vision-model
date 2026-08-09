import fs from 'fs';
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

export class GarmentTryOnService {
  private static DASHSCOPE_URL = 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

  /**
   * Performs multi-garment virtual try-on:
   * Takes a person photo + multiple garment photos and fits the outfit onto the person.
   */
  public static async executeTryOn(
    personImagePath: string,
    garments: GarmentInput[],
    apiKey: string,
    generatedDir: string
  ): Promise<{ localPath: string; publicUrl: string; generatedFilename: string }> {
    console.log(`[TryOn] Preparing multi-garment fitting for ${garments.length} item(s)...`);

    // 1. Compress person image
    const { base64: personBase64 } = await QwenImageEditService.compressInputImage(personImagePath);

    // 2. Compress each garment image
    const garmentBase64s: string[] = [];
    for (const g of garments) {
      const { base64 } = await QwenImageEditService.compressInputImage(g.imagePath);
      garmentBase64s.push(base64);
    }

    // 3. Build ultra-strict, detailed prompt
    const garmentList = garments
      .map((g, idx) => `  - Photo ${idx + 2}: ${g.color && g.color !== 'original' ? `${g.color} ` : ''}${g.description} (${g.category})`)
      .join('\n');

    const prompt = `High-precision e-commerce virtual try-on edit:

1. PERSON IDENTITY & FACE (ZERO ALTERATION):
   - Photo 1 is the target person.
   - You MUST keep their exact face, facial features, expression, eyes, nose, mouth, hair, skin tone, body shape, 100% UNCHANGED.
   - Do NOT alter, retouch, or modify the person's face or identity in any way.

2. OUTFIT REPLACEMENT & COMPLETE FITTING:
   - Erase ALL original clothes worn by the person in Photo 1.
   - Dress the person in Photo 1 with the exact garments provided in the subsequent photos:
${garmentList}
   - Fit, drape, and layer all garments seamlessly and elegantly onto the person's body structure.
   - Ensure the outfit looks complete, tailored, and naturally worn.

3. FRAMING & HEAD PRESERVATION (CRITICAL):
   - You MUST capture and show the FULL HEAD and entire face from top of hair to feet.
   - Do NOT cut or crop the top of the head or face off under any circumstances.
   - Position the person completely in frame with clean breathing room around head and feet.

4. BACKGROUND & ENVIRONMENT:
   - Replace background with a pure, solid, clean white background (#FFFFFF).
   - Professional studio e-commerce lighting with clean realistic soft shadows.

5. ABSOLUTE PROHIBITIONS:
   - NO text, NO logos, NO captions, NO borders, NO divider lines, NO floating items, NO extra limbs, NO cropped heads.`;

    console.log(`[TryOn] Ultra-Strict Detailed Prompt:\n`, prompt);

    // 4. Construct content array: [Person Image, Garment Image 1, Garment Image 2..., Text Prompt]
    const contentPayload: any[] = [
      { image: personBase64 },
      ...garmentBase64s.map(b => ({ image: b })),
      { text: prompt }
    ];

    const reqBody = {
      model: "qwen-image-edit",
      input: {
        messages: [
          {
            role: "user",
            content: contentPayload
          }
        ]
      },
      parameters: {
        n: 1,
        prompt_extend: false, // Prevents server prompt extension delay (faster generation)
        watermark: false,
        output_size: "768*1024"
      }
    };

    // 5. Send API call with retry on 429
    let retries = 0;
    const maxRetries = 3;

    while (retries <= maxRetries) {
      try {
        const response = await fetch(this.DASHSCOPE_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(reqBody)
        });

        const data = await response.json();

        if (!response.ok) {
          if (response.status === 429 && retries < maxRetries) {
            retries++;
            const delay = Math.pow(2, retries) * 1000;
            console.warn(`[TryOn] Rate limited (429). Retrying in ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          throw new Error(`Try-On API error (${response.status}): ${JSON.stringify(data)}`);
        }

        // Try-On response image URL extraction (handles both choices and results schema)
        const outputUrl = 
          data.output?.choices?.[0]?.message?.content?.[0]?.image ||
          data.output?.results?.[0]?.url ||
          data.output?.render_urls?.[0];

        if (!outputUrl) {
          console.error('[TryOn] Could not parse image URL from response:', JSON.stringify(data));
          throw new Error('No image URL returned in Try-On API response');
        }

        // Download result image to disk and trim outer padding so full body & head remain visible
        const filename = `tryon_${uuidv4()}.png`;
        const localPath = path.join(generatedDir, filename);

        const imgRes = await fetch(outputUrl);
        if (!imgRes.ok) throw new Error(`Failed to download Try-On result from ${outputUrl}`);

        const arrayBuffer = await imgRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Trim outer white padding if model left extra white space, ensuring full subject is framing clean
        try {
          const trimmedBuf = await sharp(buffer)
            .trim({ background: '#FFFFFF', threshold: 10 })
            .png()
            .toBuffer();
          
          // Extend slightly (5%) so it doesn't touch edges tightly
          const meta = await sharp(trimmedBuf).metadata();
          const w = meta.width || 768;
          const h = meta.height || 1024;
          const pad = Math.round(Math.max(w, h) * 0.04);

          await sharp(trimmedBuf)
            .extend({
              top: pad,
              bottom: pad,
              left: pad,
              right: pad,
              background: { r: 255, g: 255, b: 255, alpha: 1 }
            })
            .png()
            .toFile(localPath);
        } catch {
          await sharp(buffer).png().toFile(localPath);
        }

        const publicUrl = `/uploads/generated/${filename}`;
        console.log(`[TryOn] ✓ Success! Result saved to ${filename}`);

        return { localPath, publicUrl, generatedFilename: filename };

      } catch (err: any) {
        if (retries >= maxRetries) throw err;
        retries++;
        console.warn(`[TryOn] Attempt ${retries} failed: ${err.message}. Retrying...`);
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    throw new Error('Try-On processing failed after retries.');
  }
}
