# تقرير شامل — كل الموديلز المتاحة (160 موديل)

> إجمالي الموديلز المُرسلة: **64 Image Model + 96 LLM Model = 160 موديل**
> تاريخ انتهاء كل الكوتا: **2026/11/07** (ماعدا بعض الاستثناءات)

---

## 🟢 الجدول الأول — ينفع نشتغل عليهم

### Stage 1 — VL/Vision Models (تحليل واكتشاف الملابس — بديل `qwen-vl-max`)

| # | Model Code | الكوتا المتبقية | الكوتا الكلية | الحجم / الخصائص | أولوية الاختبار |
|---|---|---|---|---|---|
| 1 | `qwen-vl-max` ⭐ **الحالي** | 1,000,000 | 1,000,000 | Flagship VL | - |
| 2 | `qwen-vl-plus` | 1,000,000 | 1,000,000 | Mid VL | 🔴 عالية |
| 3 | `qwen-vl-ocr` | 1,000,000 | 1,000,000 | OCR متخصص | 🟡 متوسطة |
| 4 | `qwen-vl-ocr-2025-11-20` | 1,000,000 | 1,000,000 | OCR نسخة محددة | 🟡 متوسطة |
| 5 | `qwen3-vl-flash` | 1,000,000 | 1,000,000 | الأسرع جيل 3 | 🔴 عالية |
| 6 | `qwen3-vl-flash-2025-10-15` | 1,000,000 | 1,000,000 | Flash نسخة محددة | 🟡 متوسطة |
| 7 | `qwen3-vl-flash-2026-01-22` | 1,000,000 | 1,000,000 | Flash نسخة محددة | 🟡 متوسطة |
| 8 | `qwen3-vl-plus` | 1,000,000 | 1,000,000 | Plus جيل 3 | 🔴 عالية |
| 9 | `qwen3-vl-plus-2025-09-23` | 1,000,000 | 1,000,000 | Plus نسخة محددة | 🟡 متوسطة |
| 10 | `qwen3-vl-plus-2025-12-19` | 1,000,000 | 1,000,000 | Plus نسخة محددة | 🟡 متوسطة |
| 11 | `qwen3-vl-8b-instruct` | 1,000,000 | 1,000,000 | 8B الأصغر والأسرع | 🔴 عالية |
| 12 | `qwen3-vl-8b-thinking` | 1,000,000 | 1,000,000 | 8B مع تفكير | 🟢 منخفضة |
| 13 | `qwen3-vl-30b-a3b-instruct` | 1,000,000 | 1,000,000 | 30B متوازن | 🔴 عالية |
| 14 | `qwen3-vl-30b-a3b-thinking` | 1,000,000 | 1,000,000 | 30B مع تفكير | 🟡 متوسطة |
| 15 | `qwen3-vl-32b-instruct` | 1,000,000 | 1,000,000 | 32B قوي | 🔴 عالية |
| 16 | `qwen3-vl-32b-thinking` | 1,000,000 | 1,000,000 | 32B مع تفكير | 🟡 متوسطة |
| 17 | `qwen3-vl-235b-a22b-instruct` | 1,000,000 | 1,000,000 | 235B الأضخم | 🔴 عالية |
| 18 | `qwen3-vl-235b-a22b-thinking` | 1,000,000 | 1,000,000 | 235B مع تفكير عميق | 🟡 متوسطة |
| 19 | `qvq-max` | 1,000,000 | 1,000,000 | Visual Reasoning | 🔴 عالية |

**المجموع: 19 موديل VL**

---

### Stage 2 — Image-Edit Models (استخراج وتفريغ الملابس — بديل `qwen-image-edit-plus`)

| # | Model Code | الكوتا المتبقية | الكوتا الكلية | ملاحظة | أولوية الاختبار |
|---|---|---|---|---|---|
| 1 | `qwen-image-edit-plus` ⭐ **الحالي** | 100 | 100 | Flagship Edit | - |
| 2 | `qwen-image-edit` | 100 | 100 | نسخة أساسية | 🔴 عالية |
| 3 | `qwen-image-edit-max` | 100 | 100 | الأقوى | 🔴 عالية |
| 4 | `qwen-image-edit-max-2026-01-16` | 100 | 100 | Max نسخة محددة | 🟡 متوسطة |
| 5 | `qwen-image-edit-plus-2025-10-30` | 100 | 100 | Plus نسخة محددة | 🟡 متوسطة |
| 6 | `qwen-image-edit-plus-2025-12-15` | 100 | 100 | Plus نسخة محددة | 🟡 متوسطة |

**المجموع: 6 موديل Image-Edit**

---

### Bonus — Image Generation Models (توليد صور — مستقبلاً)

> هذه الموديلز لا تناسب استخراج الملابس مباشرةً، لكن قد تُفيد في مستقبل لتوليد صور منتج على خلفية بيضاء.

| # | Model Code | الكوتا المتبقية | الكوتا الكلية |
|---|---|---|---|
| 1 | `qwen-image` | 100 | 100 |
| 2 | `qwen-image-2.0` | 100 | 100 |
| 3 | `qwen-image-max` | 100 | 100 |
| 4 | `qwen-image-max-2025-12-30` | 100 | 100 |
| 5 | `qwen-image-plus` | 100 | 100 |
| 6 | `qwen-image-plus-2026-01-09` | 100 | 100 |
| 7 | `qwen-image-2.0-pro` | 100 | 100 |
| 8 | `qwen-image-2.0-pro-2026-03-03` | 100 | 100 |
| 9 | `qwen-image-2.0-pro-2026-04-22` | 100 | 100 |
| 10 | `qwen-image-2.0-pro-2026-06-22` | 100 | 100 |
| 11 | `qwen-image-2.0-2026-03-03` | 100 | 100 |
| 12 | `qwen-image-3.0` | 10 | 10 |
| 13 | `qwen-image-3.0-pro` | 10 | 10 |
| 14 | `z-image-turbo` | 100 | 100 |
| 15 | `wan2.7-image` | 50 | 50 |
| 16 | `wan2.7-image-pro` | 50 | 50 |
| 17 | `wan2.6-image` | 50 | 50 |
| 18 | `wan2.1-t2i-turbo` | 200 | 200 |
| 19 | `wan2.1-t2i-plus` | 200 | 200 |
| 20 | `wan2.2-t2i-flash` | 100 | 100 |
| 21 | `wan2.2-t2i-plus` | 100 | 100 |
| 22 | `wan2.5-t2i-preview` | 50 | 50 |
| 23 | `wan2.6-t2i` | 50 | 50 |

**المجموع: 23 موديل توليد صور**

---

## 🔴 الجدول الثاني — لا ينفع (خارج نطاق المشروع)

### موديلز توليد الفيديو — Video Generation (64 - 6 - 23 = 35 موديل غير مفيد من قائمة Image)

| Model Code | النوع | الكوتا |
|---|---|---|
| `wan2.1-vace-plus` | Video Edit | 50 |
| `wan2.7-videoedit` | Video Edit | 50 |
| `wan2.1-kf2v-plus` | Video (keyframe) | 200 |
| `wan2.7-i2v` | Image-to-Video | 50 |
| `wan2.7-i2v-2026-04-25` | Image-to-Video | 50 |
| `wan2.6-i2v` | Image-to-Video | 50 |
| `wan2.6-i2v-flash` | Image-to-Video | 50 |
| `wan2.5-i2v-preview` | Image-to-Video | 50 |
| `wan2.2-i2v-plus` | Image-to-Video | 50 |
| `wan2.2-i2v-flash` | Image-to-Video | 50 |
| `wan2.6-t2v` | Text-to-Video | 50 |
| `wan2.2-t2v-plus` | Text-to-Video | 50 |
| `wan2.7-t2v` | Text-to-Video | 50 |
| `wan2.7-t2v-2026-06-12` | Text-to-Video | 50 |
| `wan2.7-t2v-2026-04-25` | Text-to-Video | 50 |
| `wan2.5-t2v-preview` | Text-to-Video | 50 |
| `wan2.1-t2v-plus` | Text-to-Video | 200 |
| `wan2.1-t2v-turbo` | Text-to-Video | 200 |
| `wan2.6-t2i` | Text-to-Image (مذكور فوق) | - |
| `wan2.7-r2v` | Reference-to-Video | 50 |
| `wan2.7-r2v-2026-06-12` | Reference-to-Video | 50 |
| `wan2.6-r2v` | Reference-to-Video | 50 |
| `wan2.6-r2v-flash` | Reference-to-Video | 50 |
| `wan2.2-animate-move` | Animation | 50 |
| `wan2.2-animate-mix` | Animation | 50 |
| `wan2.1-i2v-turbo` | Image-to-Video | 200 |
| `wan2.1-i2v-plus` | Image-to-Video | 200 |
| `wan2.5-i2i-preview` | Image-to-Image Style | 50 |
| `wan3.0-video` | Video | 30 |
| `happyhorse-1.0-t2v` | Text-to-Video | 10 |
| `happyhorse-1.0-r2v` | Reference-to-Video | 10 |
| `happyhorse-1.0-i2v` | Image-to-Video | 10 |
| `happyhorse-1.0-video-edit` | Video Edit | 10 |
| `happyhorse-1.1-t2v` | Text-to-Video | 10 |
| `happyhorse-1.1-r2v` | Reference-to-Video | 10 |
| `happyhorse-1.1-i2v` | Image-to-Video | 10 |

---

### موديلز LLM نصية بحتة — No Vision (77 موديل من قائمة LLM)

> هذه الموديلز نصية فقط، لا تدعم رؤية الصور، غير مفيدة لتحليل الملابس

| Model Code | الكوتا |
|---|---|
| `qwen3.5-122b-a10b` | 1,000,000 |
| `qwen3.7-plus` | 1,000,000 |
| `qwen3-max` | 1,000,000 |
| `qwen3.5-plus-2026-02-15` | 1,000,000 |
| `qwen-max` | 1,000,000 |
| `qwen-mt-flash` | 1,000,000 |
| `qwen3-235b-a22b-thinking-2507` | 1,000,000 |
| `qwen3.7-max-2026-06-08` | 1,000,000 |
| `glm-5.1` | 1,000,000 |
| `qwen3.7-max-preview` | 1,000,000 |
| `qwen3.6-plus` | 1,000,000 |
| `qwen3.6-max-preview` | 1,000,000 |
| `qwen3-32b` | 1,000,000 |
| `kimi-k2.7-code` | 1,000,000 |
| `glm-5.2` | 1,000,000 |
| `qwen3.5-397b-a17b` | 1,000,000 |
| `qwen3.6-flash` | 1,000,000 |
| `deepseek-v3.2` | 1,000,000 |
| `qwen3-coder-next` | 1,000,000 |
| `qwen3.7-flash-2026-07-15` | 1,000,000 |
| `qwen3.5-flash` | 1,000,000 |
| `deepseek-v4-flash` | 1,000,000 |
| `qwen3.5-35b-a3b` | 1,000,000 |
| `qwen3-30b-a3b-thinking-2507` | 1,000,000 |
| `qwen3-coder-plus-2025-09-23` | 1,000,000 |
| `qwen-plus-latest` | 1,000,000 |
| `qwen3-coder-480b-a35b-instruct` | 1,000,000 |
| `qwen3-max-2026-01-23` | 1,000,000 |
| `qwen3-coder-plus` | 1,000,000 |
| `wan2.2-kf2v-flash` | 50 |
| `qwen-plus-2025-09-11` | 1,000,000 |
| `deepseek-v4-flash-0731` | 1,000,000 |
| `qwen3.5-flash-2026-02-23` | 1,000,000 |
| `qwen3-max-preview` | 1,000,000 |
| `qwen3.7-max-2026-05-20` | 1,000,000 |
| `qwen3.7-plus-2026-05-26` | 1,000,000 |
| `qwen3-8b` | 1,000,000 |
| `qwen3-coder-30b-a3b-instruct` | 1,000,000 |
| `qwen3.6-27b` | 1,000,000 |
| `qwen3-235b-a22b` | 1,000,000 |
| `qwen-plus` | 1,000,000 |
| `qwen-turbo` | 1,000,000 |
| `qwen-mt-lite` | 1,000,000 |
| `qwen3.6-flash-2026-04-16` | 1,000,000 |
| `qwen3-coder-flash` | 1,000,000 |
| `qwq-plus` | 1,000,000 |
| `qwen3-next-80b-a3b-thinking` | 1,000,000 |
| `qwen3.5-27b` | 1,000,000 |
| `qwen3.7-max-2026-05-17` | 1,000,000 |
| `qwen3-30b-a3b` | 1,000,000 |
| `qwen-mt-plus` | 1,000,000 |
| `qwen3-14b` | 1,000,000 |
| `qwen3-max-2025-09-23` | 1,000,000 |
| `qwen-plus-character` | 1,000,000 |
| `deepseek-v4-pro` | 1,000,000 |
| `qwen3-coder-flash-2025-07-28` | 1,000,000 |
| `qwen-flash-character` | 1,000,000 |
| `qwen-plus-2025-04-28` | 1,000,000 |
| `qwen-mt-turbo` | 1,000,000 |
| `qwen3.5-plus` | 1,000,000 |
| `qwen3-30b-a3b-instruct-2507` | 1,000,000 |
| `qwen-flash` | 1,000,000 |
| `qwen-flash-2025-07-28` | 1,000,000 |
| `qwen3.7-flash` | 1,000,000 |
| `qwen3.6-35b-a3b` | 1,000,000 |
| `qwen-plus-2025-07-14` | 1,000,000 |
| `qwen3-235b-a22b-instruct-2507` | 1,000,000 |
| `qwen3.6-plus-2026-04-02` | 1,000,000 |
| `qwen3-coder-plus-2025-07-22` | 1,000,000 |
| `qwen3.5-plus-2026-04-20` | 1,000,000 |
| `qwen3.7-max` | 1,000,000 |
| `qwen3.8-max` | 1,000,000 |
| `qwen3-next-80b-a3b-instruct` | 1,000,000 |
| `qwen-plus-character-ja` | ❌ لا كوتا مجانية |
| `qwen-plus-2025-01-25` | ❌ لا كوتا مجانية |
| `glm-5.2-fast-preview` | ❌ لا كوتا مجانية |
| `qwen-plus-2025-07-28` | 1,000,000 |
| `qwen3-vl-plus-2025-09-23` (مكرر — مذكور في VL) | - |

---

## ملخص تنفيذي

| الفئة | العدد |
|---|---|
| ✅ Stage 1 — VL/Vision Models للاختبار | **19** |
| ✅ Stage 2 — Image-Edit Models للاختبار | **6** |
| 🔵 Bonus — Image Generation (مستقبلي) | **23** |
| ❌ Video Generation (غير مفيد) | **35** |
| ❌ LLM نصي بحت (غير مفيد) | **77** |
| **الإجمالي** | **160** |

