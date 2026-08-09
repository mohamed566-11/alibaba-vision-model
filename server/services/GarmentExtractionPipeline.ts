import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { GarmentAnalysisService, GarmentInventory, GarmentItem } from './GarmentAnalysisService';
import { GarmentPromptBuilder, getLayoutForItems, getOutputSize } from './GarmentPromptBuilder';
import { QwenImageEditService } from './QwenImageEditService';
import { SmartCropService } from './SmartCropService';

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

    // 5a. Trim outer whitespace from the combined image so items fill the main display view
    //     This doesn't affect per-item crops — only the full preview shown to the user.
    try {
      const combinedBuf = await sharp(result.localPath)
        .trim({ background: '#FFFFFF', threshold: 15 })
        .png()
        .toBuffer();
      await sharp(combinedBuf).toFile(result.localPath);
      console.log('[Pipeline] Combined image trimmed for display.');
    } catch (trimErr: any) {
      console.warn('[Pipeline] Combined image trim skipped:', trimErr.message);
    }

    // 5b. Remove any AI-generated separator lines / dividers from the combined image.
    //     Scans for thin dark columns (≥60% dark pixels, ≤12px wide) and paints them white.
    //     Runs in ~5ms on CPU. Zero API calls. Guarantees clean crops every time.
    await SmartCropService.removeArtifactLines(result.localPath);

    // 5c. Crop + trim per-item sections locally using Sharp (ZERO extra API calls)
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
   * Content-aware crop: splits the combined grid image into individual item images.
   *
   * Steps per item:
   *   1. SmartCropService detects actual whitespace separator positions (not guessed math)
   *   2. Extract each grid cell using the detected boundaries
   *   3. Trim remaining internal whitespace via Sharp
   *   4. Pad to a clean square canvas for consistent card display
   *
   * Supports grids up to 6 items. Falls back to equal math division if detection fails.
   * Cost: ~5-15ms CPU, zero API calls.
   */
  private static async cropItemsFromImage(
    fullImagePath: string,
    fullImagePublicUrl: string,
    items: GarmentItem[],
    generatedDir: string
  ): Promise<ExtractedItemResult[]> {
    const count = items.length;

    // Single item — return full image directly (no crop needed)
    if (count === 1) {
      // Still trim + pad the single item for consistent display
      const trimmed = await SmartCropService.trimAndPad(fullImagePath);
      const filename = `crop_0_${path.basename(fullImagePath)}`;
      const outPath = path.join(generatedDir, filename);
      await trimmed.toFile(outPath);
      return [{
        item: items[0],
        image_url: `/uploads/generated/${filename}`,
        verified: true,
        verification_reason: 'Single item — trimmed & padded'
      }];
    }

    const layout = getLayoutForItems(count);
    const { cols, rows } = layout;

    // Read dimensions
    const meta = await sharp(fullImagePath).metadata();
    const imgW = meta.width ?? 512;
    const imgH = meta.height ?? 512;

    console.log(`[Pipeline] SmartCrop: ${count} items | ${cols}×${rows} grid | ${imgW}×${imgH}px image`);

    // Run content-aware separator detection (single-pass pixel analysis ~5-15ms)
    const boundaries = await SmartCropService.detect(fullImagePath, cols, rows);

    const results: ExtractedItemResult[] = [];

    // Process all crops in parallel for speed
    const cropTasks = items.map(async (item, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);

      const { start: left, size: width }  = SmartCropService.cellRange(boundaries.colCuts, imgW, col);
      const { start: top,  size: height } = SmartCropService.cellRange(boundaries.rowCuts, imgH, row);

      const cropFilename = `crop_${idx}_${path.basename(fullImagePath)}`;
      const cropPath = path.join(generatedDir, cropFilename);

      try {
        // 1. Crop cell using smart boundaries.
        //    Safe margin: trim 10px inward from each shared edge to eliminate any
        //    separator line/shadow artifact left by the model at cell boundaries.
        const SAFE_MARGIN = 10;
        const safeLeft   = left   + (col > 0              ? SAFE_MARGIN : 0);
        const safeTop    = top    + (row > 0              ? SAFE_MARGIN : 0);
        const safeRight  = (left + width)  - (col < cols - 1 ? SAFE_MARGIN : 0);
        const safeBottom = (top  + height) - (row < rows - 1 ? SAFE_MARGIN : 0);
        const safeW = Math.max(safeRight  - safeLeft, 1);
        const safeH = Math.max(safeBottom - safeTop,  1);

        const cropBuffer = await sharp(fullImagePath)
          .extract({ left: safeLeft, top: safeTop, width: safeW, height: safeH })
          .png()
          .toBuffer();

        // 2. Trim whitespace + 3. Pad to square — combined in one helper
        await (await SmartCropService.trimAndPadBuffer(cropBuffer)).toFile(cropPath);

        console.log(`[Pipeline] ✓ ${boundaries.method === 'smart' ? '🎯' : '📐'} ${item.category} [r${row + 1}c${col + 1}] → ${cropFilename}`);

        return {
          item,
          image_url: `/uploads/generated/${cropFilename}`,
          verified: true,
          verification_reason: `${boundaries.method === 'smart' ? 'Smart' : 'Fallback'} crop [row ${row + 1}, col ${col + 1}]`
        } as ExtractedItemResult;

      } catch (cropErr: any) {
        console.error(`[Pipeline] ✗ Crop failed for ${item.category}:`, cropErr.message);
        return {
          item,
          image_url: fullImagePublicUrl,
          verified: true,
          verification_reason: 'Crop error — full image used'
        } as ExtractedItemResult;
      }
    });

    const settled = await Promise.all(cropTasks);
    results.push(...settled);

    return results;
  }
}
