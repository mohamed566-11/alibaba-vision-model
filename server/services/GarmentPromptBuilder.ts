import { GarmentInventory, GarmentItem } from './GarmentAnalysisService';

/**
 * Returns grid layout for N items.
 *
 * Key insight: models follow HORIZONTAL ROWS much more reliably than 2D grids.
 * For 5 items, a 5×1 single row is far more predictable than a 3×2 grid.
 */
export function getLayoutForItems(count: number): { cols: number; rows: number } {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 2, rows: 1 };
  if (count === 3) return { cols: 3, rows: 1 };
  if (count === 4) return { cols: 4, rows: 1 }; // Single row — most reliable
  if (count === 5) return { cols: 5, rows: 1 }; // Single row — most reliable
  if (count === 6) return { cols: 3, rows: 2 }; // 2D only for 6 (model handles pairs better)
  return { cols: 3, rows: Math.ceil(count / 3) };
}

/**
 * Returns best output image size for the given number of items.
 *
 * Rules:
 *  - Fewer items → larger canvas per item → more detail
 *  - More items → wider/taller canvas so each cell is still readable
 *  - All sizes are supported by qwen-image-edit-plus
 */
export function getOutputSize(count: number): string {
  if (count === 1) return '768*1024';  // Portrait — ideal for single garment
  if (count === 2) return '1024*512';  // Wide 2-col single row
  if (count === 3) return '1024*512';  // Wide 3-col single row
  if (count === 4) return '1024*512';  // Wide 4-col single row (was 2×2, now simpler)
  if (count === 5) return '1024*512';  // Wide 5-col single row
  return '1024*512';                   // Wide 3×2
}

export class GarmentPromptBuilder {
  /**
   * Builds a clear, concise extraction prompt for ALL selected items.
   * Shorter = faster tokenization + better model compliance.
   */
  public static buildExtractionPrompt(inventory: GarmentInventory): string {
    const selected = inventory.items.filter(i => i.visible !== false);
    const count = selected.length;

    if (count === 0) {
      return 'Remove the person. Show only the visible clothing items on white background.';
    }

    if (count === 1) {
      return `Edit this photo:
1. Remove the human model completely — erase all skin, face, hair, arms, legs, and replace with white.
2. Keep ONLY: ${this.describe(selected[0])}. Center it.
3. Output: professional product photo on pure white background, studio lighting.`;
    }

    const layout = getLayoutForItems(count);
    const { cols, rows } = layout;

    // Build explicit per-item position instructions
    const colLabels = ['leftmost', 'second from left', 'center', 'second from right', 'rightmost'];
    const rowLabels = ['top', 'bottom'];

    const itemPositions = selected.map((item, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const colLabel = cols <= 5 ? (colLabels[col] ?? `column ${col + 1}`) : `column ${col + 1} of ${cols}`;
      const rowLabel = rows > 1 ? ` in the ${rowLabels[row] ?? `row ${row + 1}`} half` : '';
      return `  - ${this.describe(item)}: ${colLabel}${rowLabel}`;
    }).join('\n');

    const layoutDesc = rows === 1
      ? `ONE horizontal row with ${cols} equal columns (left to right)`
      : `${cols}-column × ${rows}-row grid`;

    return `Edit this photo for e-commerce:
1. Remove person completely — erase face, hair, skin, arms, legs, feet. Replace with pure white.
2. Keep ONLY these ${count} items. Arrange them in a ${layoutDesc}:
${itemPositions}
3. STRICT RULES — follow exactly:
   - Exactly ONE item per column, floating cleanly on white.
   - NO divider lines, NO borders, NO grid lines, NO separator marks between columns.
   - NO text, NO labels, NO captions, NO watermarks of any kind.
   - NO shadows or reflections.
   - Pure white (#FFFFFF) background everywhere. Studio lighting only.`;
  }

  /**
   * Short recovery prompt for retry.
   */
  public static buildRecoveryPrompt(inventory: GarmentInventory): string {
    const selected = inventory.items.filter(i => i.visible !== false);
    const list = selected.map((i, idx) => `${idx + 1}. ${this.describe(i)}`).join(', ');
    return `Remove the person entirely. Show only: ${list}. White background, one item per section, left to right.`;
  }

  private static describe(item: GarmentItem): string {
    const desc = item.description.trim();
    const col = item.color.trim();
    if (col && col !== 'original' && !new RegExp(`\\b${col}\\b`, 'i').test(desc)) {
      return `${col} ${desc}`;
    }
    return desc;
  }

  public static buildSingleItemPrompt(item: GarmentItem, _gender: string): string {
    return `Remove the human model completely. Show ONLY the ${this.describe(item)} centered on pure white background. Professional studio product photo.`;
  }
}
