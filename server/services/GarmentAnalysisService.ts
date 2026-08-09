import { v4 as uuidv4 } from 'uuid';

export interface GarmentItem {
  id: string;
  category: string;
  description: string;
  color: string;
  visible: boolean;
}

export interface GarmentInventory {
  gender_presentation: 'male' | 'female' | 'neutral';
  items: GarmentItem[];
}

export class GarmentAnalysisService {
  private static DASHSCOPE_URL = 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

  /**
   * Analyzes input image to create structured garment inventory.
   * Uses a short prompt to minimize token processing time.
   */
  public static async analyzeImage(base64Image: string, apiKey: string): Promise<GarmentInventory> {
    // Short, precise prompt — fewer tokens = faster response
    const prompt = `List ONLY the visible garments and shoes worn in this photo. Do NOT infer hidden items or use gender stereotypes.
Return ONLY valid JSON, no markdown:
{"gender_presentation":"male"|"female"|"neutral","items":[{"category":"shirt","description":"white button-up shirt","color":"white","visible":true}]}`;

    const reqBody = {
      model: "qwen3-vl-30b-a3b-instruct",
      input: {
        messages: [
          {
            role: "user",
            content: [
              { image: base64Image },
              { text: prompt }
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
      signal: AbortSignal.timeout(30000)  // 30s max for analysis
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Garment Analysis API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const rawText = data.output?.choices?.[0]?.message?.content?.[0]?.text || '';
    
    return this.parseInventoryResponse(rawText);
  }

  private static parseInventoryResponse(rawText: string): GarmentInventory {
    let cleaned = rawText.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    }

    try {
      const parsed = JSON.parse(cleaned);
      const items: GarmentItem[] = Array.isArray(parsed.items) ? parsed.items.map((item: any) => ({
        id: item.id || uuidv4(),
        category: String(item.category || 'Garment').toLowerCase(),
        description: String(item.description || item.category || 'Clothing item'),
        color: String(item.color || 'original'),
        visible: item.visible !== false
      })) : [];

      return {
        gender_presentation: (['male', 'female', 'neutral'].includes(parsed.gender_presentation) 
          ? parsed.gender_presentation 
          : 'neutral') as 'male' | 'female' | 'neutral',
        items
      };
    } catch (err) {
      console.error('Failed to parse Garment Analysis JSON:', rawText, err);
      return {
        gender_presentation: 'neutral',
        items: [
          {
            id: uuidv4(),
            category: 'garment',
            description: 'Visible clothing from reference image',
            color: 'original',
            visible: true
          }
        ]
      };
    }
  }
}
