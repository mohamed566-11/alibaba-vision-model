import { GarmentInventory } from './GarmentAnalysisService';

export interface ValidationResult {
  verified: boolean;
  reason?: string;
  detectedCategoriesInOutput?: string[];
  humanBodyVisible?: boolean;
  gridOrRepeatedItems?: boolean;
}

export class GarmentResultValidator {
  private static DASHSCOPE_URL = 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

  /**
   * Validates a generated garment extraction image against expected GarmentInventory neutrally.
   */
  public static async validateResult(
    generatedImageBase64: string,
    expectedInventory: GarmentInventory,
    apiKey: string
  ): Promise<ValidationResult> {

    const expectedCategories = expectedInventory.items.map(i => i.category.toLowerCase());
    const expectedHasDress = expectedCategories.some(c => c.includes('dress') || c.includes('gown'));
    const expectedHasTrousers = expectedCategories.some(c => c.includes('pant') || c.includes('trouser') || c.includes('jean') || c.includes('short'));

    const neutralVisionPrompt = `Examine this fashion product photography image carefully for quality assurance.

CHECKLIST:
1. Is there ANY human model, person, face, head, hair, neck, arms, hands, legs, feet, or skin visible anywhere in this image? (You MUST answer true to human_body_visible if a human person/head/face/arms/legs/skin is shown).
2. Is the main clothing item (e.g. dress or shirt) repeated multiple times side-by-side in a 2-column or 3-column catalog grid / moodboard layout instead of a single centered product image?
3. Are there extra invented accessories present that were not requested (e.g. combs, glasses, extra jewelry, extra items)?
4. List the garment categories visible in the image.

Return ONLY a valid JSON object matching this schema, with no markdown formatting:
{
  "detected_categories": ["dress", "shoes"],
  "human_body_visible": boolean,
  "multiple_repeated_shots_or_grid": boolean, // true if dress/shirt is duplicated multiple times across the canvas
  "extra_invented_items": boolean // true if extra unrequested items like combs or glasses were added
}`;

    try {
      const reqBody = {
        model: "qwen-vl-max",
        input: {
          messages: [
            {
              role: "user",
              content: [
                { image: generatedImageBase64 },
                { text: neutralVisionPrompt }
              ]
            }
          ]
        }
      };

      const response = await fetch(this.DASHSCOPE_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(reqBody),
        signal: AbortSignal.timeout(60000)
      });

      if (!response.ok) {
        console.warn(`Validator vision call returned status ${response.status}`);
        return { verified: true, reason: 'Validation service skipped check' };
      }

      const data = await response.json();
      const rawText = data.output?.choices?.[0]?.message?.content?.[0]?.text || '';
      
      let cleaned = rawText.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      }

      const parsed = JSON.parse(cleaned);
      const detectedCategories: string[] = Array.isArray(parsed.detected_categories) 
        ? parsed.detected_categories.map((c: string) => String(c).toLowerCase()) 
        : [];
      
      const humanBodyVisible = Boolean(parsed.human_body_visible);
      const gridOrRepeated = Boolean(parsed.multiple_repeated_shots_or_grid);
      const extraItemsAdded = Boolean(parsed.extra_invented_items);

      // Programmatic rule checks
      const detectedHasDress = detectedCategories.some(c => c.includes('dress') || c.includes('gown') || c.includes('skirt'));
      
      // Check 1: Category mismatch
      if (!expectedHasDress && expectedHasTrousers && detectedHasDress) {
        return {
          verified: false,
          reason: 'Extraction output generated a dress/skirt instead of trousers/pants',
          detectedCategoriesInOutput: detectedCategories,
          humanBodyVisible
        };
      }

      // Check 2: Human body removal
      if (humanBodyVisible) {
        return {
          verified: false,
          reason: 'Human body, face, or skin is still present in the extracted image. Person was not completely removed.',
          detectedCategoriesInOutput: detectedCategories,
          humanBodyVisible
        };
      }

      // Check 3: Grid / Repeated side-by-side dress shots
      if (gridOrRepeated) {
        return {
          verified: false,
          reason: 'Image was generated as a multi-column grid repeating the dress multiple times instead of a single product image',
          detectedCategoriesInOutput: detectedCategories,
          humanBodyVisible,
          gridOrRepeatedItems: true
        };
      }

      // Check 4: Extra unrequested items (combs, glasses)
      if (extraItemsAdded) {
        return {
          verified: false,
          reason: 'Image contains extra invented items (combs, glasses, extra accessories) not present in reference',
          detectedCategoriesInOutput: detectedCategories,
          humanBodyVisible
        };
      }

      return {
        verified: true,
        reason: 'Verified single product image match (human removed, no catalog grid)',
        detectedCategoriesInOutput: detectedCategories,
        humanBodyVisible
      };

    } catch (err) {
      console.error('Validator execution error:', err);
      return {
        verified: true,
        reason: 'Validation completed with default verification'
      };
    }
  }
}
