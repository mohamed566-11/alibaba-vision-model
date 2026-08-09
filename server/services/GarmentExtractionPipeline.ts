import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { GarmentAnalysisService, GarmentInventory, GarmentItem } from './GarmentAnalysisService';
import { GarmentPromptBuilder, getLayoutForItems, getOutputSize } from './GarmentPromptBuilder';
import { QwenImageEditService } from './QwenImageEditService';

export interface ExtractedItemResult {
  item: GarmentItem;
  image_url: string;
  verified: boolean;
  verification_reason?: string;
}

export interface ExtractionPipelineResult {
  success: boolean;
  image_url: string;
  item_results: ExtractedItemResult[];
  verified: boolean;
  verification_reason?: string;
  inventory: GarmentInventory;
  attempts: number;
  message?: string;
}

export class GarmentExtractionPipeline {
  /**
   * Architecture:
   *   1. Compress input image (512px JPEG, ~70KB)
   *   2. ONE qwen-image-edit-plus API call → combined grid image (smart size per item count)
   *   3. Sharp crops + trims grid into N individual item images (ZERO extra API calls)
   *   4. Return full image + per-item cropped URLs
   *
   * Cost: exactly 1 API call regardless of item count.
   */
  public static async processExtraction(
    inputFilePath: string,
    mimeType: string,
    confirmedInventory: GarmentInventory | null,
    apiKey: string,
    generatedDir: string,
    abortSignal?: AbortSignal
  ): Promise<ExtractionPipelineResult> {

    const checkAbort = () => {
      if (abortSignal?.aborted) throw new Error('Extraction cancelled by user.');
    };

    // 1. Compress input image
    console.log('[Pipeline] Compressing input image...');
    const { base64: compressedBase64 } = await QwenImageEditService.compressInputImage(inputFilePath);
    console.log(`[Pipeline] Compressed. Base64 size: ${Math.round(compressedBase64.length / 1024)}KB`);
    checkAbort();

    // 2. Use pre-analyzed inventory from frontend (skip double analysis)
    let inventory = confirmedInventory;
    if (!inventory || !inventory.items || inventory.items.length === 0) {
      console.log('[Pipeline] Running Stage 1 Garment Analysis...');
      inventory = await GarmentAnalysisService.analyzeImage(compressedBase64, apiKey);
    }
    console.log('[Pipeline] Inventory:', JSON.stringify(inventory, null, 2));
    checkAbort();

    const selectedItems = inventory.items.filter(i => i.visible !== false);
    if (selectedItems.length === 0) throw new Error('No garment items selected for extraction.');

    // 3. Build prompt + select optimal output size for item count
    const prompt = GarmentPromptBuilder.buildExtractionPrompt(inventory);
    const outputSize = getOutputSize(selectedItems.length);
    console.log(`[Pipeline] Prompt:\n`, prompt);
    console.log(`[Pipeline] Output size: ${outputSize} (${selectedItems.length} items)`);

    const startTime = Date.now();

    // 4. ONE API call with smart output size
    let result: { localPath: string; publicUrl: string; generatedFilename: string };
    let attempts = 1;

    try {
      console.log(`[Pipeline] Sending ONE API call for ${selectedItems.length} item(s)...`);
      result = await QwenImageEditService.executeExtraction(
        compressedBase64, prompt, apiKey, generatedDir, outputSize
      );
    } catch (err: any) {
      checkAbort();
      console.warn('[Pipeline] Attempt 1 failed:', err.message, '— retrying with simpler prompt...');
      attempts = 2;
      const recoveryPrompt = GarmentPromptBuilder.buildRecoveryPrompt(inventory);
      result = await QwenImageEditService.executeExtraction(
        compressedBase64, recoveryPrompt, apiKey, generatedDir, outputSize
      );
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`[Pipeline] Done in ${elapsed}s (attempt ${attempts}).`);

    // 5. Crop + trim per-item sections locally using Sharp (ZERO extra API calls)
    const itemResults = await this.cropItemsFromImage(
      result.localPath,
      result.publicUrl,
      selectedItems,
      generatedDir
    );

    return {
      success: true,
      image_url: result.publicUrl,
      item_results: itemResults,
      verified: true,
      verification_reason: `${selectedItems.length} item(s) extracted in ${elapsed}s (1 API call · ${outputSize})`,
      inventory,
      attempts
    };
  }

  /**
   * Crops the combined grid image into N individual item images.
   * Uses predictable grid math — no AI involved, pure Sharp geometry.
   * Cost: ~1ms per item, purely local CPU.
   */
  private static async cropItemsFromImage(
    fullImagePath: string,
    fullImagePublicUrl: string,
    items: GarmentItem[],
    generatedDir: string
  ): Promise<ExtractedItemResult[]> {

    const count = items.length;

    // Single item — no cropping needed, just return the full image
    if (count === 1) {
      return [{
        item: items[0],
        image_url: fullImagePublicUrl,
        verified: true,
        verification_reason: 'Single item — full image'
      }];
    }

    const layout = getLayoutForItems(count);
    const { cols, rows } = layout;

    // Get output image dimensions
    const metadata = await sharp(fullImagePath).metadata();
    const imgW = metadata.width || 512;
    const imgH = metadata.height || 512;

    const cellW = Math.floor(imgW / cols);
    const cellH = Math.floor(imgH / rows);

    console.log(`[Pipeline] Cropping ${count} items from ${imgW}×${imgH} image using ${cols}×${rows} grid (${cellW}×${cellH} per cell)...`);

    const results: ExtractedItemResult[] = [];

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const col = idx % cols;
      const row = Math.floor(idx / cols);

      const left = col * cellW;
      const top = row * cellH;
      const width = col === cols - 1 ? imgW - left : cellW; // Last col gets remainder
      const height = row === rows - 1 ? imgH - top : cellH;  // Last row gets remainder

      const cropFilename = `crop_${idx}_${path.basename(fullImagePath)}`;
      const cropPath = path.join(generatedDir, cropFilename);

      try {
        // Step 1: Crop the grid cell
        const cropBuffer = await sharp(fullImagePath)
          .extract({ left, top, width, height })
          .png()
          .toBuffer();

        // Step 2: Trim whitespace around the garment so it fills the card
        // threshold: pixels within 30 of white (RGB 225+) are trimmed
        const trimmedBuffer = await sharp(cropBuffer)
          .trim({ background: '#FFFFFF', threshold: 30 })
          .png()
          .toBuffer();

        // Step 3: Embed in a square canvas with small padding for clean display
        const trimMeta = await sharp(trimmedBuffer).metadata();
        const trimW = trimMeta.width || 400;
        const trimH = trimMeta.height || 400;
        const squareSize = Math.max(trimW, trimH) + 60; // 30px padding each side

        await sharp(trimmedBuffer)
          .extend({
            top:    Math.floor((squareSize - trimH) / 2),
            bottom: Math.ceil((squareSize - trimH) / 2),
            left:   Math.floor((squareSize - trimW) / 2),
            right:  Math.ceil((squareSize - trimW) / 2),
            background: { r: 255, g: 255, b: 255, alpha: 1 }
          })
          .png()
          .toFile(cropPath);

        results.push({
          item,
          image_url: `/uploads/generated/${cropFilename}`,
          verified: true,
          verification_reason: `Cropped from grid [row ${row + 1}, col ${col + 1}]`
        });

        console.log(`[Pipeline] ✓ Cropped & trimmed: ${item.category} → ${cropFilename}`);

      } catch (cropErr: any) {
        console.error(`[Pipeline] ✗ Crop failed for ${item.category}:`, cropErr.message);
        // Fallback: use full image if crop fails
        results.push({
          item,
          image_url: fullImagePublicUrl,
          verified: true,
          verification_reason: 'Crop failed — full image used'
        });
      }
    }

    return results;
  }
}
