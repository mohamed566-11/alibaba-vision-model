/**
 * Benchmark Configuration
 * Lists all models to test for both Stage 1 (VL Analysis) and Stage 2 (Image Edit)
 */

export type Priority = 'high' | 'medium' | 'low';

export interface VLModelConfig {
  id: string;
  label: string;
  priority: Priority;
  isCurrent?: boolean;
  supportsThinking?: boolean;
}

export interface EditModelConfig {
  id: string;
  label: string;
  priority: Priority;
  isCurrent?: boolean;
  quota: number;
}

// ─── Stage 1: VL/Vision Models ─────────────────────────────────────────────
// Used for garment analysis — detecting what clothing items are visible
export const VL_MODELS: VLModelConfig[] = [
  // HIGH PRIORITY
  { id: 'qwen-vl-max',                    label: 'Qwen VL Max',                    priority: 'high',   isCurrent: true },
  { id: 'qwen-vl-plus',                   label: 'Qwen VL Plus',                   priority: 'high' },
  { id: 'qwen3-vl-flash',                 label: 'Qwen3 VL Flash',                 priority: 'high' },
  { id: 'qwen3-vl-8b-instruct',           label: 'Qwen3 VL 8B Instruct',           priority: 'high' },
  { id: 'qwen3-vl-plus',                  label: 'Qwen3 VL Plus',                  priority: 'high' },
  { id: 'qwen3-vl-30b-a3b-instruct',      label: 'Qwen3 VL 30B Instruct',          priority: 'high' },
  { id: 'qwen3-vl-32b-instruct',          label: 'Qwen3 VL 32B Instruct',          priority: 'high' },
  { id: 'qwen3-vl-235b-a22b-instruct',    label: 'Qwen3 VL 235B Instruct',         priority: 'high' },
  { id: 'qvq-max',                        label: 'QVQ Max (Visual Reasoning)',      priority: 'high' },

  // MEDIUM PRIORITY
  { id: 'qwen-vl-ocr',                    label: 'Qwen VL OCR',                    priority: 'medium' },
  { id: 'qwen-vl-ocr-2025-11-20',         label: 'Qwen VL OCR (2025-11-20)',       priority: 'medium' },
  { id: 'qwen3-vl-flash-2025-10-15',      label: 'Qwen3 VL Flash (2025-10-15)',    priority: 'medium' },
  { id: 'qwen3-vl-flash-2026-01-22',      label: 'Qwen3 VL Flash (2026-01-22)',    priority: 'medium' },
  { id: 'qwen3-vl-plus-2025-09-23',       label: 'Qwen3 VL Plus (2025-09-23)',     priority: 'medium' },
  { id: 'qwen3-vl-plus-2025-12-19',       label: 'Qwen3 VL Plus (2025-12-19)',     priority: 'medium' },

  // LOW PRIORITY (thinking models — slower but potentially more accurate)
  { id: 'qwen3-vl-8b-thinking',           label: 'Qwen3 VL 8B Thinking',           priority: 'low',   supportsThinking: true },
  { id: 'qwen3-vl-30b-a3b-thinking',      label: 'Qwen3 VL 30B Thinking',          priority: 'low',   supportsThinking: true },
  { id: 'qwen3-vl-32b-thinking',          label: 'Qwen3 VL 32B Thinking',          priority: 'low',   supportsThinking: true },
  { id: 'qwen3-vl-235b-a22b-thinking',    label: 'Qwen3 VL 235B Thinking',         priority: 'low',   supportsThinking: true },
];

// ─── Stage 2: Image-Edit Models ────────────────────────────────────────────
// Used for garment extraction — removing person, isolating garment on white bg
export const EDIT_MODELS: EditModelConfig[] = [
  { id: 'qwen-image-edit-plus',           label: 'Qwen Image Edit Plus',           priority: 'high',   isCurrent: true, quota: 100 },
  { id: 'qwen-image-edit-max',            label: 'Qwen Image Edit Max',            priority: 'high',   quota: 100 },
  { id: 'qwen-image-edit',                label: 'Qwen Image Edit',                priority: 'high',   quota: 100 },
  { id: 'qwen-image-edit-plus-2025-10-30',label: 'Qwen Image Edit Plus (10-30)',   priority: 'medium', quota: 100 },
  { id: 'qwen-image-edit-plus-2025-12-15',label: 'Qwen Image Edit Plus (12-15)',   priority: 'medium', quota: 100 },
  { id: 'qwen-image-edit-max-2026-01-16', label: 'Qwen Image Edit Max (01-16)',    priority: 'medium', quota: 100 },
  
  // User Verified Hand-tested Models (نجحت في التجربة اليدوية)
  { id: 'qwen-image-2.0-pro',             label: 'Qwen Image 2.0 Pro (⭐ مجرب)',    priority: 'high',   quota: 100 },
  { id: 'qwen-image-2.0-pro-2026-03-03',  label: 'Qwen Image 2.0 Pro (03-03)',     priority: 'high',   quota: 100 },
  { id: 'qwen-image-2.0-2026-03-03',      label: 'Qwen Image 2.0 (03-03)',         priority: 'high',   quota: 100 },
  { id: 'qwen-image-2.0-pro-2026-06-22',  label: 'Qwen Image 2.0 Pro (06-22)',     priority: 'high',   quota: 100 },
  { id: 'qwen-image-2.0-pro-2026-04-22',  label: 'Qwen Image 2.0 Pro (04-22)',     priority: 'high',   quota: 100 },
];

// ─── DashScope API Config ───────────────────────────────────────────────────
export const DASHSCOPE_VL_URL  = 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
export const DASHSCOPE_EDIT_URL = 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/image2image/image-synthesis';

// Test images selected from uploads/ (small / medium / large)
// These are picked for variety in size and content
export const TEST_IMAGES = [
  { name: 'small',  filename: '01bb8736-3ebb-4c9b-89c2-062e52bee52c.jpg',      sizeLabel: '~20KB'  },
  { name: 'medium', filename: '2c46b7d8-74bb-4e2f-9773-514d737da0a8.jpeg',     sizeLabel: '~162KB' },
  { name: 'large',  filename: '68f3f34a-1df9-47e7-b290-7b386b1dbc31.jpeg',     sizeLabel: '~1.5MB' },
];

// The standard garment item used for Stage 2 extraction tests
export const STAGE2_TEST_ITEM = {
  category: 'shirt',
  description: 'white button-up shirt',
  color: 'white',
};

// Stage 2 test image (medium size, confirmed to contain outfit)
export const STAGE2_TEST_IMAGE = '2c46b7d8-74bb-4e2f-9773-514d737da0a8.jpeg';
