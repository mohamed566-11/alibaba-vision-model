# خطة بناء Benchmark System — مقارنة نماذج Alibaba DashScope (مُحدَّثة)

> للتفاصيل الكاملة لجميع الموديلز انظر: [models_report.md](file:///C:/Users/world/.gemini/antigravity-ide/brain/3e49443c-beb9-4b96-afe2-391679edf042/models_report.md)

---

## الموديلز المستهدفة للاختبار (25 موديل)

### Stage 1 — VL/Vision Models (19 موديل — تحليل واكتشاف الملابس)

| # | Model Code | أولوية |
|---|---|---|
| 1 | `qwen-vl-max` ⭐ الحالي | — |
| 2 | `qwen-vl-plus` | 🔴 عالية |
| 3 | `qwen3-vl-flash` | 🔴 عالية |
| 4 | `qwen3-vl-8b-instruct` | 🔴 عالية |
| 5 | `qwen3-vl-plus` | 🔴 عالية |
| 6 | `qwen3-vl-30b-a3b-instruct` | 🔴 عالية |
| 7 | `qwen3-vl-32b-instruct` | 🔴 عالية |
| 8 | `qwen3-vl-235b-a22b-instruct` | 🔴 عالية |
| 9 | `qvq-max` | 🔴 عالية |
| 10 | `qwen-vl-ocr` | 🟡 متوسطة |
| 11 | `qwen-vl-ocr-2025-11-20` | 🟡 متوسطة |
| 12 | `qwen3-vl-flash-2025-10-15` | 🟡 متوسطة |
| 13 | `qwen3-vl-flash-2026-01-22` | 🟡 متوسطة |
| 14 | `qwen3-vl-plus-2025-09-23` | 🟡 متوسطة |
| 15 | `qwen3-vl-plus-2025-12-19` | 🟡 متوسطة |
| 16 | `qwen3-vl-8b-thinking` | 🟢 منخفضة |
| 17 | `qwen3-vl-30b-a3b-thinking` | 🟢 منخفضة |
| 18 | `qwen3-vl-32b-thinking` | 🟢 منخفضة |
| 19 | `qwen3-vl-235b-a22b-thinking` | 🟢 منخفضة |

### Stage 2 — Image-Edit Models (6 موديلز — استخراج وتفريغ الملابس)

| # | Model Code | الكوتا | أولوية |
|---|---|---|---|
| 1 | `qwen-image-edit-plus` ⭐ الحالي | 100 | — |
| 2 | `qwen-image-edit-max` | 100 | 🔴 عالية |
| 3 | `qwen-image-edit` | 100 | 🔴 عالية |
| 4 | `qwen-image-edit-plus-2025-10-30` | 100 | 🟡 متوسطة |
| 5 | `qwen-image-edit-plus-2025-12-15` | 100 | 🟡 متوسطة |
| 6 | `qwen-image-edit-max-2026-01-16` | 100 | 🟡 متوسطة |

---

## هيكل الملفات

```
alibaba-vision-model/
└── benchmark/
    ├── run_benchmark.ts         ← السكريبت الرئيسي
    ├── config.ts                ← قائمة الموديلز وإعداداتهم
    ├── results/
    │   ├── stage1_vision/       ← نتائج 19 VL model
    │   │   ├── qwen-vl-max/
    │   │   │   ├── img1_result.json   (قائمة الملابس المكتشفة + وقت)
    │   │   │   ├── img2_result.json
    │   │   │   └── img3_result.json
    │   │   ├── qwen-vl-plus/
    │   │   ├── qwen3-vl-flash/
    │   │   └── ... (19 مجلد)
    │   └── stage2_edit/         ← نتائج 6 Image-Edit models
    │       ├── qwen-image-edit-plus/  (الحالي)
    │       │   ├── item_shirt_output.png
    │       │   └── meta.json          (وقت، حجم)
    │       ├── qwen-image-edit-max/
    │       └── ... (6 مجلدات)
    └── report.html              ← التقرير التفاعلي
```

---

## Proposed Changes

### [NEW] [benchmark/config.ts](file:///d:/My_Projects/alibaba/alibaba-vision-model/benchmark/config.ts)
قائمة جميع الموديلز مع أولوياتها وإعداداتها (أسماء، API endpoint، الـ output size، إلخ)

### [NEW] [benchmark/run_benchmark.ts](file:///d:/My_Projects/alibaba/alibaba-vision-model/benchmark/run_benchmark.ts)
السكريبت الرئيسي:
- **Stage 1:** يختبر 19 VL model على 3 صور من `uploads/` (الأحجام المختلفة: ~20KB, ~160KB, ~1.5MB)
- **Stage 2:** يختبر 6 Image-Edit models على صورة واحدة معيارية
- يشغل الاختبارات بالأولوية العالية أولاً
- يدعم `--stage1-only` أو `--stage2-only` كـ flags
- يُنشئ `report.html` في النهاية

### [NEW] [benchmark/report.html](file:///d:/My_Projects/alibaba/alibaba-vision-model/benchmark/report.html)
تقرير تفاعلي يضم:
- **Stage 1 Panel:** جدول مقارنة السرعة + عدد القطع المكتشفة + دقة JSON لكل موديل
- **Stage 2 Panel:** عرض الصور المستخرجة جنباً بجنب مع بار السرعة والجودة
- تمييز الموديل الحالي بلون خاص
- تمييز "أفضل موديل" تلقائياً بناءً على النتائج

---

## Open Questions

> [!IMPORTANT]
> **الـ Rate Limiting:** Stage 2 عنده كوتا محدودة (100 طلب فقط لكل موديل). كل اختبار Stage 2 = طلب واحد. يعني 6 موديلز × 1 صورة = **6 طلبات فقط** — آمن تماماً.

> [!NOTE]
> **وقت التشغيل المتوقع:**
> - Stage 1: ~19 موديل × 3 صور = 57 طلب (متوازية بـ 3 طلبات كل مرة) → ~10 دقائق
> - Stage 2: 6 موديلز × 1 صورة = 6 طلبات متتالية → ~5 دقائق
> - **الإجمالي: ~15 دقيقة**

---

## Verification Plan

1. التأكد من إنشاء `benchmark/results/stage1_vision/` بـ 19 مجلد
2. التأكد من إنشاء `benchmark/results/stage2_edit/` بـ 6 مجلدات
3. فتح `benchmark/report.html` في المتصفح ومراجعة النتائج بصرياً
4. تحديد أفضل موديل لكل مرحلة ودمجه في الكود الأصلي
