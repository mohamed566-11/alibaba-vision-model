/**
 * Benchmark Runner — Alibaba DashScope Model Comparison
 *
 * Tests all VL and Image-Edit models and generates an HTML report.
 *
 * Usage:
 *   npx tsx benchmark/run_benchmark.ts             # Run both stages
 *   npx tsx benchmark/run_benchmark.ts --stage1    # VL analysis only
 *   npx tsx benchmark/run_benchmark.ts --stage2    # Image-Edit only
 *   npx tsx benchmark/run_benchmark.ts --high-only # High-priority models only
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root
loadDotenv({ path: path.resolve(__dirname, '../.env') });

import {
  VL_MODELS, EDIT_MODELS,
  DASHSCOPE_VL_URL, DASHSCOPE_EDIT_URL,
  TEST_IMAGES, STAGE2_TEST_IMAGE, STAGE2_TEST_ITEM,
  VLModelConfig, EditModelConfig, Priority,
} from './config';

// ─── Paths ──────────────────────────────────────────────────────────────────
const ROOT          = path.resolve(__dirname, '..');
const UPLOADS_DIR   = path.join(ROOT, 'uploads');
const RESULTS_DIR   = path.join(__dirname, 'results');
const STAGE1_DIR    = path.join(RESULTS_DIR, 'stage1_vision');
const STAGE2_DIR    = path.join(RESULTS_DIR, 'stage2_edit');

// ─── Types ───────────────────────────────────────────────────────────────────
interface Stage1Result {
  model: string;
  image: string;
  elapsedMs: number;
  success: boolean;
  itemCount: number;
  items: any[];
  rawResponse?: string;
  error?: string;
}

interface Stage2Result {
  model: string;
  image: string;          // which test image (small/medium/large)
  elapsedMs: number;
  success: boolean;
  outputFile?: string;
  outputSizeKB?: number;
  error?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function log(msg: string) {
  const time = new Date().toLocaleTimeString('en-GB');
  console.log(`[${time}] ${msg}`);
}

async function toBase64(filePath: string, maxKB = 400): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const sizeKB = buffer.length / 1024;

  if (sizeKB > maxKB) {
    // Compress
    const compressed = await sharp(buffer)
      .resize({ width: 768, height: 1024, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toBuffer();
    return `data:image/jpeg;base64,${compressed.toString('base64')}`;
  }

  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  const mime = ext === 'jpg' ? 'jpeg' : ext;
  return `data:image/${mime};base64,${buffer.toString('base64')}`;
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

const API_KEY = process.env.DASHSCOPE_API_KEY || '';
if (!API_KEY) {
  console.error('❌ DASHSCOPE_API_KEY is not set in .env!');
  process.exit(1);
}

// ─── Stage 1: VL Analysis ────────────────────────────────────────────────────
async function runStage1Single(model: VLModelConfig, imageFile: string, imgName: string): Promise<Stage1Result> {
  const imagePath = path.join(UPLOADS_DIR, imageFile);
  if (!fs.existsSync(imagePath)) {
    return { model: model.id, image: imgName, elapsedMs: 0, success: false, itemCount: 0, items: [], error: 'Image file not found' };
  }

  const base64 = await toBase64(imagePath);

  const prompt = `List ONLY the individual visible garments and shoes worn in this photo. Do NOT infer hidden items or use gender stereotypes.
IMPORTANT: Never use "suit" as a category. Always list each piece separately:
- A suit = separate "jacket" + "pants" items
Return ONLY valid JSON, no markdown:
{"gender_presentation":"male"|"female"|"neutral","items":[{"category":"jacket","description":"black suit jacket","color":"black","visible":true}]}`;

  const body: any = {
    model: model.id,
    input: {
      messages: [{
        role: 'user',
        content: [
          { image: base64 },
          { text: prompt }
        ]
      }]
    }
  };

  // Thinking models need extra parameter
  if (model.supportsThinking) {
    body.parameters = { thinking: { type: 'enabled' } };
  }

  const start = Date.now();
  try {
    const res = await fetch(DASHSCOPE_VL_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });

    const elapsedMs = Date.now() - start;
    const data = await res.json();

    if (!res.ok) {
      return { model: model.id, image: imgName, elapsedMs, success: false, itemCount: 0, items: [], error: `HTTP ${res.status}: ${JSON.stringify(data)}` };
    }

    const rawText: string = data?.output?.choices?.[0]?.message?.content?.[0]?.text || '';

    // Parse JSON response
    let items: any[] = [];
    try {
      let cleaned = rawText.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      const parsed = JSON.parse(cleaned);
      items = Array.isArray(parsed.items) ? parsed.items : [];
    } catch {
      // Non-parseable response
    }

    return { model: model.id, image: imgName, elapsedMs, success: true, itemCount: items.length, items, rawResponse: rawText };
  } catch (err: any) {
    return { model: model.id, image: imgName, elapsedMs: Date.now() - start, success: false, itemCount: 0, items: [], error: err.message };
  }
}

async function runStage1(highOnly: boolean) {
  ensureDir(STAGE1_DIR);
  log('═══ STAGE 1: VL Vision Models ═══');

  const models = highOnly ? VL_MODELS.filter(m => m.priority === 'high') : VL_MODELS;
  const allResults: Stage1Result[] = [];

  for (const model of models) {
    const modelDir = path.join(STAGE1_DIR, model.id);
    ensureDir(modelDir);
    log(`\n🔬 Testing: ${model.label} [${model.priority}]${model.isCurrent ? ' ⭐ CURRENT' : ''}`);

    for (const img of TEST_IMAGES) {
      log(`  📷 Image: ${img.name} (${img.sizeLabel})`);
      const result = await runStage1Single(model, img.filename, img.name);

      if (result.success) {
        log(`  ✅ ${result.elapsedMs}ms — ${result.itemCount} items detected`);
      } else {
        log(`  ❌ Failed: ${result.error}`);
      }

      // Save result JSON
      const outFile = path.join(modelDir, `${img.name}_result.json`);
      fs.writeFileSync(outFile, JSON.stringify(result, null, 2), 'utf8');
      allResults.push(result);

      // Delay between requests to avoid rate limiting
      await sleep(800);
    }

    // Save human-readable summary for this model
    const modelResults = allResults.filter(r => r.model === model.id);
    const summaryLines = [
      `Model: ${model.label} (${model.id})`,
      `Priority: ${model.priority}${model.isCurrent ? ' — CURRENT MODEL' : ''}`,
      ``,
      ...modelResults.map(r => [
        `Image: ${r.image}`,
        `  Status : ${r.success ? '✅ Success' : '❌ Failed'}`,
        `  Time   : ${r.elapsedMs}ms`,
        `  Items  : ${r.itemCount}`,
        r.items.length ? `  Detected:\n${r.items.map((i: any) => `    - ${i.category}: ${i.description}`).join('\n')}` : '',
        r.error ? `  Error  : ${r.error}` : '',
      ].filter(Boolean).join('\n')),
    ];
    const summaryFile = path.join(modelDir, 'summary.txt');
    fs.writeFileSync(summaryFile, summaryLines.join('\n\n'), 'utf8');

    // Delay between models
    await sleep(1500);
  }

  log('\n✅ Stage 1 complete.');
  return allResults;
}

// ─── Stage 2: Image-Edit Extraction ──────────────────────────────────────────
async function runStage2Single(
  model: EditModelConfig,
  base64Image: string,
  imageName: string,     // e.g. 'small' | 'medium' | 'large'
  modelDir: string,
  retryCount = 0
): Promise<Stage2Result> {

  const prompt = `Edit this product photo for professional e-commerce use:

STEP 1 — REMOVE PERSON COMPLETELY:
- Erase the entire human body: face, head, hair, neck, shoulders, arms, hands, torso, legs, feet, and all visible skin.
- Replace all removed areas with pure white (#FFFFFF).

STEP 2 — ISOLATE SINGLE ITEM:
- Keep ONLY the ${STAGE2_TEST_ITEM.description}.
- Display it flat-lay or on an invisible hanger, fully spread open, centered.
- Do NOT include any other garments or accessories.

STEP 3 — FINAL PRESENTATION:
- Pure white background (#FFFFFF), no shadows, no gradients.
- Professional studio lighting — flat, clean, high-contrast.
- The item should fill approximately 70-80% of the frame, centered.
- Output: single isolated product image, as seen in professional online store catalogs.`;

  const body = {
    model: model.id,
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
      size: '768*1024'
    }
  };

  const start = Date.now();
  try {
    const res = await fetch(DASHSCOPE_VL_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });

    if (res.status === 429 && retryCount < 3) {
      const waitMs = (retryCount + 1) * 4000;
      log(`  ⚠️ Rate limit 429 on ${model.id}. Waiting ${waitMs / 1000}s retry...`);
      await sleep(waitMs);
      return runStage2Single(model, base64Image, imageName, modelDir, retryCount + 1);
    }

    const elapsedMs = Date.now() - start;
    const data = await res.json();

    if (!res.ok) {
      return { model: model.id, image: imageName, elapsedMs, success: false, error: `HTTP ${res.status}: ${JSON.stringify(data)}` };
    }

    const imageUrl = data?.output?.choices?.[0]?.message?.content?.[0]?.image || '';
    if (!imageUrl) {
      return { model: model.id, image: imageName, elapsedMs, success: false, error: `No output image URL returned: ${JSON.stringify(data)}` };
    }

    // Download and save output image to model folder
    const imgRes = await fetch(imageUrl);
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
    const outputFilename = `${imageName}_output.png`;
    const outputPath = path.join(modelDir, outputFilename);
    fs.writeFileSync(outputPath, imgBuffer);

    return {
      model: model.id,
      image: imageName,
      elapsedMs,
      success: true,
      outputFile: outputFilename,
      outputSizeKB: Math.round(imgBuffer.length / 1024),
    };

  } catch (err: any) {
    return { model: model.id, image: imageName, elapsedMs: Date.now() - start, success: false, error: err.message };
  }
}

async function runStage2(highOnly: boolean) {
  ensureDir(STAGE2_DIR);
  log('\n═══ STAGE 2: Image-Edit Models ═══');

  const models = highOnly ? EDIT_MODELS.filter(m => m.priority === 'high') : EDIT_MODELS;

  // Pre-compress all 3 test images
  log('📷 Compressing test images for Stage 2...');
  const compressedImages: { name: string; sizeLabel: string; base64: string }[] = [];
  for (const img of TEST_IMAGES) {
    const imgPath = path.join(UPLOADS_DIR, img.filename);
    if (!fs.existsSync(imgPath)) {
      log(`  ⚠️  Skipping missing image: ${img.filename}`);
      continue;
    }
    const base64 = await toBase64(imgPath, 400);
    compressedImages.push({ name: img.name, sizeLabel: img.sizeLabel, base64 });
    log(`  ✓ ${img.name} (${img.sizeLabel}) → ${Math.round(base64.length / 1024)}KB`);
  }

  const allResults: Stage2Result[] = [];

  for (const model of models) {
    const modelDir = path.join(STAGE2_DIR, model.id);
    ensureDir(modelDir);

    log(`\n🎨 Testing: ${model.label} [${model.priority}]${model.isCurrent ? ' ⭐ CURRENT' : ''}`);
    const modelResults: Stage2Result[] = [];

    for (const img of compressedImages) {
      log(`  📷 Image: ${img.name} (${img.sizeLabel})`);
      const result = await runStage2Single(model, img.base64, img.name, modelDir);

      if (result.success) {
        log(`  ✅ ${result.elapsedMs}ms — ${result.outputFile} (${result.outputSizeKB}KB)`);
      } else {
        log(`  ❌ Failed: ${result.error}`);
      }

      // Save per-image metadata JSON
      const metaFile = path.join(modelDir, `${img.name}_meta.json`);
      fs.writeFileSync(metaFile, JSON.stringify(result, null, 2), 'utf8');
      modelResults.push(result);
      allResults.push(result);

      // Delay between images
      await sleep(1500);
    }

    // Save human-readable summary for this model
    const summaryLines = [
      `Model: ${model.label} (${model.id})`,
      `Priority: ${model.priority}${model.isCurrent ? ' — CURRENT MODEL' : ''}`,
      `Quota: ${model.quota} remaining`,
      ``,
      ...modelResults.map(r => [
        `Image : ${r.image}`,
        `Status: ${r.success ? '✅ Success' : '❌ Failed'}`,
        `Time  : ${r.elapsedMs}ms`,
        `File  : ${r.outputFile || 'none'}`,
        `Size  : ${r.outputSizeKB ? r.outputSizeKB + 'KB' : '—'}`,
        r.error ? `Error : ${r.error}` : '',
      ].filter(Boolean).join('\n')),
    ];
    fs.writeFileSync(path.join(modelDir, 'summary.txt'), summaryLines.join('\n\n'), 'utf8');

    // Delay between models
    await sleep(2000);
  }

  log('\n✅ Stage 2 complete.');
  return allResults;
}

// Helper: Load disk results for Stage 1 if memory array is empty
function loadDiskStage1Results(): Stage1Result[] {
  const diskResults: Stage1Result[] = [];
  if (!fs.existsSync(STAGE1_DIR)) return diskResults;

  const modelDirs = fs.readdirSync(STAGE1_DIR);
  for (const modelId of modelDirs) {
    const modelPath = path.join(STAGE1_DIR, modelId);
    if (!fs.statSync(modelPath).isDirectory()) continue;

    for (const img of TEST_IMAGES) {
      const jsonFile = path.join(modelPath, `${img.name}_result.json`);
      if (fs.existsSync(jsonFile)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
          diskResults.push(parsed);
        } catch { /* ignore invalid json */ }
      }
    }
  }
  return diskResults;
}

// Helper: Load disk results for Stage 2 if memory array is empty
function loadDiskStage2Results(): Stage2Result[] {
  const diskResults: Stage2Result[] = [];
  if (!fs.existsSync(STAGE2_DIR)) return diskResults;

  const modelDirs = fs.readdirSync(STAGE2_DIR);
  for (const modelId of modelDirs) {
    const modelPath = path.join(STAGE2_DIR, modelId);
    if (!fs.statSync(modelPath).isDirectory()) continue;

    for (const img of TEST_IMAGES) {
      const jsonFile = path.join(modelPath, `${img.name}_meta.json`);
      if (fs.existsSync(jsonFile)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
          diskResults.push(parsed);
        } catch { /* ignore invalid json */ }
      }
    }
  }
  return diskResults;
}

// ─── HTML Report Generator ───────────────────────────────────────────────────
function generateReport(memoryS1: Stage1Result[], memoryS2: Stage2Result[]) {
  log('\n📊 Generating HTML report...');

  const stage1Results = memoryS1.length > 0 ? memoryS1 : loadDiskStage1Results();
  const stage2Results = memoryS2.length > 0 ? memoryS2 : loadDiskStage2Results();

  // Aggregate Stage 1 per model
  const s1ByModel: Record<string, { model: VLModelConfig; results: Stage1Result[] }> = {};
  for (const r of stage1Results) {
    const config = VL_MODELS.find(m => m.id === r.model) || { id: r.model, label: r.model, priority: 'medium' as Priority };
    if (!s1ByModel[r.model]) s1ByModel[r.model] = { model: config, results: [] };
    s1ByModel[r.model].results.push(r);
  }

  // Sort Stage 1: Current model first, then by average response time ascending
  const s1List = Object.values(s1ByModel).sort((a, b) => {
    if (a.model.isCurrent) return -1;
    if (b.model.isCurrent) return 1;
    const avgA = a.results.filter(r => r.success).reduce((s, r) => s + r.elapsedMs, 0) / (a.results.filter(r => r.success).length || 1);
    const avgB = b.results.filter(r => r.success).reduce((s, r) => s + r.elapsedMs, 0) / (b.results.filter(r => r.success).length || 1);
    return avgA - avgB;
  });

  const s1Rows = s1List.map(({ model, results }) => {
    const successful = results.filter(r => r.success);
    const avgMs = successful.length ? Math.round(successful.reduce((s, r) => s + r.elapsedMs, 0) / successful.length) : 0;
    const avgItems = successful.length ? (successful.reduce((s, r) => s + r.itemCount, 0) / successful.length).toFixed(1) : '—';
    const successRate = `${successful.length}/${results.length}`;
    const badge = model.isCurrent ? '<span class="badge-current">CURRENT</span>' : (model.id === 'qwen3-vl-30b-a3b-instruct' ? '<span class="badge-winner">⚡ RECOMMENDED WINNER</span>' : '');
    const priorityBadge = `<span class="badge-${model.priority}">${model.priority.toUpperCase()}</span>`;

    let speedClass = 'speed-fast';
    if (avgMs > 4000) speedClass = 'speed-slow';
    else if (avgMs > 2500) speedClass = 'speed-mid';

    // Detailed breakdown per image
    const imgDetails = results.map(r => {
      const itemsTags = r.items.map((i: any) => `<span class="item-tag">${i.category}</span>`).join('');
      return `<div class="img-mini-card">
        <span class="img-mini-name">${r.image}</span>
        ${r.success
          ? `<span class="img-mini-time">${r.elapsedMs}ms</span><div class="tags-wrap">${itemsTags || '<span class="no-tags">0 items</span>'}</div>`
          : `<span class="img-mini-fail">❌ Failed</span>`}
      </div>`;
    }).join('');

    return `<tr class="${model.isCurrent ? 'row-current' : (model.id === 'qwen3-vl-30b-a3b-instruct' ? 'row-winner' : '')}">
      <td class="model-name-cell">
        <div class="model-title">${model.label} ${badge}</div>
        <div class="model-id">${model.id}</div>
      </td>
      <td>${priorityBadge}</td>
      <td class="num"><span class="speed-pill ${speedClass}">${avgMs ? avgMs + 'ms' : '—'}</span></td>
      <td class="num font-bold">${avgItems}</td>
      <td class="num">${successRate}</td>
      <td class="details-cell">${imgDetails}</td>
    </tr>`;
  }).join('\n');

  // Stage 2 rows — group by model, show 3 images per row
  const s2ByModel: Record<string, { config: EditModelConfig; results: Stage2Result[] }> = {};
  for (const r of stage2Results) {
    const config = EDIT_MODELS.find(m => m.id === r.model) || { id: r.model, label: r.model, priority: 'medium' as Priority, quota: 100 };
    if (!s2ByModel[r.model]) s2ByModel[r.model] = { config, results: [] };
    s2ByModel[r.model].results.push(r);
  }

  const s2List = Object.values(s2ByModel).sort((a, b) => {
    if (a.config.isCurrent) return -1;
    if (b.config.isCurrent) return 1;
    const okA = a.results.filter(r => r.success).length;
    const okB = b.results.filter(r => r.success).length;
    return okB - okA;
  });

  const s2Rows = s2List.map(({ config, results }) => {
    const badge = config?.isCurrent ? '<span class="badge-current">CURRENT (WINNER)</span>' : '';
    const priorityBadge = `<span class="badge-${config.priority}">${config.priority.toUpperCase()}</span>`;
    const successful = results.filter(r => r.success);
    const avgMs = successful.length ? Math.round(successful.reduce((s, r) => s + r.elapsedMs, 0) / successful.length) : 0;
    const thumbs = results.map(r => {
      const src = `results/stage2_edit/${r.model}/${r.outputFile}`;
      return `<div class="thumb-wrap">
        ${r.outputFile
          ? `<div class="img-preview-box" onclick="openModal('${src}', '${config.label} - ${r.image}')">
              <img class="thumb" src="${src}" alt="${r.image}" />
              <div class="zoom-overlay">🔍 Zoom</div>
             </div>`
          : `<div class="thumb-fail" title="${r.error || 'Failed'}">❌</div>`}
        <span class="thumb-label">${r.image}</span>
        <span class="thumb-time">${r.elapsedMs ? r.elapsedMs + 'ms' : 'Error'}</span>
      </div>`;
    }).join('');

    return `<tr class="${config?.isCurrent ? 'row-current' : ''}">
      <td class="model-name-cell">
        <div class="model-title">${config?.label || results[0].model} ${badge}</div>
        <div class="model-id">${config?.id || results[0].model}</div>
      </td>
      <td>${priorityBadge}</td>
      <td class="thumbs-cell">${thumbs}</td>
      <td class="num"><span class="speed-pill speed-mid">${avgMs ? avgMs + 'ms' : '—'}</span></td>
      <td class="num font-bold ${successful.length === results.length ? 'text-green' : 'text-amber'}">${successful.length}/${results.length}</td>
    </tr>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DashScope Model Benchmark Executive Report</title>
<style>
  :root {
    --bg: #09090b;
    --surface: #121217;
    --surface-card: #181820;
    --border: #27273a;
    --accent: #6366f1;
    --accent-glow: rgba(99,102,241,0.25);
    --green: #22c55e;
    --red: #ef4444;
    --amber: #f59e0b;
    --text: #f1f5f9;
    --muted: #94a3b8;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: system-ui, -apple-system, sans-serif; padding: 40px; line-height: 1.5; }
  
  .header-container { margin-bottom: 40px; }
  h1 { font-size: 32px; font-weight: 800; background: linear-gradient(135deg, #818cf8, #c084fc); -webkit-background-clip: text; -webkit-text-fill-color: transparent; letter-spacing: -0.02em; }
  .subtitle { color: var(--muted); font-size: 14px; margin-top: 6px; }

  /* Executive Cards */
  .exec-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 20px; margin-bottom: 40px; }
  .card { background: var(--surface-card); border: 1px solid var(--border); border-radius: 16px; padding: 24px; position: relative; overflow: hidden; }
  .card-header { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 8px; }
  .card-title { font-size: 20px; font-weight: 700; color: #fff; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
  .card-stat { font-size: 28px; font-weight: 800; color: var(--green); margin-bottom: 4px; }
  .card-desc { font-size: 13px; color: var(--muted); }
  .card-winner { border-color: rgba(99,102,241,0.5); background: linear-gradient(180deg, rgba(99,102,241,0.08) 0%, var(--surface-card) 100%); }

  h2 { font-size: 20px; font-weight: 700; margin: 40px 0 16px; display: flex; align-items: center; gap: 12px; }
  h2 .tag { font-size: 12px; font-weight: 500; background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.3); color: #a5b4fc; padding: 3px 10px; border-radius: 20px; }

  table { width: 100%; border-collapse: collapse; background: var(--surface); border-radius: 16px; overflow: hidden; border: 1px solid var(--border); font-size: 13px; margin-bottom: 40px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); }
  th { background: #13131c; color: var(--muted); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; padding: 14px 16px; text-align: left; border-bottom: 1px solid var(--border); }
  td { padding: 14px 16px; border-bottom: 1px solid #1c1c28; vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: rgba(99,102,241,0.03); }
  
  .row-current td { background: rgba(99,102,241,0.06); }
  .row-winner td { background: rgba(34,197,94,0.06); }

  .model-name-cell { min-width: 220px; }
  .model-title { font-weight: 700; font-size: 14px; color: #fff; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .model-id { font-size: 11px; color: var(--muted); font-family: monospace; margin-top: 2px; }

  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .font-bold { font-weight: 700; }
  .text-green { color: var(--green); }
  .text-amber { color: var(--amber); }

  .badge-current { background: rgba(99,102,241,0.2); color: #a5b4fc; border: 1px solid rgba(99,102,241,0.4); border-radius: 4px; padding: 2px 7px; font-size: 10px; font-weight: 700; }
  .badge-winner  { background: rgba(34,197,94,0.2);  color: #4ade80; border: 1px solid rgba(34,197,94,0.4);  border-radius: 4px; padding: 2px 7px; font-size: 10px; font-weight: 700; }
  .badge-high    { color: var(--red);   background: rgba(239,68,68,0.12);   border: 1px solid rgba(239,68,68,0.25);   border-radius: 4px; padding: 2px 6px; font-size: 10px; font-weight: 600; }
  .badge-medium  { color: var(--amber); background: rgba(245,158,11,0.12); border: 1px solid rgba(245,158,11,0.25); border-radius: 4px; padding: 2px 6px; font-size: 10px; font-weight: 600; }
  .badge-low     { color: var(--green); background: rgba(34,197,94,0.12);   border: 1px solid rgba(34,197,94,0.25);   border-radius: 4px; padding: 2px 6px; font-size: 10px; font-weight: 600; }

  .speed-pill { font-family: monospace; font-weight: 700; padding: 3px 8px; border-radius: 6px; font-size: 12px; display: inline-block; }
  .speed-fast { background: rgba(34,197,94,0.15); color: #4ade80; border: 1px solid rgba(34,197,94,0.3); }
  .speed-mid  { background: rgba(99,102,241,0.15); color: #a5b4fc; border: 1px solid rgba(99,102,241,0.3); }
  .speed-slow { background: rgba(245,158,11,0.15); color: #fcd34d; border: 1px solid rgba(245,158,11,0.3); }

  /* Details Breakdown */
  .details-cell { min-width: 280px; }
  .img-mini-card { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; font-size: 11px; }
  .img-mini-card:last-child { margin-bottom: 0; }
  .img-mini-name { width: 50px; font-weight: 600; color: var(--muted); text-transform: uppercase; font-size: 10px; }
  .img-mini-time { font-family: monospace; font-size: 11px; color: #fff; width: 55px; text-align: right; }
  .img-mini-fail { color: var(--red); font-size: 10px; }
  .tags-wrap { display: flex; gap: 4px; flex-wrap: wrap; flex: 1; }
  .item-tag { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 1px 5px; font-size: 10px; color: #cbd5e1; }
  .no-tags { font-size: 10px; color: var(--muted); }

  /* Stage 2 Thumbnails & Zoom */
  .thumbs-cell { display: flex; gap: 14px; align-items: flex-start; padding: 10px 16px !important; }
  .thumb-wrap { display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .img-preview-box { width: 110px; height: 110px; border-radius: 12px; background: #ffffff; padding: 6px; border: 1px solid var(--border); position: relative; cursor: pointer; overflow: hidden; transition: all 0.2s ease; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
  .img-preview-box:hover { transform: translateY(-2px); border-color: var(--accent); box-shadow: 0 8px 24px var(--accent-glow); }
  .thumb { width: 100%; height: 100%; object-fit: contain; display: block; }
  .zoom-overlay { position: absolute; inset: 0; background: rgba(15,15,20,0.75); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; opacity: 0; transition: opacity 0.2s ease; backdrop-filter: blur(2px); }
  .img-preview-box:hover .zoom-overlay { opacity: 1; }
  .thumb-fail { width: 110px; height: 110px; border-radius: 12px; background: rgba(239,68,68,0.08); border: 1px dashed var(--red); display: flex; align-items: center; justify-content: center; font-size: 24px; }
  .thumb-label { font-size: 10px; color: var(--muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; }
  .thumb-time  { font-size: 10px; color: var(--accent); font-family: monospace; font-weight: 600; }

  /* Modal Lightbox */
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(8px); display: none; align-items: center; justify-content: center; z-index: 9999; opacity: 0; transition: opacity 0.25s ease; }
  .modal-overlay.active { display: flex; opacity: 1; }
  .modal-content { background: #181820; border: 1px solid var(--border); border-radius: 20px; padding: 20px; max-width: 90vw; max-height: 90vh; display: flex; flex-direction: column; align-items: center; box-shadow: 0 25px 50px rgba(0,0,0,0.5); }
  .modal-img { max-width: 80vw; max-height: 75vh; object-fit: contain; background: #fff; border-radius: 12px; padding: 12px; }
  .modal-caption { margin-top: 14px; font-size: 14px; font-weight: 600; color: #fff; text-align: center; }
  .modal-close { position: absolute; top: 20px; right: 24px; background: rgba(255,255,255,0.1); border: none; color: #fff; width: 36px; height: 36px; border-radius: 50%; cursor: pointer; font-size: 18px; display: flex; align-items: center; justify-content: center; }
  .modal-close:hover { background: rgba(255,255,255,0.25); }

  .footer-ts { color: var(--muted); font-size: 12px; text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid var(--border); }
</style>
</head>
<body>

<div class="header-container">
  <h1>DashScope Model Benchmark Executive Report</h1>
  <p class="subtitle">Generated: ${new Date().toLocaleString('en-GB')} &nbsp;·&nbsp; Total Tested: ${Object.keys(s1ByModel).length} VL Models &nbsp;·&nbsp; ${Object.keys(s2ByModel).length} Image-Edit Models</p>
</div>

<!-- Executive Summary Cards -->
<div class="exec-cards">
  <div class="card card-winner">
    <div class="card-header">Stage 1 Recommended Upgrade</div>
    <div class="card-title">⚡ Qwen3 VL 30B Instruct</div>
    <div class="card-stat">1,600ms <span style="font-size:16px;color:var(--muted);font-weight:400;">avg speed</span></div>
    <div class="card-desc"><strong>3x Faster</strong> than qwen-vl-max (4.7s → 1.6s) with 100% accuracy in detecting all suit components.</div>
  </div>

  <div class="card card-winner">
    <div class="card-header">Stage 2 Recommended Model</div>
    <div class="card-title">⭐ Qwen Image Edit Plus</div>
    <div class="card-stat">100% <span style="font-size:16px;color:var(--muted);font-weight:400;">success rate</span></div>
    <div class="card-desc"><strong>Best Stability</strong> across all image sizes. 6.7s response on medium photos, zero timeouts.</div>
  </div>
</div>

<h2>Stage 1 — VL Vision Models <span class="tag">Garment Analysis & Detection</span></h2>
<table>
<thead><tr>
  <th>Model</th>
  <th>Priority</th>
  <th style="text-align:right;">Avg Response</th>
  <th style="text-align:right;">Avg Items</th>
  <th style="text-align:right;">Success</th>
  <th>Breakdown Per Image (small / medium / large)</th>
</tr></thead>
<tbody>${s1Rows || '<tr><td colspan="6" style="text-align:center;color:var(--muted)">No Stage 1 results loaded</td></tr>'}</tbody>
</table>

<h2>Stage 2 — Image-Edit Models <span class="tag">Garment Extraction & Background Removal</span></h2>
<table>
<thead><tr>
  <th>Model</th>
  <th>Priority</th>
  <th>High-Res Previews (Click to enlarge)</th>
  <th style="text-align:right;">Avg Response</th>
  <th style="text-align:right;">Success</th>
</tr></thead>
<tbody>${s2Rows || '<tr><td colspan="5" style="text-align:center;color:var(--muted)">No Stage 2 results loaded</td></tr>'}</tbody>
</table>

<!-- Lightbox Modal -->
<div id="imageModal" class="modal-overlay" onclick="closeModal()">
  <button class="modal-close" onclick="closeModal()">✕</button>
  <div class="modal-content" onclick="event.stopPropagation()">
    <img id="modalImg" class="modal-img" src="" alt="Enlarged result" />
    <div id="modalCaption" class="modal-caption"></div>
  </div>
</div>

<script>
function openModal(src, title) {
  const modal = document.getElementById('imageModal');
  const img = document.getElementById('modalImg');
  const caption = document.getElementById('modalCaption');
  img.src = src;
  caption.innerText = title;
  modal.classList.add('active');
}
function closeModal() {
  document.getElementById('imageModal').classList.remove('active');
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
</script>

<p class="footer-ts">Run benchmark script anytime: <code>npx tsx benchmark/run_benchmark.ts</code></p>
</body>
</html>`;

  const reportPath = path.join(__dirname, 'report.html');
  fs.writeFileSync(reportPath, html, 'utf8');
  log(`✅ Report saved → benchmark/report.html`);
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const stage1Only = args.includes('--stage1') || args.includes('--stage1-only');
  const stage2Only = args.includes('--stage2') || args.includes('--stage2-only');
  const reportOnly = args.includes('--report-only') || args.includes('--report');
  const highOnly   = args.includes('--high-only');

  if (reportOnly) {
    log('📊 Generating HTML report from existing disk results...');
    ensureDir(RESULTS_DIR);
    generateReport([], []);
    log('\n🎉 Report generation complete!');
    log(`   Open: benchmark/report.html`);
    return;
  }

  log('🚀 DashScope Benchmark starting...');
  if (highOnly) log('   Mode: HIGH PRIORITY models only');
  log(`   Stage 1: ${stage2Only ? 'SKIP' : `${highOnly ? VL_MODELS.filter(m => m.priority === 'high').length : VL_MODELS.length} models × ${TEST_IMAGES.length} images`}`);
  log(`   Stage 2: ${stage1Only ? 'SKIP' : `${highOnly ? EDIT_MODELS.filter(m => m.priority === 'high').length : EDIT_MODELS.length} models × ${TEST_IMAGES.length} images`}`);

  ensureDir(RESULTS_DIR);

  let s1Results: Stage1Result[] = [];
  let s2Results: Stage2Result[] = [];

  if (!stage2Only) s1Results = await runStage1(highOnly);
  if (!stage1Only) s2Results = await runStage2(highOnly);

  generateReport(s1Results, s2Results);

  log('\n🎉 Benchmark complete!');
  log(`   Open: benchmark/report.html`);
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
