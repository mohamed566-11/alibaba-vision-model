import sharp from 'sharp';

interface Gap {
  start: number;
  end: number;
  center: number;
  width: number;
}

interface SmartBoundaries {
  /** X-axis cut positions in original image pixels (N_cols - 1 values) */
  colCuts: number[];
  /** Y-axis cut positions in original image pixels (N_rows - 1 values) */
  rowCuts: number[];
  /** Whether smart detection succeeded or fell back to math */
  method: 'smart' | 'fallback';
}

/**
 * SmartCropService — content-aware image segmentation.
 *
 * Algorithm:
 *   1. Downscale the image to a fast analysis thumbnail (~256px wide)
 *   2. Convert to grayscale and extract raw pixel buffer
 *   3. Build per-column and per-row brightness profiles (avg brightness)
 *   4. Detect white "gap zones" — regions where avg brightness > threshold
 *   5. Select the best N interior gaps as separator positions
 *   6. Scale separator coordinates back to full image size
 *   7. Fallback to equal math division if detection fails
 *
 * Performance: ~5-15ms per image (all CPU, zero extra API calls).
 * Supports: any grid up to 6 items (3×1, 2×1, 2×2, 3×2, 3×1, etc.)
 */
export class SmartCropService {
  /** Width of the analysis thumbnail — small enough to be fast, large enough to detect gaps */
  private static readonly ANALYSIS_PX = 256;

  /** Pixels brighter than this (0-255) are considered "white/background" */
  private static readonly WHITE_THRESHOLDS = [250, 245, 240, 235, 228, 220];

  /** Minimum gap width in analysis pixels to count as a separator */
  private static readonly MIN_GAP_PX = 2;

  /**
   * Edge margin: ignore gaps in the outer N% of the image.
   * 10% is intentionally generous to avoid confusing outer padding
   * of the first/last item with an inter-item separator.
   */
  private static readonly EDGE_MARGIN_PCT = 0.10;

  /**
   * Detects natural separator boundaries in a combined garment grid image.
   *
   * @param imagePath  Path to the combined extraction image
   * @param nCols      Expected number of columns
   * @param nRows      Expected number of rows
   * @returns SmartBoundaries with cut positions in original pixel coordinates
   */
  public static async detect(
    imagePath: string,
    nCols: number,
    nRows: number
  ): Promise<SmartBoundaries> {
    // Trivial case
    if (nCols === 1 && nRows === 1) {
      return { colCuts: [], rowCuts: [], method: 'smart' };
    }

    // Read full image dimensions
    const meta = await sharp(imagePath).metadata();
    const origW = meta.width ?? 512;
    const origH = meta.height ?? 512;

    // Analysis thumbnail dimensions (preserve aspect ratio)
    const anaW = Math.min(origW, SmartCropService.ANALYSIS_PX);
    const anaH = Math.round(anaW * origH / origW);

    // Extract grayscale raw buffer at analysis resolution
    const { data: pixels } = await sharp(imagePath)
      .resize(anaW, anaH, { fit: 'fill', kernel: 'nearest' })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Build brightness profiles in a single pass for efficiency
    const colSums = new Float64Array(anaW);
    const rowSums = new Float64Array(anaH);

    for (let y = 0; y < anaH; y++) {
      const rowBase = y * anaW;
      for (let x = 0; x < anaW; x++) {
        const v = pixels[rowBase + x];
        colSums[x] += v;
        rowSums[y] += v;
      }
    }

    // Normalize to average brightness per axis
    const colProfile = colSums.map(s => s / anaH);
    const rowProfile = rowSums.map(s => s / anaW);

    const scaleX = origW / anaW;
    const scaleY = origH / anaH;

    // Detect separators for each axis
    const colCuts = SmartCropService.findSeparators(colProfile, anaW, nCols - 1, scaleX);
    const rowCuts = SmartCropService.findSeparators(rowProfile, anaH, nRows - 1, scaleY);

    const succeeded =
      colCuts.length === nCols - 1 &&
      rowCuts.length === nRows - 1;

    console.log(
      `[SmartCrop] ${succeeded ? '✓ Smart' : '⚠ Fallback'} detection: ` +
      `${nCols}×${nRows} grid on ${origW}×${origH} image. ` +
      `colCuts=[${colCuts}] rowCuts=[${rowCuts}]`
    );

    if (succeeded) {
      return { colCuts, rowCuts, method: 'smart' };
    }

    // Fallback: equal mathematical division
    return {
      colCuts: SmartCropService.equalDivision(origW, nCols),
      rowCuts: SmartCropService.equalDivision(origH, nRows),
      method: 'fallback'
    };
  }

  /**
   * Finds N separator positions in a brightness profile.
   * Tries multiple whiteness thresholds from strict → lenient.
   * Also validates that resulting cells are reasonably balanced.
   */
  private static findSeparators(
    profile: Float64Array,
    length: number,
    count: number,
    scale: number
  ): number[] {
    if (count <= 0) return [];

    for (const threshold of SmartCropService.WHITE_THRESHOLDS) {
      const gaps = SmartCropService.detectGaps(profile, length, threshold);
      const separators = SmartCropService.pickBestSeparators(gaps, length, count);

      if (separators.length === count && SmartCropService.areCellsBalanced(separators, length, count)) {
        return separators.map(s => Math.round(s * scale));
      }
    }

    return []; // Signal fallback needed
  }

  /**
   * Finds contiguous white regions (gaps) in a brightness profile.
   * Ignores outer EDGE_MARGIN_PCT% to avoid treating image padding as separators.
   */
  private static detectGaps(
    profile: Float64Array,
    length: number,
    threshold: number
  ): Gap[] {
    const gaps: Gap[] = [];
    let gapStart = -1;
    const edgeMargin = Math.round(length * SmartCropService.EDGE_MARGIN_PCT);

    for (let i = 0; i < length; i++) {
      const isWhite = profile[i] >= threshold;

      if (isWhite && gapStart === -1) {
        gapStart = i;
      } else if (!isWhite && gapStart !== -1) {
        const gapWidth = i - gapStart;
        if (gapWidth >= SmartCropService.MIN_GAP_PX) {
          const center = (gapStart + i - 1) / 2;
          // Only interior gaps (not outer padding)
          if (center > edgeMargin && center < length - edgeMargin) {
            gaps.push({ start: gapStart, end: i - 1, center, width: gapWidth });
          }
        }
        gapStart = -1;
      }
    }

    // Close any trailing gap
    if (gapStart !== -1) {
      const gapWidth = length - gapStart;
      const center = (gapStart + length - 1) / 2;
      const edgeMargin = Math.round(length * SmartCropService.EDGE_MARGIN_PCT);
      if (gapWidth >= SmartCropService.MIN_GAP_PX && center < length - edgeMargin) {
        gaps.push({ start: gapStart, end: length - 1, center, width: gapWidth });
      }
    }

    return gaps;
  }

  /**
   * Validates that detected cut positions create reasonably balanced cells.
   * Rejects if any cell is < 15% of the expected equal size (too lopsided).
   */
  private static areCellsBalanced(cuts: number[], length: number, count: number): boolean {
    const expectedSize = length / (count + 1); // Expected cell size if equal
    const minAcceptable = expectedSize * 0.30;  // Cells must be at least 30% of expected

    const boundaries = [0, ...cuts, length];
    for (let i = 0; i < boundaries.length - 1; i++) {
      const cellSize = boundaries[i + 1] - boundaries[i];
      if (cellSize < minAcceptable) return false;
    }
    return true;
  }

  /**
   * Picks the N best separator positions from detected gaps.
   *
   * Strategy:
   *  - If exactly N gaps found: use all of them
   *  - If more gaps found: pick the N widest (most prominent separators)
   *  - If fewer: signal failure
   */
  private static pickBestSeparators(gaps: Gap[], length: number, count: number): number[] {
    if (gaps.length < count) return [];
    if (gaps.length === count) return gaps.map(g => g.center).sort((a, b) => a - b);

    // Sort by width descending — widest gaps are the true separators
    const sorted = [...gaps].sort((a, b) => b.width - a.width);
    const picked = sorted.slice(0, count);
    return picked.map(g => g.center).sort((a, b) => a - b);
  }

  /**
   * Generates equal division cut positions (fallback).
   */
  private static equalDivision(length: number, nSegments: number): number[] {
    if (nSegments <= 1) return [];
    const segSize = length / nSegments;
    return Array.from({ length: nSegments - 1 }, (_, i) => Math.round((i + 1) * segSize));
  }

  /**
   * Converts cut positions into cell boundaries for a given grid position.
   *
   * @param cuts   Cut positions for this axis [c1, c2, ...]
   * @param total  Total image size on this axis
   * @param index  Cell index (0-based)
   * @returns { start, size } in original pixels
   */
  public static cellRange(
    cuts: number[],
    total: number,
    index: number
  ): { start: number; size: number } {
    const start = index === 0 ? 0 : cuts[index - 1];
    const end   = index >= cuts.length ? total : cuts[index];
    return { start, size: Math.max(end - start, 1) };
  }

  /**
   * Trims whitespace and pads to a clean square — from a file path.
   * Returns a Sharp instance ready for .toFile() or .toBuffer().
   */
  public static async trimAndPad(imagePath: string): Promise<ReturnType<typeof sharp>> {
    const buf = await sharp(imagePath).png().toBuffer();
    return SmartCropService.trimAndPadBuffer(buf);
  }

  /**
   * OPTIMIZED: Trim outer whitespace + remove separator lines in ONE Sharp pipeline.
   *
   * Instead of: trim (decode→encode) → removeLines (decode→decode→encode)
   * We do:      trim (decode) → raw pixels → fix lines → encode
   *
   * Saves ~1 full Sharp decode/encode cycle (~15-20ms on a 1024px image).
   */
  public static async trimAndClean(imagePath: string): Promise<void> {
    // Step 1: Trim whitespace (Sharp handles this efficiently)
    let trimmedBuf: Buffer;
    try {
      trimmedBuf = await sharp(imagePath)
        .trim({ background: '#FFFFFF', threshold: 15 })
        .png()
        .toBuffer();
    } catch {
      trimmedBuf = await sharp(imagePath).png().toBuffer();
    }

    // Step 2: Get raw RGBA buffer + metadata in one call
    const { data: raw, info } = await sharp(trimmedBuf)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width: W, height: H, channels: ch } = info;

    // Step 3: Build per-column darkness fraction (inline greyscale: 0.299R+0.587G+0.114B)
    const darkFrac = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      let dark = 0;
      for (let y = 0; y < H; y++) {
        const off = (y * W + x) * ch;
        const grey = raw[off] * 0.299 + raw[off + 1] * 0.587 + raw[off + 2] * 0.114;
        if (grey < 80) dark++;
      }
      darkFrac[x] = dark / H;
    }

    // Step 4: Find thin dark column runs (separator lines)
    //
    // Calibration (why these values):
    //   True AI separator lines: 90-100% of column pixels are pure black → threshold 0.85 catches them
    //   Dark jacket lapel edges: only 60-75% dark (garment doesn't span 100% of column height)
    //   → raising threshold from 0.60 to 0.85 eliminates garment false positives
    //   EXPAND = 1px is enough to cover aliased line edges without cutting into garments
    const LINE_DARK = 0.85; // ← was 0.60; raised to avoid misidentifying jacket edges
    const MAX_WIDTH = 10;   // Separator lines are thin (≤10px)
    const EXPAND = 1;       // ← was 3; minimal expansion to avoid garment slicing
    const toWhiten = new Uint8Array(W);
    let runStart = -1;

    for (let x = 0; x <= W; x++) {
      const isDark = x < W && darkFrac[x] >= LINE_DARK;
      if (isDark && runStart === -1) { runStart = x; }
      else if (!isDark && runStart !== -1) {
        if (x - runStart <= MAX_WIDTH) {
          for (let dx = -EXPAND; dx < (x - runStart) + EXPAND; dx++) {
            const px = runStart + dx;
            if (px >= 0 && px < W) toWhiten[px] = 1;
          }
        }
        runStart = -1;
      }
    }

    // Step 5: Paint separator columns white (in the same raw buffer)
    const lineCount = toWhiten.reduce((s, v) => s + v, 0);
    if (lineCount > 0) {
      for (let x = 0; x < W; x++) {
        if (!toWhiten[x]) continue;
        for (let y = 0; y < H; y++) {
          const off = (y * W + x) * ch;
          raw[off] = raw[off + 1] = raw[off + 2] = raw[off + 3] = 255;
        }
      }
      console.log(`[SmartCrop] 🧹 Trimmed + removed ${lineCount} separator columns.`);
    } else {
      console.log('[SmartCrop] ✓ Trimmed (no separator lines found).');
    }

    // Step 6: Write final cleaned image back to disk (single encode)
    await sharp(raw, { raw: { width: W, height: H, channels: ch } })
      .png()
      .toFile(imagePath);
  }

  /**
   * Trims whitespace, upscales to fill a target size, then pads to square.
   *
   * Flow: trim → resize to fill TARGET_SIZE → pad to square
   */
  public static async trimAndPadBuffer(inputBuffer: Buffer): Promise<ReturnType<typeof sharp>> {
    const TARGET_SIZE = 600; // ← Increased for larger card display

    const origMeta = await sharp(inputBuffer).metadata();
    const origW = origMeta.width ?? 400;
    const origH = origMeta.height ?? 400;
    const origArea = origW * origH;

    let trimmedBuffer: Buffer | null = null;

    // Try progressively lenient thresholds — stop when result retains ≥50% area
    for (const threshold of [12, 8, 5]) {
      try {
        const candidate = await sharp(inputBuffer)
          .trim({ background: '#FFFFFF', threshold })
          .png()
          .toBuffer();

        const meta = await sharp(candidate).metadata();
        const w = meta.width ?? 0;
        const h = meta.height ?? 0;
        if (w >= 30 && h >= 30 && w * h >= origArea * 0.50) {
          trimmedBuffer = candidate;
          break;
        }
      } catch {
        break;
      }
    }

    const finalBuffer = trimmedBuffer ?? inputBuffer;

    // Get trimmed dimensions
    const meta = await sharp(finalBuffer).metadata();
    const trimW = meta.width ?? origW;
    const trimH = meta.height ?? origH;

    // Upscale: resize item so its longest side = 85% of TARGET_SIZE
    // This makes items appear large and consistent across all cards
    const fillSize = Math.round(TARGET_SIZE * 0.82);
    const scale = Math.min(fillSize / trimW, fillSize / trimH);
    const newW = Math.max(Math.round(trimW * scale), 1);
    const newH = Math.max(Math.round(trimH * scale), 1);

    // Resize item, then pad to TARGET_SIZE square
    const padH = TARGET_SIZE - newH;
    const padW = TARGET_SIZE - newW;

    return sharp(finalBuffer)
      .resize(newW, newH, { fit: 'inside', kernel: 'lanczos3', withoutEnlargement: false })
      .extend({
        top:    Math.floor(padH / 2),
        bottom: Math.ceil(padH  / 2),
        left:   Math.floor(padW / 2),
        right:  Math.ceil(padW  / 2),
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .png();
  }

  /**
   * Removes thin dark separator/divider lines from a combined grid image.
   *
   * Algorithm:
   *   1. Get raw grayscale pixels (very fast)
   *   2. Scan every column: compute fraction of pixels that are dark (<80)
   *   3. Any column where ≥70% pixels are dark = separator line
   *   4. Find contiguous runs of dark columns
   *   5. Accept runs ≤ 12px wide (lines), ignore wider runs (garments)
   *   6. Expand each line by ±2px, paint all identified pixels white
   *   7. Write modified image back to disk
   *
   * Cost: ~5ms CPU, zero API calls.
   */
  public static async removeArtifactLines(imagePath: string): Promise<boolean> {
    const meta = await sharp(imagePath).metadata();
    const W = meta.width!;
    const H = meta.height!;

    // Get raw grayscale buffer for fast analysis
    const { data: grey } = await sharp(imagePath)
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Build per-column darkness fraction
    const darkFrac = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      let dark = 0;
      for (let y = 0; y < H; y++) {
        if (grey[y * W + x] < 80) dark++;
      }
      darkFrac[x] = dark / H;
    }

    // Find contiguous "dark column" runs → candidate lines
    const LINE_DARK_THRESHOLD = 0.85; // Must be 85%+ dark — real lines are 90-100%, jacket edges are 60-75%
    const MAX_LINE_WIDTH = 10;        // Separator lines are thin (≤10px)
    const EXPAND = 1;                 // Minimal expansion — avoids slicing into garments

    const toWhiten = new Uint8Array(W); // 1 = paint white
    let runStart = -1;

    for (let x = 0; x <= W; x++) {
      const isDark = x < W && darkFrac[x] >= LINE_DARK_THRESHOLD;

      if (isDark && runStart === -1) {
        runStart = x;
      } else if (!isDark && runStart !== -1) {
        const runLen = x - runStart;
        if (runLen <= MAX_LINE_WIDTH) {
          // It's a thin separator line — mark for whitening (with expansion)
          for (let dx = -EXPAND; dx < runLen + EXPAND; dx++) {
            const px = runStart + dx;
            if (px >= 0 && px < W) toWhiten[px] = 1;
          }
        }
        runStart = -1;
      }
    }

    const lineCount = toWhiten.reduce((s, v) => s + v, 0);
    if (lineCount === 0) return false; // Nothing to remove

    // Get full RGBA raw buffer and paint separator columns white
    const { data: raw, info } = await sharp(imagePath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const ch = info.channels; // 4 with ensureAlpha
    for (let x = 0; x < W; x++) {
      if (!toWhiten[x]) continue;
      for (let y = 0; y < H; y++) {
        const off = (y * W + x) * ch;
        raw[off]     = 255; // R
        raw[off + 1] = 255; // G
        raw[off + 2] = 255; // B
        raw[off + 3] = 255; // A
      }
    }

    await sharp(raw, { raw: { width: W, height: H, channels: ch } })
      .png()
      .toFile(imagePath);

    console.log(`[SmartCrop] 🧹 Removed ${lineCount} separator-line columns from image.`);
    return true;
  }
}
