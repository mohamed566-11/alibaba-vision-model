import { GarmentInventory, GarmentItem } from './GarmentAnalysisService';

/**
 * Returns grid layout for N items.
 */
export function getLayoutForItems(count: number): { cols: number; rows: number } {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 2, rows: 1 };
  if (count === 3) return { cols: 3, rows: 1 };
  if (count === 4) return { cols: 2, rows: 2 };
  if (count <= 6) return { cols: 3, rows: 2 };
  return { cols: 3, rows: Math.ceil(count / 3) };
}

/**
 * Returns best output image size for the given number of items.
 * Fewer items → larger canvas → clearer detail.
 */
export function getOutputSize(count: number): string {
  if (count === 1) return '768*1024'; // Portrait — ideal for single garment
  if (count === 2) return '1024*512'; // Landscape 2-col
  return '512*512';                   // Square for 3+ items grid
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

    const itemLines = selected
      .map((item, idx) => `${idx + 1}. ${this.describe(item)}`)
      .join('\n');

    if (count === 1) {
      return `Edit this photo:
1. Remove the human model completely — erase all skin, face, hair, arms, legs, and replace with white.
2. Keep ONLY: ${itemLines}. Center it.
3. Output: professional product photo on pure white background, studio lighting.`;
    }

    const layout = getLayoutForItems(count);
    const posStr = selected.map((item, idx) => {
      const col = idx % layout.cols;
      const labels = ['left', 'center', 'right'];
      return `${this.describe(item)}: ${labels[col] || `col ${col + 1}`}`;
    }).join(', ');

    return `Edit this photo for e-commerce:
1. Remove person completely — erase face, hair, skin, arms, legs, feet. Replace with white.
2. Keep ONLY these ${count} items, arranged left-to-right in equal sections on white canvas:
${itemLines}
3. Layout: ${layout.cols} equal columns, 1 item per column (${posStr}).
4. Pure white background, studio lighting, no duplicates.`;
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
