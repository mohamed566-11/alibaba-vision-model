/**
 * Virtual Try-On Benchmark Runner
 * ─────────────────────────────────────────────────────────────────
 * Tests every Image-Edit & Image-Generation model for Try-On capability:
 *   ✦ Does the model accept multi-image input?
 *   ✦ How many garment photos can it handle? (tests 1 → 5 garments)
 *   ✦ How fast is it?
 *   ✦ Saves output images for visual comparison
 *
 * Usage:
 *   npx tsx benchmark/run_tryon_benchmark.ts               # All 21 models
 *   npx tsx benchmark/run_tryon_benchmark.ts --edit-only   # Edit models only (Group A)
 *   npx tsx benchmark/run_tryon_benchmark.ts --gen-only    # Gen models only  (Group B)
 *   npx tsx benchmark/run_tryon_benchmark.ts --fast        # 1-garment test only (quick scan)
 *   npx tsx benchmark/run_tryon_benchmark.ts --model qwen-image-2.0-pro
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

loadDotenv({ path: path.resolve(__dirname, '../.env') });

// ─── Constants ───────────────────────────────────────────────────────────────
const API_KEY     = process.env.DASHSCOPE_API_KEY || process.env.VITE_DASHSCOPE_API_KEY || '';
const API_URL     = 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
const ROOT        = path.resolve(__dirname, '..');
const UPLOADS_DIR = path.join(ROOT, 'uploads');
const RESULTS_DIR = path.join(__dirname, 'results', 'tryon');
const REPORT_PATH = path.join(__dirname, 'tryon_report.html');
const JSON_PATH   = path.join(__dirname, 'results', 'tryon_results.json');

// ─── Model Registry ──────────────────────────────────────────────────────────

interface TryOnModelConfig {
  id: string;
  label: string;
  group: 'edit' | 'gen';
  verified?: boolean;   // hand-tested by user
  isCurrent?: boolean;
  quota: number;
}

const ALL_MODELS: TryOnModelConfig[] = [
  // ── Group A: Image Edit Models ──────────────────────────────────────────────
  { id: 'qwen-image-edit-plus',            label: 'Image Edit Plus',           group: 'edit', isCurrent: true, quota: 100 },
  { id: 'qwen-image-2.0-pro',              label: 'Image 2.0 Pro',             group: 'edit', verified: true,  quota: 100 },
  { id: 'qwen-image-2.0-pro-2026-03-03',   label: 'Image 2.0 Pro (03-03)',     group: 'edit', verified: true,  quota: 100 },
  { id: 'qwen-image-2.0-2026-03-03',       label: 'Image 2.0 (03-03)',         group: 'edit', verified: true,  quota: 100 },
  { id: 'qwen-image-2.0-pro-2026-06-22',   label: 'Image 2.0 Pro (06-22)',     group: 'edit', verified: true,  quota: 100 },
  { id: 'qwen-image-2.0-pro-2026-04-22',   label: 'Image 2.0 Pro (04-22)',     group: 'edit', verified: true,  quota: 100 },
  { id: 'qwen-image-edit-max',             label: 'Image Edit Max',            group: 'edit', quota: 100 },
  { id: 'qwen-image-edit',                 label: 'Image Edit',                group: 'edit', quota: 100 },
  { id: 'qwen-image-edit-plus-2025-10-30', label: 'Image Edit Plus (10-30)',   group: 'edit', quota: 100 },
  { id: 'qwen-image-edit-plus-2025-12-15', label: 'Image Edit Plus (12-15)',   group: 'edit', quota: 100 },
  { id: 'qwen-image-edit-max-2026-01-16',  label: 'Image Edit Max (01-16)',    group: 'edit', quota: 100 },

  // ── Group B: Image Generation Models ────────────────────────────────────────
  { id: 'qwen-image-3.0-pro',              label: 'Image 3.0 Pro',             group: 'gen',  quota: 10  },
  { id: 'qwen-image-3.0',                  label: 'Image 3.0',                 group: 'gen',  quota: 10  },
  { id: 'qwen-image-max',                  label: 'Image Max',                 group: 'gen',  quota: 100 },
  { id: 'qwen-image-plus',                 label: 'Image Plus',                group: 'gen',  quota: 100 },
  { id: 'qwen-image',                      label: 'Image',                     group: 'gen',  quota: 100 },
  { id: 'wan2.7-image-pro',                label: 'Wan2.7 Image Pro',          group: 'gen',  quota: 50  },
  { id: 'wan2.7-image',                    label: 'Wan2.7 Image',              group: 'gen',  quota: 50  },
  { id: 'z-image-turbo',                   label: 'Z-Image Turbo',             group: 'gen',  quota: 100 },
  { id: 'wan2.1-t2i-turbo',                label: 'Wan2.1 T2I Turbo',         group: 'gen',  quota: 200 },
  { id: 'wan2.1-t2i-plus',                 label: 'Wan2.1 T2I Plus',          group: 'gen',  quota: 200 },
];

// ─── Test asset config ───────────────────────────────────────────────────────
// Point these to actual images in your uploads/ directory.
// Run the Garment Extractor first to get garment images, then set paths here.
const TEST_ASSETS = {
  // Person photo — a full-body or half-body portrait
  person: 'PERSON_PHOTO.jpg',         // <── SET THIS to an actual file in uploads/

  // Garment reference photos — extracted from Garment Extractor
  garments: [
    'GARMENT_1_pants.png',            // <── SET THESE to crop_*.png from uploads/generated/
    'GARMENT_2_shirt.png',
    'GARMENT_3_jacket.png',
    'GARMENT_4_shoes.png',
    'GARMENT_5_accessory.png',
  ],
};

// ─── CLI Flags ───────────────────────────────────────────────────────────────
const args        = process.argv.slice(2);
const EDIT_ONLY   = args.includes('--edit-only');
const GEN_ONLY    = args.includes('--gen-only');
const FAST_MODE   = args.includes('--fast');         // Only run 1-garment test
const MODEL_ARG   = args.find(a => a.startsWith('--model='))?.split('=')[1]
                 || (args.includes('--model') ? args[args.indexOf('--model') + 1] : null);

// ─── Types ───────────────────────────────────────────────────────────────────

type TestLevel = 1 | 2 | 3 | 4 | 5;   // number of garments

interface SingleTestResult {
  garmentCount: TestLevel;
  accepted: boolean;         // HTTP 200 received
  hasImage: boolean;         // Image URL found in response
  elapsedMs: number;
  outputFile?: string;       // saved filename
  outputSizeKB?: number;
  errorCode?: number;
  errorMessage?: string;
  skipped?: boolean;         // skipped because lower level failed
}

interface ModelTryOnResult {
  model: TryOnModelConfig;
  tests: Partial<Record<TestLevel, SingleTestResult>>;
  maxAccepted: number;       // highest garment count that succeeded (0 = none)
  avgElapsedMs: number;
  status: 'full' | 'partial' | 'failed' | 'skipped';
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function ensureDir(d: string) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

function log(msg: string, level: 'info' | 'ok' | 'warn' | 'err' = 'info') {
  const icons = { info: '•', ok: '✓', warn: '⚠', err: '✗' };
  const t = new Date().toLocaleTimeString('en-GB');
  console.log(`[${t}] ${icons[level]} ${msg}`);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function toBase64HQ(filePath: string): Promise<string> {
  const buf = fs.readFileSync(filePath);
  const sizeKB = buf.length / 1024;
  if (sizeKB > 200) {
    // Compress to 768px for HQ input
    const compressed = await sharp(buf)
      .resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    return `data:image/jpeg;base64,${compressed.toString('base64')}`;
  }
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function extractOutputUrl(data: any): string | null {
  return (
    data?.output?.choices?.[0]?.message?.content?.[0]?.image ||
    data?.output?.results?.[0]?.url ||
    data?.output?.render_urls?.[0] ||
    null
  );
}

// ─── Core Test Function ───────────────────────────────────────────────────────

const TRYON_PROMPT = (garmentCount: number): string => `
Virtual try-on: Photo 1 is the person. Photos 2–${garmentCount + 1} are garments to dress them in.
Preserve the person's face and identity exactly.
Dress the person in all provided garments. Replace background with pure white.
Show the full body from head to feet with breathing room on all sides.
`.trim();

async function runSingleTest(
  model: TryOnModelConfig,
  personBase64: string,
  garmentBase64s: string[],
  garmentCount: TestLevel,
  outputDir: string
): Promise<SingleTestResult> {

  const slicedGarments = garmentBase64s.slice(0, garmentCount);
  const content: any[] = [
    { image: personBase64 },
    ...slicedGarments.map(b => ({ image: b })),
    { text: TRYON_PROMPT(garmentCount) },
  ];

  const reqBody = {
    model: model.id,
    input: { messages: [{ role: 'user', content }] },
    parameters: { n: 1, prompt_extend: false, watermark: false, output_size: '768*1024' },
  };

  const start = Date.now();

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
      signal: AbortSignal.timeout(90_000),
    });

    const elapsedMs = Date.now() - start;
    const rawText   = await response.text();

    if (!response.ok) {
      return {
        garmentCount, accepted: false, hasImage: false, elapsedMs,
        errorCode: response.status, errorMessage: rawText.slice(0, 300),
      };
    }

    const data = JSON.parse(rawText);
    const imageUrl = extractOutputUrl(data);

    if (!imageUrl) {
      return {
        garmentCount, accepted: true, hasImage: false, elapsedMs,
        errorMessage: `No image URL in response: ${rawText.slice(0, 200)}`,
      };
    }

    // Download & save output image
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
    if (!imgRes.ok) throw new Error(`Image download failed: ${imgRes.status}`);

    const imgBuf  = Buffer.from(await imgRes.arrayBuffer());
    const safeId  = model.id.replace(/[^a-z0-9.-]/gi, '_');
    const outName = `${safeId}_g${garmentCount}.png`;
    const outPath = path.join(outputDir, outName);
    fs.writeFileSync(outPath, imgBuf);

    return {
      garmentCount, accepted: true, hasImage: true, elapsedMs,
      outputFile: outName,
      outputSizeKB: Math.round(imgBuf.length / 1024),
    };

  } catch (err: any) {
    return {
      garmentCount, accepted: false, hasImage: false,
      elapsedMs: Date.now() - start,
      errorMessage: err.name === 'TimeoutError' ? 'Timed out after 90s' : err.message,
    };
  }
}

// ─── Model Runner ─────────────────────────────────────────────────────────────

async function runModelBenchmark(
  model: TryOnModelConfig,
  personBase64: string,
  garmentBase64s: string[],
  levels: TestLevel[],
  outputDir: string
): Promise<ModelTryOnResult> {

  log(`\n═══ ${model.id} (group: ${model.group}) ═══`);
  const tests: Partial<Record<TestLevel, SingleTestResult>> = {};
  let lastFailed = false;

  for (const level of levels) {
    if (lastFailed) {
      tests[level] = { garmentCount: level, accepted: false, hasImage: false, elapsedMs: 0, skipped: true };
      log(`  G${level}: ⏭ skipped (previous level failed)`, 'warn');
      continue;
    }

    // Check we have enough garment images
    if (garmentBase64s.length < level) {
      tests[level] = { garmentCount: level, accepted: false, hasImage: false, elapsedMs: 0,
                       skipped: true, errorMessage: `Not enough test garment images (have ${garmentBase64s.length})` };
      log(`  G${level}: ⏭ skipped (not enough garment images)`, 'warn');
      continue;
    }

    const result = await runSingleTest(model, personBase64, garmentBase64s, level, outputDir);
    tests[level] = result;

    const status = result.hasImage ? '✓ OK' : result.accepted ? '⚠ no image' : '✗ FAIL';
    const timing = `${(result.elapsedMs / 1000).toFixed(1)}s`;
    const detail = result.outputFile ? ` → ${result.outputFile} (${result.outputSizeKB}KB)` : '';
    const errInfo = result.errorMessage ? ` [${result.errorCode ?? ''}] ${result.errorMessage.slice(0, 80)}` : '';
    log(`  G${level}: ${status} ${timing}${detail}${errInfo}`,
        result.hasImage ? 'ok' : result.accepted ? 'warn' : 'err');

    if (!result.hasImage) lastFailed = true;

    // Polite delay between tests to avoid rate limits
    await sleep(3000);
  }

  const successLevels  = levels.filter(l => tests[l]?.hasImage);
  const maxAccepted    = successLevels.length > 0 ? Math.max(...successLevels) : 0;
  const successTimes   = successLevels.map(l => tests[l]!.elapsedMs);
  const avgElapsedMs   = successTimes.length > 0 ? Math.round(successTimes.reduce((a, b) => a + b, 0) / successTimes.length) : 0;

  const status: ModelTryOnResult['status'] =
    successLevels.length === levels.filter(l => !tests[l]?.skipped).length ? 'full'
    : successLevels.length > 0 ? 'partial'
    : 'failed';

  log(`  → Max garments: ${maxAccepted} | Avg: ${(avgElapsedMs / 1000).toFixed(1)}s | Status: ${status}`,
      status === 'full' ? 'ok' : status === 'partial' ? 'warn' : 'err');

  // Delay between models
  await sleep(10_000);

  return { model, tests, maxAccepted, avgElapsedMs, status };
}

// ─── HTML Report Generator ────────────────────────────────────────────────────

function generateHTML(results: ModelTryOnResult[], levels: TestLevel[], startedAt: Date): string {
  const finishedAt = new Date();
  const duration   = Math.round((finishedAt.getTime() - startedAt.getTime()) / 60000);
  const fullCount  = results.filter(r => r.status === 'full').length;
  const partCount  = results.filter(r => r.status === 'partial').length;
  const failCount  = results.filter(r => r.status === 'failed').length;

  const levelHeaders = levels.map(l => `<th>G${l}<br><small>${l} garment${l > 1 ? 's' : ''}</small></th>`).join('');

  const statusBadge = (r: ModelTryOnResult) => {
    if (r.status === 'full')    return '<span class="badge badge-full">✅ Full</span>';
    if (r.status === 'partial') return '<span class="badge badge-partial">⚠️ Partial</span>';
    return '<span class="badge badge-fail">❌ Failed</span>';
  };

  const cellHTML = (r: ModelTryOnResult, level: TestLevel): string => {
    const t = r.tests[level];
    if (!t)              return '<td class="cell-na">—</td>';
    if (t.skipped)       return '<td class="cell-skip">⏭</td>';
    if (t.hasImage) {
      const s = (t.elapsedMs / 1000).toFixed(1);
      const thumb = t.outputFile
        ? `<a href="results/tryon/${t.outputFile}" target="_blank"><img src="results/tryon/${t.outputFile}" alt="output" style="max-width:60px;max-height:80px;border-radius:4px;margin-top:4px;display:block;"></a>`
        : '';
      return `<td class="cell-ok">✅<br><small>${s}s</small>${thumb}</td>`;
    }
    if (t.accepted) return `<td class="cell-warn">⚠️<br><small>no img</small></td>`;
    return `<td class="cell-fail">❌<br><small>${t.errorCode || 'err'}</small></td>`;
  };

  const rows = results
    .sort((a, b) => b.maxAccepted - a.maxAccepted || a.avgElapsedMs - b.avgElapsedMs)
    .map(r => {
      const badges = [
        r.model.isCurrent  ? '<span class="tag tag-current">⭐ Current</span>' : '',
        r.model.verified   ? '<span class="tag tag-verified">🔥 Verified</span>' : '',
        r.model.group === 'gen' ? '<span class="tag tag-gen">🎨 Gen</span>' : '',
      ].filter(Boolean).join(' ');

      const cells = levels.map(l => cellHTML(r, l)).join('');
      const avgSec = r.avgElapsedMs > 0 ? `${(r.avgElapsedMs / 1000).toFixed(1)}s` : '—';

      return `
      <tr class="row-${r.status}">
        <td class="col-model">
          <div class="model-name">${r.model.id}</div>
          <div class="model-label">${r.model.label}</div>
          ${badges}
        </td>
        <td class="col-status">${statusBadge(r)}</td>
        <td class="col-max"><strong>${r.maxAccepted > 0 ? r.maxAccepted : '—'}</strong></td>
        <td class="col-speed">${avgSec}</td>
        ${cells}
      </tr>`;
    }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Virtual Try-On Benchmark — Alta AI Fashion Suite</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, sans-serif;
      background: #0f0f12;
      color: #e2e2e8;
      min-height: 100vh;
    }
    .header {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      border-bottom: 1px solid rgba(255,255,255,0.08);
      padding: 32px 40px;
    }
    .header h1 { font-size: 2rem; font-weight: 800; background: linear-gradient(135deg, #a78bfa, #60a5fa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .header p { color: #94a3b8; margin-top: 8px; font-size: 0.9rem; }
    .summary-bar {
      display: flex; gap: 16px; flex-wrap: wrap;
      padding: 24px 40px;
      background: #13131a;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .stat-card {
      background: #1e1e2e;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      padding: 16px 24px;
      min-width: 140px;
      text-align: center;
    }
    .stat-card .num { font-size: 2rem; font-weight: 800; line-height: 1; }
    .stat-card .lbl { font-size: 0.75rem; color: #94a3b8; margin-top: 4px; }
    .num-full    { color: #34d399; }
    .num-partial { color: #fbbf24; }
    .num-fail    { color: #f87171; }
    .num-total   { color: #a78bfa; }
    .num-dur     { color: #60a5fa; }
    .content { padding: 32px 40px; }
    .section-title { font-size: 1.2rem; font-weight: 700; color: #c4b5fd; margin-bottom: 16px; }
    .table-wrap { overflow-x: auto; border-radius: 16px; border: 1px solid rgba(255,255,255,0.08); }
    table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    thead th {
      background: #1e1e2e;
      color: #94a3b8;
      padding: 12px 16px;
      text-align: center;
      font-weight: 600;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    thead th:first-child { text-align: left; }
    tbody tr { border-bottom: 1px solid rgba(255,255,255,0.04); transition: background 0.15s; }
    tbody tr:hover { background: rgba(255,255,255,0.03); }
    tbody td { padding: 12px 16px; vertical-align: middle; text-align: center; }
    tbody td:first-child { text-align: left; }
    .col-model { min-width: 260px; }
    .model-name { font-family: 'JetBrains Mono', monospace; font-size: 0.78rem; color: #e2e8f0; font-weight: 600; }
    .model-label { font-size: 0.72rem; color: #64748b; margin-top: 2px; }
    .col-status { min-width: 100px; }
    .col-max { width: 70px; }
    .col-speed { width: 70px; color: #94a3b8; font-size: 0.78rem; }
    .badge { padding: 3px 10px; border-radius: 20px; font-size: 0.7rem; font-weight: 700; display: inline-block; }
    .badge-full    { background: rgba(52,211,153,0.15); color: #34d399; border: 1px solid rgba(52,211,153,0.3); }
    .badge-partial { background: rgba(251,191,36,0.15);  color: #fbbf24; border: 1px solid rgba(251,191,36,0.3); }
    .badge-fail    { background: rgba(248,113,113,0.15); color: #f87171; border: 1px solid rgba(248,113,113,0.3); }
    .tag { display: inline-block; font-size: 0.65rem; padding: 2px 7px; border-radius: 4px; margin: 2px 2px 0 0; font-weight: 600; }
    .tag-current  { background: rgba(167,139,250,0.2); color: #a78bfa; }
    .tag-verified { background: rgba(251,146,60,0.2);  color: #fb923c; }
    .tag-gen      { background: rgba(96,165,250,0.2);  color: #60a5fa; }
    .cell-ok   { background: rgba(52,211,153,0.05); }
    .cell-warn { background: rgba(251,191,36,0.05); }
    .cell-fail { background: rgba(248,113,113,0.05); color: #f87171; }
    .cell-skip { color: #475569; }
    .cell-na   { color: #334155; }
    .row-full    td { border-left: 2px solid transparent; }
    .row-full    td:first-child { border-left: 2px solid #34d399; }
    .row-partial td:first-child { border-left: 2px solid #fbbf24; }
    .row-failed  td:first-child { border-left: 2px solid #f87171; }
    .legend { display: flex; gap: 20px; flex-wrap: wrap; margin-top: 16px; font-size: 0.78rem; color: #64748b; }
    .legend span { display: flex; align-items: center; gap: 6px; }
    .footer { text-align: center; padding: 24px; color: #334155; font-size: 0.75rem; border-top: 1px solid rgba(255,255,255,0.04); margin-top: 32px; }
  </style>
</head>
<body>

<div class="header">
  <h1>🎭 Virtual Try-On Benchmark</h1>
  <p>Alta AI Fashion Suite — DashScope Model Comparison | ${startedAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} | Duration: ${duration} min</p>
</div>

<div class="summary-bar">
  <div class="stat-card"><div class="num num-total">${results.length}</div><div class="lbl">Models Tested</div></div>
  <div class="stat-card"><div class="num num-full">${fullCount}</div><div class="lbl">Full (all levels passed)</div></div>
  <div class="stat-card"><div class="num num-partial">${partCount}</div><div class="lbl">Partial (some levels)</div></div>
  <div class="stat-card"><div class="num num-fail">${failCount}</div><div class="lbl">Failed (rejected)</div></div>
  <div class="stat-card"><div class="num num-dur">${duration}m</div><div class="lbl">Total Run Time</div></div>
</div>

<div class="content">
  <div class="section-title">📊 Results — Sorted by Max Garments Accepted, then Speed</div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th style="text-align:left">Model</th>
          <th>Status</th>
          <th>Max G</th>
          <th>Avg Speed</th>
          ${levelHeaders}
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </div>

  <div class="legend">
    <span>✅ = accepted & has image output</span>
    <span>⚠️ = HTTP 200 but no image URL</span>
    <span>❌ = API error / rejected</span>
    <span>⏭ = skipped (prev level failed)</span>
    <span>G1–G5 = garment count sent as input</span>
    <span>Max G = highest garment count that succeeded</span>
  </div>
</div>

<div class="footer">
  Generated by Alta AI Fashion Suite Try-On Benchmark • ${finishedAt.toISOString()}
</div>

</body>
</html>`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║     Virtual Try-On Benchmark — Alta AI Fashion Suite  ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');

  if (!API_KEY) {
    console.error('✗ DASHSCOPE_API_KEY not set in .env file. Aborting.');
    process.exit(1);
  }

  // ── Determine which models to run ─────────────────────────────────────────
  let models = ALL_MODELS;
  if (MODEL_ARG) {
    models = ALL_MODELS.filter(m => m.id === MODEL_ARG);
    if (models.length === 0) { console.error(`✗ Model "${MODEL_ARG}" not found.`); process.exit(1); }
  } else if (EDIT_ONLY)  { models = ALL_MODELS.filter(m => m.group === 'edit'); }
  else if (GEN_ONLY)    { models = ALL_MODELS.filter(m => m.group === 'gen');  }

  const levels: TestLevel[] = FAST_MODE ? [1] : [1, 2, 3, 4, 5];

  log(`Models: ${models.length} | Levels: G${levels.join('/G')} | Mode: ${FAST_MODE ? 'fast' : 'full'}`);

  // ── Resolve test asset paths ───────────────────────────────────────────────
  ensureDir(RESULTS_DIR);
  ensureDir(path.dirname(JSON_PATH));

  // Try to find person photo
  const personCandidates = [
    path.join(UPLOADS_DIR, TEST_ASSETS.person),
    // Auto-detect: pick first JPEG in uploads/ that is not a generated/ file
    ...fs.existsSync(UPLOADS_DIR)
      ? fs.readdirSync(UPLOADS_DIR)
          .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
          .map(f => path.join(UPLOADS_DIR, f))
      : [],
  ];
  const personPath = personCandidates.find(p => fs.existsSync(p));

  if (!personPath) {
    console.error(`✗ Person photo not found. Please add a photo to uploads/ and set TEST_ASSETS.person in the config.`);
    process.exit(1);
  }
  log(`Person photo: ${path.basename(personPath)}`, 'ok');

  // Find garment images
  const garmentCandidates: string[] = [];

  // First try configured garment names
  for (const gName of TEST_ASSETS.garments) {
    const inGenerated = path.join(UPLOADS_DIR, 'generated', gName);
    const inUploads   = path.join(UPLOADS_DIR, gName);
    if (fs.existsSync(inGenerated)) garmentCandidates.push(inGenerated);
    else if (fs.existsSync(inUploads)) garmentCandidates.push(inUploads);
  }

  // Auto-detect from uploads/generated/ if not enough configured
  if (garmentCandidates.length < 5) {
    const genDir = path.join(UPLOADS_DIR, 'generated');
    if (fs.existsSync(genDir)) {
      const crops = fs.readdirSync(genDir)
        .filter(f => f.startsWith('crop_') && /\.(png|jpg|jpeg)$/i.test(f))
        .sort()
        .map(f => path.join(genDir, f));
      for (const c of crops) {
        if (!garmentCandidates.includes(c)) garmentCandidates.push(c);
        if (garmentCandidates.length >= 5) break;
      }
    }
  }

  if (garmentCandidates.length === 0) {
    console.error('✗ No garment images found. Run the Garment Extractor first to generate crop_*.png files in uploads/generated/');
    process.exit(1);
  }

  const usableGarments = garmentCandidates.slice(0, 5);
  log(`Garment images: ${usableGarments.length} found`, usableGarments.length >= 5 ? 'ok' : 'warn');
  usableGarments.forEach((g, i) => log(`  Garment ${i + 1}: ${path.basename(g)}`));

  if (usableGarments.length < levels[levels.length - 1]) {
    log(`Warning: only ${usableGarments.length} garment images available — some levels will be skipped.`, 'warn');
  }

  // ── Pre-compress all images ────────────────────────────────────────────────
  log('\nPre-compressing images at 768px HQ...');
  const personBase64   = await toBase64HQ(personPath);
  const garmentBase64s = await Promise.all(usableGarments.map(toBase64HQ));
  log('Compression done.', 'ok');

  // ── Run benchmark ──────────────────────────────────────────────────────────
  const startedAt = new Date();
  const allResults: ModelTryOnResult[] = [];

  for (const model of models) {
    const result = await runModelBenchmark(model, personBase64, garmentBase64s, levels, RESULTS_DIR);
    allResults.push(result);
  }

  // ── Save JSON results ──────────────────────────────────────────────────────
  const jsonOutput = allResults.map(r => ({
    model: r.model.id,
    group: r.model.group,
    status: r.status,
    maxGarmentsAccepted: r.maxAccepted,
    avgElapsedMs: r.avgElapsedMs,
    tests: Object.fromEntries(
      Object.entries(r.tests).map(([k, v]) => [k, v])
    ),
  }));
  fs.writeFileSync(JSON_PATH, JSON.stringify(jsonOutput, null, 2));
  log(`\nJSON results saved → ${JSON_PATH}`, 'ok');

  // ── Generate HTML report ───────────────────────────────────────────────────
  const html = generateHTML(allResults, levels, startedAt);
  fs.writeFileSync(REPORT_PATH, html);
  log(`HTML report saved → ${REPORT_PATH}`, 'ok');

  // ── Print summary ──────────────────────────────────────────────────────────
  console.log('\n╔══════════════════ SUMMARY ══════════════════╗');
  console.log(`║ Total models tested : ${String(allResults.length).padEnd(3)}                   ║`);
  console.log(`║ Full (all levels)   : ${String(allResults.filter(r => r.status === 'full').length).padEnd(3)}                   ║`);
  console.log(`║ Partial             : ${String(allResults.filter(r => r.status === 'partial').length).padEnd(3)}                   ║`);
  console.log(`║ Failed              : ${String(allResults.filter(r => r.status === 'failed').length).padEnd(3)}                   ║`);
  console.log('╠═════════════════════════════════════════════╣');

  const sorted = [...allResults].sort((a, b) => b.maxAccepted - a.maxAccepted);
  const topModels = sorted.filter(r => r.maxAccepted > 0).slice(0, 5);
  if (topModels.length > 0) {
    console.log('║ Top models for Try-On:                      ║');
    topModels.forEach(r => {
      const line = `║   ${r.model.id.padEnd(38)} G${r.maxAccepted} ║`;
      console.log(line.length > 48 ? line.slice(0, 47) + ' ║' : line);
    });
  }
  console.log('╚═════════════════════════════════════════════╝\n');
  console.log(`Open: ${REPORT_PATH}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
