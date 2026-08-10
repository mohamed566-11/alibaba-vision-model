import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';

export class QwenImageEditService {
  private static DASHSCOPE_URL = 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

  // 512px = ~70KB base64 - fast enough for garment extraction (Stage 1 & 2)
  private static MAX_INPUT_PX = 512;

  // 768px = ~150KB base64 - higher fidelity for Virtual Try-On (person face + garment detail)
  private static MAX_INPUT_PX_HQ = 768;

  /**
   * Compresses and resizes input image for fast API payload transfer.
   * Used by: Garment extraction pipeline (Stage 2)
   */
  public static async compressInputImage(inputFilePath: string): Promise<{ base64: string; mime: string }> {
    const compressed = await sharp(inputFilePath)
      .resize(QwenImageEditService.MAX_INPUT_PX, QwenImageEditService.MAX_INPUT_PX, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 65, progressive: true })
      .toBuffer();
    return {
      base64: `data:image/jpeg;base64,${compressed.toString('base64')}`,
      mime: 'image/jpeg'
    };
  }

  /**
   * High-quality compression for Virtual Try-On inputs.
   * Uses 768px / quality 80 to preserve face identity, skin tone and garment texture.
   * Used by: GarmentTryOnService
   */
  public static async compressInputImageHQ(inputFilePath: string): Promise<{ base64: string; mime: string }> {
    const compressed = await sharp(inputFilePath)
      .resize(QwenImageEditService.MAX_INPUT_PX_HQ, QwenImageEditService.MAX_INPUT_PX_HQ, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 80, progressive: true })
      .toBuffer();
    return {
      base64: `data:image/jpeg;base64,${compressed.toString('base64')}`,
      mime: 'image/jpeg'
    };
  }

  /**
   * Calls qwen-image-edit-plus to extract garment items.
   * Implements auto-retry on 429 Rate Limit with exponential backoff.
   */
  public static async executeExtraction(
    base64Image: string, 
    prompt: string, 
    apiKey: string,
    generatedDir: string,
    outputSize = '512*512',
    retryCount = 0
  ): Promise<{ localPath: string; publicUrl: string; generatedFilename: string }> {
    
    const reqBody = {
      model: "qwen-image-edit",
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
      },
      parameters: {
        n: 1,
        prompt_extend: false,
        watermark: false,
        size: outputSize
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

    // Handle 429 Rate Limit: exponential backoff retry (max 3 retries)
    if (response.status === 429 && retryCount < 3) {
      const backoffMs = (retryCount + 1) * 3000;
      console.warn(`[QwenImageEditService] 429 Rate limit. Retrying in ${backoffMs / 1000}s (attempt ${retryCount + 1}/3)...`);
      await new Promise(r => setTimeout(r, backoffMs));
      return QwenImageEditService.executeExtraction(base64Image, prompt, apiKey, generatedDir, outputSize, retryCount + 1);
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Qwen Image Edit API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    let generatedImageUrl = '';

    try {
      generatedImageUrl = data.output.choices[0].message.content[0].image;
    } catch (e) {
      console.error('Failed to parse Qwen Image Edit response:', data);
      throw new Error('AI service did not return a valid image output.');
    }

    if (!generatedImageUrl) {
      throw new Error('AI service returned an empty image URL.');
    }

    const buffer = await this.downloadImageBuffer(generatedImageUrl);

    if (!fs.existsSync(generatedDir)) {
      fs.mkdirSync(generatedDir, { recursive: true });
    }

    const generatedFilename = `gen_${uuidv4()}.png`;
    const localPath = path.join(generatedDir, generatedFilename);
    fs.writeFileSync(localPath, buffer);

    return { localPath, publicUrl: `/uploads/generated/${generatedFilename}`, generatedFilename };
  }

  /**
   * Fast native HTTP/HTTPS image downloader (bypasses Undici connect timeout).
   */
  private static async downloadImageBuffer(url: string): Promise<Buffer> {
    const isHttps = url.startsWith('https:');
    const client = isHttps ? https : http;

    return new Promise((resolve, reject) => {
      const request = client.get(url, { timeout: 60000 }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return QwenImageEditService.downloadImageBuffer(res.headers.location).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Image download failed with status ${res.statusCode}`));
        }
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', err => reject(err));
      });

      request.on('error', (err) => {
        fetch(url, { signal: AbortSignal.timeout(60000) })
          .then(res => res.arrayBuffer())
          .then(ab => resolve(Buffer.from(ab)))
          .catch(() => reject(err));
      });

      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Image download timed out after 60s'));
      });
    });
  }
}
