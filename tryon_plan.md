# خطة مستقلة: Virtual Try-On — تلبيس الملابس على صورة المستخدم

---

## الفكرة

يختار المستخدم ملبس (أو أكثر) من الـ Closet أو من الصور المستخرجة، ثم يرفع صورة شخصية، والنظام يولّد صورة له وهو يلبس الملابس المختارة.

---

## 🏆 تقييم الموديلز المتاحة للـ Virtual Try-On

### الحقيقة المهمة أولاً:

> [!IMPORTANT]
> الـ Virtual Try-On يحتاج **image-to-image editing** (صورة شخص + صورة ملبس → صورة شخص يلبس الملبس).
> معظم الـ 23 موديل "Image Generation" هي **text-to-image فقط** (نص → صورة) وغير قادرة على Try-On حقيقي.
> **الموديلز الموجودة فعلاً في Stage 2** (`qwen-image-edit-plus`, `qwen-image-edit-max`) هي **الأفضل** لهذه المهمة.

---

### ترتيب الـ 23 موديل من الأفضل للأضعف لـ Virtual Try-On:

#### 🥇 Tier 1 — يدعم Multi-Image Input (الأفضل للـ Try-On)

| # | Model | الكوتا | السبب |
|---|---|---|---|
| 1 | `wan2.7-image-pro` | 50 | أحدث وأقوى Wan image — يدعم reference images |
| 2 | `wan2.7-image` | 50 | Wan image جيل 2.7 — multi-image reference |
| 3 | `wan2.6-image` | 50 | Wan image جيل 2.6 — reference support |

#### 🥈 Tier 2 — يدعم Image Conditioning مع Prompt قوي

| # | Model | الكوتا | السبب |
|---|---|---|---|
| 4 | `qwen-image-3.0-pro` | ⚠️ **10 فقط** | أحدث جيل Qwen image — قوي جداً |
| 5 | `qwen-image-3.0` | ⚠️ **10 فقط** | أحدث جيل Qwen image |
| 6 | `qwen-image-2.0-pro-2026-06-22` | 100 | أحدث نسخة 2.0 pro |
| 7 | `qwen-image-2.0-pro` | 100 | Pro version يدعم تعليمات معقدة |
| 8 | `qwen-image-2.0-pro-2026-04-22` | 100 | نسخة محددة من Pro |
| 9 | `qwen-image-2.0-pro-2026-03-03` | 100 | نسخة محددة من Pro |
| 10 | `qwen-image-2.0-2026-03-03` | 100 | نسخة 2.0 |
| 11 | `qwen-image-2.0` | 100 | Standard 2.0 |
| 12 | `z-image-turbo` | 100 | Turbo سريع |

#### 🥉 Tier 3 — Text-to-Image أساساً (ضعيف للـ Try-On)

| # | Model | الكوتا | السبب |
|---|---|---|---|
| 13 | `qwen-image-max` | 100 | Max لكن بدون reference مضمون |
| 14 | `qwen-image-max-2025-12-30` | 100 | نسخة محددة |
| 15 | `qwen-image-plus` | 100 | Plus level |
| 16 | `qwen-image-plus-2026-01-09` | 100 | نسخة محددة |
| 17 | `qwen-image` | 100 | Base model |
| 18 | `wan2.2-t2i-plus` | 100 | Text-to-Image فقط |
| 19 | `wan2.2-t2i-flash` | 100 | Text-to-Image فقط |
| 20 | `wan2.1-t2i-plus` | 200 | Text-to-Image فقط |
| 21 | `wan2.1-t2i-turbo` | 200 | Text-to-Image فقط |
| 22 | `wan2.5-t2i-preview` | 50 | Text-to-Image فقط |
| 23 | `wan2.6-t2i` | 50 | Text-to-Image فقط |

> [!NOTE]
> **التوصية الفعلية:** الأفضل للـ Try-On هو استخدام **`qwen-image-edit-max`** (الموجود في Stage 2) مع إرسال صورتين في نفس الوقت — صورة الشخص + صورة الملبس المستخرجة. هذا يضمن نتيجة Try-On حقيقية بدلاً من توليد صورة من الصفر.

---

## معمارية النظام المقترحة

```
[الـ Closet / الصور المستخرجة]     [المستخدم يرفع صورته]
         ↓                                    ↓
   يختار قطعة أو أكثر              صورة الشخص (base image)
         ↓                                    ↓
              ↓ ←————————————————→ ↓
         [Virtual Try-On API Call]
         Input: صورة الشخص + صور الملابس المختارة + prompt
         Model: qwen-image-edit-max (الأقوى)
              ↓
         [صورة الشخص يلبس الملابس]
```

---

## Proposed Changes (ملفات جديدة)

### Backend

#### [NEW] `server/services/VirtualTryOnService.ts`
- `tryOnGarments(personImagePath, garmentImageUrls[], apiKey)` — يستقبل صورة شخص وصور الملابس المختارة
- يبني prompt احترافي يصف التلبيس
- يرسل لـ `qwen-image-edit-max` (الأقوى) مع fallback لـ `qwen-image-edit-plus`
- يدعم قطعة واحدة أو أكثر (يدمج الملابس في prompt واحد)

#### [NEW] `server.ts` — إضافة route جديد
```typescript
POST /api/tryon
Body: { person_image, garment_urls[] }
Returns: { result_image_url, elapsed_ms }
```

### Frontend

#### [NEW] `src/components/VirtualTryOnPanel.tsx`
- قسم جديد في الـ UI
- **خطوة 1:** زر "Upload Your Photo" — رفع صورة الشخص مع معاينة
- **خطوة 2:** اختيار الملابس من الـ Closet أو من نتائج الاستخراج الحالية (بالـ checkbox)
- **خطوة 3:** زر "Try It On" → يستدعي الـ API
- **نتيجة:** عرض صورة الشخص بالملابس مع مقارنة قبل/بعد (BeforeAfterSlider)

#### [MODIFY] `src/App.tsx`
- إضافة `VirtualTryOnPanel` للـ layout مع تمرير `savedGarments` و `itemResults` إليه

---

## خطة مراحل التنفيذ

```
Phase 1 → VirtualTryOnService.ts (Backend logic)
Phase 2 → API Route في server.ts
Phase 3 → VirtualTryOnPanel.tsx (UI Component)
Phase 4 → ربط كل شيء في App.tsx
Phase 5 → Benchmark الموديلز الـ 23 على Try-On
```

---

## Open Questions

> [!IMPORTANT]
> **عدد الملابس في Try-On واحد:** هل المستخدم يختار قطعة واحدة (مثلاً شيرت فقط) أم ممكن يختار outfit كامل (شيرت + جاكيت + بنطلون)؟ ده بيأثر على تصميم الـ Prompt.

> [!NOTE]
> **حد الكوتا في Tier 1 (Wan models):** كل Wan image model عنده 50 طلب فقط مجاناً. لو اختبرناهم في الـ Benchmark هيتبقى قليل للإنتاج. نبدأ بـ `qwen-image-edit-max` في الإنتاج ونختبر الـ Wan models في الـ Benchmark فقط؟

> [!NOTE]
> **هل Virtual Try-On يظهر في نفس الصفحة** أم صفحة/Tab منفصل؟

---

## Verification Plan

- اختبار بصورة شخص + قطعة واحدة (شيرت أبيض)
- اختبار بصورة شخص + outfit كامل (شيرت + جاكيت + بنطلون)
- مقارنة جودة النتائج بين `qwen-image-edit-max` و `wan2.7-image-pro`
- قياس وقت الاستجابة
