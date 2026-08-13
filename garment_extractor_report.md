# تقرير شامل — فيتشر Garment Extractor

> **الهدف:** نقل الفيتشر كاملاً إلى مشروع جديد
> **تاريخ المراجعة:** 2026-08-13
> **حالة المراجعة:** ✅ مكتمل — تمت قراءة كل ملف بدون استثناء

---

## 1. نظرة عامة على الفيتشر

**Garment Extractor** هو فيتشر يتيح:
- رفع صورة لشخص يرتدي ملابس
- تحليل الصورة بالذكاء الاصطناعي لاستخراج قائمة بكل قطعة ملابس مرئية
- إزالة الشخص وعزل كل قطعة ملابس على خلفية بيضاء نظيفة
- اقتصاص كل قطعة بشكل منفصل محلياً (بدون API calls إضافية)
- حفظ القطع المستخرجة في "الخزانة" (Saved Closet)
- سجل تاريخ لكل عمليات الاستخراج

**الخوارزمية الأساسية:**
```
صورة → ضغط (512px JPEG 65%) → تحليل AI (Qwen3-VL) → بناء prompt → API واحد (qwen-image-edit) → صورة Grid → اقتصاص محلي (Sharp) → نتائج
```

**التكلفة:** API call واحد بغض النظر عن عدد القطع (1 إلى 6 قطع).

---

## 2. خريطة كل الملفات المتعلقة بالفيتشر

```
المشروع/
├── server.ts                              ← نقطة دخول السيرفر + API Routes
├── server/services/
│   ├── GarmentAnalysisService.ts         ← المرحلة 1: تحليل الصورة باستخدام AI
│   ├── GarmentExtractionPipeline.ts      ← المرحلة 2: خط الاستخراج الكامل
│   ├── GarmentPromptBuilder.ts           ← بناء prompts للـ AI
│   ├── GarmentResultValidator.ts         ← التحقق من جودة النتيجة (غير مفعّل)
│   ├── QwenImageEditService.ts           ← التواصل مع Alibaba Qwen API
│   └── SmartCropService.ts              ← الاقتصاص الذكي المحلي بـ Sharp
├── src/
│   ├── types.ts                          ← كل الـ TypeScript interfaces
│   ├── App.tsx                           ← الـ state management + API calls
│   └── components/
│       ├── UploadArea.tsx               ← رفع الصورة + Drag & Drop
│       ├── DetectedItemsArea.tsx        ← عرض + تعديل قائمة القطع المكتشفة
│       ├── SettingsPanel.tsx            ← إعدادات: نوع الملبس / الخلفية / الجودة
│       ├── ResultArea.tsx              ← عرض النتائج + تحميل + حفظ
│       ├── BeforeAfterSlider.tsx       ← مقارنة قبل/بعد
│       ├── HistoryList.tsx             ← سجل العمليات السابقة
│       └── SavedCloset.tsx             ← الخزانة: عرض القطع المحفوظة
├── .env / .env.example                   ← إعدادات المفاتيح
└── package.json                          ← التبعيات
```

---

## 3. مراجعة تفصيلية لكل ملف

### 3.1 Backend

---

#### [server.ts](file:///d:/My_Projects/alibaba-vision-model/server.ts) — نقطة الدخول الرئيسية

**الحجم:** 226 سطر | **الدور:** Express server + تعريف API Routes

**API Routes المتعلقة بالفيتشر:**

| المسار | الوصف |
|--------|-------|
| `POST /api/garment/analyze` | يحلل الصورة ويعيد قائمة القطع (Stage 1) |
| `POST /api/garment/extract` | يستخرج الملابس ويعيد الصور المعزولة (Stage 2) |

**تدفق `/api/garment/analyze`:**
```
multipart/form-data (image)
→ compressInputImage (512px, 65% JPEG)
→ GarmentAnalysisService.analyzeImage()
→ { success: true, inventory: GarmentInventory }
```

**تدفق `/api/garment/extract`:**
```
multipart/form-data (image + confirmed_inventory JSON)
→ parse confirmed_inventory
→ GarmentExtractionPipeline.processExtraction()
→ ExtractionPipelineResult
```

**ملاحظات مهمة:**
- Multer: حد أقصى 20MB للملف المرفوع
- المفتاح: `DASHSCOPE_API_KEY` من environment variables
- الملفات المرفوعة تُحفظ في `./uploads/`
- الصور المولدة تُحفظ في `./uploads/generated/`
- Route الـ Try-On موجود أيضاً لكنه لفيتشر منفصل

---

#### [GarmentAnalysisService.ts](file:///d:/My_Projects/alibaba-vision-model/server/services/GarmentAnalysisService.ts) — تحليل الملابس

**الحجم:** 104 سطر | **الدور:** يرسل الصورة لـ Qwen AI ويعيد قائمة منظمة بالقطع المكتشفة

**Interfaces المُصدَّرة:**
```typescript
interface GarmentItem {
  id: string;
  category: string;      // "shirt", "pants", إلخ
  description: string;   // وصف تفصيلي
  color: string;         // اللون
  visible: boolean;      // هل مختارة للاستخراج؟
}

interface GarmentInventory {
  gender_presentation: 'male' | 'female' | 'neutral';
  items: GarmentItem[];
}
```

**Model المستخدم:** `qwen3-vl-30b-a3b-instruct`
**API Endpoint:** `https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`
**Timeout:** 30 ثانية

**الـ Prompt:**
```
List ONLY the visible garments and shoes worn in this photo. Do NOT infer hidden items.
Return ONLY valid JSON: {"gender_presentation":"male"|"female"|"neutral","items":[{...}]}
```

**معالجة الأخطاء:** عند فشل الـ parsing يعيد Fallback inventory بقطعة واحدة generic.

---

#### [GarmentExtractionPipeline.ts](file:///d:/My_Projects/alibaba-vision-model/server/services/GarmentExtractionPipeline.ts) — خط الاستخراج الكامل

**الحجم:** 242 سطر | **الدور:** المُنسِّق الرئيسي (Orchestrator) لعملية الاستخراج

**Interfaces المُصدَّرة:**
```typescript
interface ExtractedItemResult {
  item: GarmentItem;
  image_url: string;
  verified: boolean;
  verification_reason?: string;
}

interface ExtractionPipelineResult {
  success: boolean;
  image_url: string;              // الصورة الكاملة (Grid)
  item_results: ExtractedItemResult[];
  verified: boolean;
  verification_reason?: string;
  inventory: GarmentInventory;
  attempts: number;
  message?: string;
}
```

**تدفق `processExtraction()` كامل:**
```
1. ضغط الصورة → 512px JPEG 65%
2. استخدام inventory مؤكد من Frontend (إن وُجد) أو تشغيل Stage 1 analysis
3. فلترة القطع المرئية فقط (visible !== false)
4. بناء extraction prompt (GarmentPromptBuilder)
5. تحديد حجم الـ output بناءً على عدد القطع (getOutputSize)
6. API call واحد → qwen-image-edit → صورة Grid
   - Retry تلقائي بـ prompt مبسط عند الفشل
7. Trim الصورة الكاملة (Sharp trim whitespace)
8. إزالة خطوط الفصل الصناعية (SmartCropService.removeArtifactLines)
9. اقتصاص كل قطعة محلياً:
   - SmartCropService.detect() للحصول على مواقع الفصل الحقيقية
   - SAFE_MARGIN = 10px من كل حافة مشتركة
   - SmartCropService.trimAndPadBuffer() → Trim + Pad إلى 600×600
10. إعادة النتائج
```

**تفاصيل `cropItemsFromImage()`:**
- قطعة واحدة → trim + pad مباشرة بدون قص
- متعددة → SmartCrop detection ثم قص بالتوازي (Promise.all)
- عند فشل القص → يستخدم الصورة الكاملة كـ fallback

---

#### [GarmentPromptBuilder.ts](file:///d:/My_Projects/alibaba-vision-model/server/services/GarmentPromptBuilder.ts) — بناء الـ Prompts

**الحجم:** 109 سطر | **الدور:** يبني النصوص المُرسَلة للـ AI بشكل دقيق ومحسّن

**الدوال المُصدَّرة:**
```typescript
getLayoutForItems(count: number): { cols: number; rows: number }
// 1 → 1×1 | 2 → 2×1 | 3 → 3×1 | 4 → 4×1 | 5 → 5×1 | 6 → 3×2

getOutputSize(count: number): string
// 1     → '768*1024' (portrait)
// 2-6   → '1024*512' (wide horizontal)

buildExtractionPrompt(inventory)  // prompt تفصيلي بمواضع كل قطعة
buildRecoveryPrompt(inventory)    // prompt مبسط للمحاولة الثانية
buildSingleItemPrompt(item, gender) // لاستخراج قطعة واحدة
```

> [!NOTE]
> الـ `colLabels` تدعم حتى 5 أعمدة فقط. ما فوق ذلك يستخدم `column N of M`.

---

#### [GarmentResultValidator.ts](file:///d:/My_Projects/alibaba-vision-model/server/services/GarmentResultValidator.ts) — التحقق من النتيجة

**الحجم:** 151 سطر | **Model:** `qwen-vl-max`

> [!WARNING]
> **هذا الملف غير مستخدم حالياً في الـ Pipeline الفعلي.**
> الـ Pipeline يضع `verified: true` تلقائياً دون استدعاء الـ Validator.

**ما يتحقق منه (إذا فُعِّل):**
1. هل الجسم البشري لا يزال ظاهراً؟
2. هل تم توليد Grid متكرر بدلاً من صورة منتج واحدة؟
3. هل هناك أشياء زائدة اخترعها الـ AI؟
4. هل الفئات المكتشفة تطابق المتوقع؟

```typescript
interface ValidationResult {
  verified: boolean;
  reason?: string;
  detectedCategoriesInOutput?: string[];
  humanBodyVisible?: boolean;
  gridOrRepeatedItems?: boolean;
}
```

---

#### [QwenImageEditService.ts](file:///d:/My_Projects/alibaba-vision-model/server/services/QwenImageEditService.ts) — التواصل مع Alibaba API

**الحجم:** 173 سطر | **Model للاستخراج:** `qwen-image-edit`

**الدوال:**
```typescript
compressInputImage(path)    // 512px / quality 65 — للاستخراج
compressInputImageHQ(path)  // 768px / quality 80 — للـ Try-On (فيتشر آخر)

executeExtraction(base64, prompt, apiKey, generatedDir, outputSize, retryCount)
// → { localPath, publicUrl, generatedFilename }
```

**معالجة 429 Rate Limit:**
```
429 → انتظار (retryCount+1) × 3000ms → إعادة المحاولة (max 3 مرات)
```

**الصورة المُولَّدة:**
- تُحمَّل من URL مؤقت بـ `node:https` (Primary) + `fetch` (Fallback)
- تُحفظ كـ `gen_{uuid}.png` في `generatedDir`
- تُعاد كـ `/uploads/generated/{filename}`

---

#### [SmartCropService.ts](file:///d:/My_Projects/alibaba-vision-model/server/services/SmartCropService.ts) — الاقتصاص الذكي

**الحجم:** 513 سطر — أكبر ملف في المشروع
**الدور:** خوارزمية اقتصاص محلية بالكامل (بدون AI) باستخدام Sharp

**الخوارزمية الرئيسية `detect()`:**
```
1. تصغير الصورة لـ 256px (للتحليل السريع)
2. تحويل لـ Grayscale + Raw pixels
3. حساب brightness profile لكل عمود وصف (single pass)
4. اكتشاف "white gaps" (مناطق بيضاء) بين القطع
5. اختيار أفضل N فواصل (الأعرض = الأحقيقية)
6. التحقق من توازن الخلايا (≥30% من الحجم المتوقع)
7. تحويل الإحداثيات للحجم الأصلي
8. Fallback للتقسيم الرياضي المتساوي عند الفشل
```

**Constants مهمة:**
```typescript
ANALYSIS_PX = 256           // حجم thumbnail التحليل
WHITE_THRESHOLDS = [250, 245, 240, 235, 228, 220]
MIN_GAP_PX = 2
EDGE_MARGIN_PCT = 0.10      // تتجاهل أول/آخر 10% من الصورة

// removeArtifactLines():
LINE_DARK_THRESHOLD = 0.85  // ≥85% مظلم = خط فاصل
MAX_LINE_WIDTH = 10          // ≤10px = خط رفيع
EXPAND = 1                   // توسيع 1px لكل جانب

// trimAndPadBuffer():
TARGET_SIZE = 600            // الحجم النهائي للبطاقة
```

**الدوال العامة:**
```typescript
detect(imagePath, nCols, nRows)         // كشف مواضع الفواصل
cellRange(cuts, total, index)           // حدود خلية معينة
trimAndPad(imagePath)                   // trim + pad من ملف
trimAndPadBuffer(inputBuffer)           // trim + pad من buffer
removeArtifactLines(imagePath)          // إزالة خطوط الـ AI
trimAndClean(imagePath)                 // trim + إزالة خطوط في pipeline واحد
```

---

### 3.2 Frontend

---

#### [src/types.ts](file:///d:/My_Projects/alibaba-vision-model/src/types.ts) — تعريفات TypeScript

**الحجم:** 99 سطر | **الدور:** كل الـ types والـ interfaces للـ Frontend

```typescript
type GarmentType = 'Auto Detect' | 'T-Shirt' | 'Shirt' | 'Blouse' | 'Hoodie' |
                   'Sweatshirt' | 'Jacket' | 'Coat' | 'Dress' | 'Skirt' |
                   'Pants' | 'Jeans' | 'Shorts' | 'Shoes' | 'Other';

type BackgroundType = 'Clean White' | 'Light Gray' | 'Transparent-style' |
                      'Original-like neutral' | 'Auto';

type QualityType = 'Standard' | 'High' | 'Ultra';

type ExtractionStage = 'idle' | 'analyzing' | 'detecting' | 'building_plan' |
                       'extracting' | 'verifying' | 'finalizing';

type ActiveTab = 'extractor' | 'tryon';

interface GarmentItem { id, category, description, color, visible }
interface GarmentInventory { gender_presentation, items: GarmentItem[] }
interface ExtractedItemResult { item, image_url, verified, verification_reason? }
interface SavedGarmentItem { id, category, description, color, imageUrl, savedAt }
interface GenerationHistoryItem { id, originalImage, generatedImage, timestamp, garmentType, verified? }
interface ExtractionResponse { success, image_url?, item_results?, verified?,
                               verification_reason?, inventory?, attempts?, message? }
```

> [!NOTE]
> `GarmentItem` و `GarmentInventory` مُعرَّفة في مكانين: `src/types.ts` و `GarmentAnalysisService.ts`. عند النقل يجب توحيدهما.

---

#### [src/App.tsx](file:///d:/My_Projects/alibaba-vision-model/src/App.tsx) — الـ State Management الرئيسي

**الحجم:** 312 سطر | **الدور:** يدير كل الـ state وينسق API calls

**State المتعلق بالفيتشر:**
```typescript
selectedFile: File | null
previewUrl: string | null
resultImage: string | null          // الصورة الكاملة (Grid result)
itemResults: ExtractedItemResult[]  // كل قطعة مقصوصة
isLoading: boolean
isAnalyzing: boolean                // حالة تحليل Stage 1 المتوازي
stage: ExtractionStage
inventory: GarmentInventory | null  // قابل للتعديل من المستخدم
isVerified: boolean | undefined
verificationReason: string | undefined
error: string | null
showComparison: boolean
elapsedSecs: number                 // مؤقت العداد أثناء الاستخراج
history: GenerationHistoryItem[]    // localStorage
savedGarments: SavedGarmentItem[]   // localStorage
```

**الـ Flows الرئيسية:**
```
handleFileSelect(file):
  → reset state → analyzeImage() تلقائياً (Stage 1 في الخلفية)

analyzeImage(file):
  → POST /api/garment/analyze → setInventory()

analyzeAndExtract():
  → AbortController + timer
  → POST /api/garment/extract (مع confirmed_inventory)
  → setResultImage + setItemResults + history

handleCancel() → abortController.abort()
handleSaveItem() → savedGarments (localStorage)
```

---

#### [UploadArea.tsx](file:///d:/My_Projects/alibaba-vision-model/src/components/UploadArea.tsx)

**الحجم:** 148 سطر | **Props:** `onFileSelect, selectedFile, previewUrl, onClear, isLoading`

- Drag & Drop كامل مع visual feedback
- Preview الصورة بارتفاع 500px
- Hover overlay مع Replace / Remove
- يقبل: `image/jpeg, image/png, image/webp`

---

#### [DetectedItemsArea.tsx](file:///d:/My_Projects/alibaba-vision-model/src/components/DetectedItemsArea.tsx)

**الحجم:** 240 سطر | **Props:** `inventory, isAnalyzing, onUpdateInventory, disabled`

- Loading state أثناء Stage 1 (animate-pulse)
- Badge لكل قطعة: Click لـ Toggle include/exclude
- تبديل الـ gender_presentation (male/female/neutral)
- Edit Mode: حذف قطع، إضافة قطع يدوياً
- عداد: "N/M selected for extraction"

---

#### [SettingsPanel.tsx](file:///d:/My_Projects/alibaba-vision-model/src/components/SettingsPanel.tsx)

**الحجم:** 85 سطر | **Props:** `garmentType, backgroundType, quality` + setters + `disabled`

> [!WARNING]
> الـ Settings تُرسَل مع الـ request لكنها **لا تُستخدم فعلياً** في بناء الـ prompt. يمكن حذف هذا الـ component أو تفعيله لاحقاً.

---

#### [ResultArea.tsx](file:///d:/My_Projects/alibaba-vision-model/src/components/ResultArea.tsx)

**الحجم:** 215 سطر

**Props:**
```typescript
originalImage, resultImage, itemResults, isLoading, stage,
isVerified, verificationReason, savedGarments,
onSaveItem, onRemoveSavedItem, onRegenerate,
showComparison, setShowComparison
```

**الخصائص:**
- Loading state مع 5 مراحل + progress indicator
- Status bar (verified/warning) مع سبب
- عرض Grid image مع zoom on hover
- BeforeAfterSlider للمقارنة
- Download All + Re-Extract
- كروت لكل قطعة: صورة + Save + Download
- AnimatePresence لانتقالات سلسة (`motion` library)

---

#### [BeforeAfterSlider.tsx](file:///d:/My_Projects/alibaba-vision-model/src/components/BeforeAfterSlider.tsx)

**الحجم:** 106 سطر | **Props:** `originalImage, resultImage`

- Slider تفاعلي بـ Mouse + Touch
- ClipPath لتقسيم الصورتين
- Labels "Original" / "Isolated" تظهر عند Hover

---

#### [HistoryList.tsx](file:///d:/My_Projects/alibaba-vision-model/src/components/HistoryList.tsx)

**الحجم:** 82 سطر | **Props:** `items, onSelect, onDelete`

- Grid متجاوب 2→4→6 أعمدة
- Verified/Warning badge على كل عنصر
- Click يُحمِّل النتيجة القديمة مرة أخرى
- حذف فردي لكل عنصر
- يستخدم `date-fns` لتنسيق التاريخ

---

#### [SavedCloset.tsx](file:///d:/My_Projects/alibaba-vision-model/src/components/SavedCloset.tsx)

**الحجم:** 69 سطر | **Props:** `items, onRemove`

- Grid 2→3→4 أعمدة
- صور ملابس محفوظة مرتبطة بالـ Try-On feature
- فتح الصورة بالحجم الكامل
- حذف من الخزانة

---

## 4. التبعيات المطلوبة للنقل

### Backend

| Package | الإصدار | الدور |
|---------|---------|-------|
| `express` | ^4.21.2 | HTTP Server |
| `multer` | ^2.2.0 | رفع الملفات |
| `sharp` | ^0.35.3 | معالجة الصور (اقتصاص + ضغط) |
| `uuid` | ^14.0.1 | توليد UUIDs |
| `dotenv` | ^17.2.3 | تحميل env variables |

### Frontend

| Package | الإصدار | الدور |
|---------|---------|-------|
| `react` | ^19.0.1 | Framework |
| `react-dom` | ^19.0.1 | DOM rendering |
| `lucide-react` | ^1.30.0 | Icons |
| `motion` | ^12.23.24 | Animations (AnimatePresence) |
| `date-fns` | ^4.4.0 | تنسيق التواريخ في HistoryList |
| `uuid` | ^14.0.1 | توليد IDs للقطع |

### Dev

| Package | الإصدار | الدور |
|---------|---------|-------|
| `tsx` | ^4.21.0 | تشغيل TypeScript للـ Server |
| `vite` | ^6.2.3 | Build tool |
| `tailwindcss` | ^4.1.14 | CSS framework |
| `@tailwindcss/vite` | ^4.1.14 | Tailwind Vite plugin |
| `@vitejs/plugin-react` | ^5.0.4 | React Vite plugin |
| `typescript` | ~5.8.2 | TypeScript compiler |

---

## 5. متغيرات البيئة المطلوبة

```env
DASHSCOPE_API_KEY=sk-xxx...   # مفتاح Alibaba Cloud DashScope API
```

---

## 6. API Endpoints

### `POST /api/garment/analyze`

**Input:** `multipart/form-data` → `image` (File)

**Output:**
```json
{
  "success": true,
  "inventory": {
    "gender_presentation": "female",
    "items": [
      { "id": "uuid", "category": "dress", "description": "...", "color": "red", "visible": true }
    ]
  }
}
```

---

### `POST /api/garment/extract`

**Input:** `multipart/form-data` → `image` (File) + `confirmed_inventory` (JSON string, اختياري)

**Output:**
```json
{
  "success": true,
  "image_url": "/uploads/generated/gen_uuid.png",
  "item_results": [
    {
      "item": { "id": "...", "category": "dress", "description": "...", "color": "red", "visible": true },
      "image_url": "/uploads/generated/crop_0_gen_uuid.png",
      "verified": true,
      "verification_reason": "Smart crop [row 1, col 1]"
    }
  ],
  "verified": true,
  "verification_reason": "1 item(s) extracted in 12s (1 API call · 768*1024)",
  "inventory": { "...": "..." },
  "attempts": 1
}
```

---

## 7. خطة النقل للمشروع الجديد

### ✅ تُنقَل كما هي (copy-paste مباشر)

| الملف | ملاحظة |
|-------|--------|
| `server/services/GarmentAnalysisService.ts` | لا تعديل |
| `server/services/GarmentExtractionPipeline.ts` | لا تعديل |
| `server/services/GarmentPromptBuilder.ts` | لا تعديل |
| `server/services/GarmentResultValidator.ts` | لا تعديل (dead code حالياً) |
| `server/services/QwenImageEditService.ts` | لا تعديل |
| `server/services/SmartCropService.ts` | لا تعديل |
| `src/components/UploadArea.tsx` | لا تعديل |
| `src/components/DetectedItemsArea.tsx` | لا تعديل |
| `src/components/ResultArea.tsx` | لا تعديل |
| `src/components/BeforeAfterSlider.tsx` | لا تعديل |
| `src/components/HistoryList.tsx` | لا تعديل |
| `src/components/SavedCloset.tsx` | لا تعديل |
| `src/components/SettingsPanel.tsx` | لا تعديل |

### ⚠️ تحتاج تكامل في المشروع الجديد

| الملف | ما يجب عمله |
|-------|------------|
| `server.ts` | نسخ الـ Routes (سطر 51→116) للسيرفر الجديد |
| `src/types.ts` | دمج الـ types في ملف types المشروع الجديد |
| `src/App.tsx` | نقل الـ state + handlers لـ component مناسب |
| `.env` | إضافة `DASHSCOPE_API_KEY` |
| `package.json` | إضافة الـ dependencies المذكورة في القسم 4 |

---

## 8. ملاحظات تقنية مهمة

> [!NOTE]
> **ازدواجية GarmentItem/GarmentInventory:** معرَّفة في `src/types.ts` (Frontend) و `GarmentAnalysisService.ts` (Backend). عند النقل وحِّدهما في ملف مشترك واحد.

> [!WARNING]
> **SettingsPanel غير مفعّل فعلياً:** `garmentType`, `backgroundType`, `quality` تُرسَل لكن `GarmentExtractionPipeline` لا يستخدمها في الـ prompt. يمكن حذف الـ component أو تفعيله لاحقاً.

> [!WARNING]
> **GarmentResultValidator غير مفعّل:** dead code. الـ Pipeline يضع `verified: true` دائماً. يمكن تفعيله لاحقاً.

> [!NOTE]
> **تخزين الصور:** كل الصور تُحفظ في `./uploads/generated/` وتبقى على الـ server إلى الأبد. لا يوجد cleanup تلقائي. أضف cleanup في المشروع الجديد.

> [!NOTE]
> **AbortController:** يعمل على مستوى الـ HTTP connection فقط. عند الإلغاء، الـ Pipeline يستمر على الـ Server ولكن الـ response يُهمَل.

> [!IMPORTANT]
> **Sharp على Windows:** بعد النقل نفّذ `npm rebuild sharp` إذا كان السيرفر الجديد على نفس الـ OS أو `npm install --force` إذا اختلف.

---

## 9. خريطة الاستدعاءات (Call Graph)

```
Frontend (App.tsx)
  │
  ├─ analyzeImage() → POST /api/garment/analyze
  │     └─ server.ts route
  │           ├─ QwenImageEditService.compressInputImage()
  │           └─ GarmentAnalysisService.analyzeImage()
  │                 └─ [Qwen3-VL-30B API call]
  │
  └─ analyzeAndExtract() → POST /api/garment/extract
        └─ server.ts route
              └─ GarmentExtractionPipeline.processExtraction()
                    ├─ QwenImageEditService.compressInputImage()
                    ├─ [GarmentAnalysisService.analyzeImage() — اختياري]
                    ├─ GarmentPromptBuilder.buildExtractionPrompt()
                    ├─ GarmentPromptBuilder.getOutputSize()
                    ├─ QwenImageEditService.executeExtraction()
                    │     └─ [qwen-image-edit API — الوحيد!]
                    ├─ Sharp.trim() (combined image)
                    ├─ SmartCropService.removeArtifactLines()
                    └─ cropItemsFromImage()
                          ├─ SmartCropService.detect()
                          ├─ SmartCropService.cellRange() × N
                          └─ SmartCropService.trimAndPadBuffer() × N
```

---

## 10. إحصائيات الكود

| الملف | السطور | الحجم |
|-------|--------|-------|
| `SmartCropService.ts` | 513 | 18.5 KB |
| `App.tsx` | 312 | 14.0 KB |
| `ResultArea.tsx` | 215 | 12.2 KB |
| `GarmentExtractionPipeline.ts` | 242 | 9.8 KB |
| `DetectedItemsArea.tsx` | 240 | 9.9 KB |
| `server.ts` | 226 | 8.3 KB |
| `QwenImageEditService.ts` | 173 | 6.0 KB |
| `GarmentResultValidator.ts` | 151 | 5.9 KB |
| `UploadArea.tsx` | 148 | 5.8 KB |
| `GarmentPromptBuilder.ts` | 109 | 4.8 KB |
| `BeforeAfterSlider.tsx` | 106 | 3.9 KB |
| `GarmentAnalysisService.ts` | 104 | 3.4 KB |
| `HistoryList.tsx` | 82 | 3.6 KB |
| `SettingsPanel.tsx` | 85 | 3.6 KB |
| `types.ts` | 99 | 1.9 KB |
| `SavedCloset.tsx` | 69 | 3.0 KB |
| `utils.ts` | 7 | 0.2 KB |
| **المجموع** | **~2,881 سطر** | **~122 KB** |
