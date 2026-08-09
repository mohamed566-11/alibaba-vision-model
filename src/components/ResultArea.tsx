import { Download, Maximize2, RotateCw, AlertTriangle, ShieldCheck, Bookmark, Check, Images } from 'lucide-react';
import { BeforeAfterSlider } from './BeforeAfterSlider';
import { motion, AnimatePresence } from 'motion/react';
import { ExtractionStage, ExtractedItemResult, SavedGarmentItem } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface ResultAreaProps {
  originalImage: string | null;
  resultImage: string | null;           // Full combined image
  itemResults: ExtractedItemResult[];   // Per-item cropped images
  isLoading: boolean;
  stage: ExtractionStage;
  isVerified?: boolean;
  verificationReason?: string;
  savedGarments: SavedGarmentItem[];
  onSaveItem: (item: SavedGarmentItem) => void;
  onRemoveSavedItem: (id: string) => void;
  onRegenerate: () => void;
  showComparison: boolean;
  setShowComparison: (v: boolean) => void;
}

const STAGES_LIST: { id: ExtractionStage; label: string }[] = [
  { id: 'analyzing',     label: '1. Analyzing image' },
  { id: 'detecting',     label: '2. Detecting garments' },
  { id: 'building_plan', label: '3. Building extraction plan' },
  { id: 'extracting',    label: '4. Extracting garments (1 API call)' },
  { id: 'finalizing',    label: '5. Cropping individual items locally' },
];

export function ResultArea({
  originalImage, resultImage, itemResults, isLoading, stage,
  isVerified, verificationReason, savedGarments, onSaveItem, onRemoveSavedItem,
  onRegenerate, showComparison, setShowComparison,
}: ResultAreaProps) {

  // Loading state
  if (isLoading) {
    const currentStageIndex = STAGES_LIST.findIndex(s => s.id === stage);
    return (
      <div className="w-full h-[600px] bg-zinc-50 rounded-2xl border border-zinc-200 flex flex-col items-center justify-center p-8 relative overflow-hidden shadow-2xs">
        <div className="absolute inset-0 bg-gradient-to-tr from-zinc-100/50 via-zinc-50 to-zinc-100/50 animate-pulse" />
        <div className="relative z-10 flex flex-col items-center text-center max-w-sm w-full">
          <div className="w-12 h-12 rounded-full border-2 border-zinc-200 border-t-zinc-900 animate-spin mb-6" />
          <h3 className="text-lg font-semibold text-zinc-900 mb-6">Extracting Garments…</h3>
          <div className="w-full space-y-2.5 bg-white/90 backdrop-blur-md p-4 rounded-xl border border-zinc-200/80 shadow-sm">
            {STAGES_LIST.map((stg, idx) => {
              const isActive = stg.id === stage;
              const isPast = currentStageIndex > idx;
              return (
                <div key={stg.id} className={`flex items-center gap-3 text-xs font-medium transition-all duration-300 ${isActive ? 'text-zinc-900 font-semibold translate-x-1' : isPast ? 'text-emerald-700' : 'text-zinc-400'}`}>
                  <div className={`w-4.5 h-4.5 rounded-full flex items-center justify-center text-[10px] shrink-0 font-bold ${isPast ? 'bg-emerald-500 text-white' : isActive ? 'bg-zinc-900 text-white animate-pulse' : 'bg-zinc-100 text-zinc-400 border border-zinc-200'}`}>
                    {isPast ? '✓' : idx + 1}
                  </div>
                  <span>{stg.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Empty state
  if (!resultImage) {
    return (
      <div className="w-full h-[600px] bg-zinc-50 rounded-2xl border border-zinc-200 flex flex-col items-center justify-center p-8 text-center shadow-inner">
        <div className="w-64 h-64 border border-dashed border-zinc-200 rounded-2xl mb-8 flex items-center justify-center bg-white shadow-xs">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-300">
            <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-zinc-900 mb-2">Your extracted garments will appear here</h3>
        <p className="text-zinc-500 text-sm max-w-sm leading-relaxed">
          One API call extracts all items. Each garment is then cropped locally at zero extra cost.
        </p>
      </div>
    );
  }

  const handleDownload = async (url: string, filename: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = objUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(objUrl);
    } catch (e) { console.error('Download failed', e); }
  };

  // When we have per-item results with different URLs (real crops), show item cards
  const hasRealCrops = itemResults.length > 1 && itemResults.some(r => r.image_url !== resultImage);

  return (
    <div className="w-full flex flex-col gap-4">

      {/* Status bar */}
      <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm font-medium ${isVerified !== false ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
        {isVerified !== false
          ? <ShieldCheck className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
          : <AlertTriangle className="w-4.5 h-4.5 text-amber-600 shrink-0" />}
        <span>{verificationReason || 'Extraction complete'}</span>
      </div>

      {/* Full combined image + compare */}
      <div className="w-full bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm">
        <div className="w-full h-[480px] bg-zinc-50 relative group overflow-hidden">
          <AnimatePresence mode="wait">
            {showComparison && originalImage ? (
              <motion.div key="cmp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0">
                <BeforeAfterSlider originalImage={originalImage} resultImage={resultImage} />
              </motion.div>
            ) : (
              <motion.div key="res" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 p-3">
                <img src={resultImage} alt="Full extraction" className="w-full h-full object-contain group-hover:scale-[1.02] transition-transform duration-300" />
              </motion.div>
            )}
          </AnimatePresence>
          <button onClick={() => window.open(resultImage, '_blank')} className="absolute top-3 right-3 p-1.5 bg-white/90 hover:bg-white rounded-full shadow text-zinc-600 hover:text-zinc-900 opacity-0 group-hover:opacity-100 transition-all cursor-pointer">
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="px-4 py-3 border-t border-zinc-100 flex items-center justify-between gap-3 bg-white">
          <div className="flex gap-2">
            <button onClick={() => setShowComparison(!showComparison)} className={`px-3 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer active:scale-95 ${showComparison ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'}`}>
              Compare
            </button>
            <button onClick={onRegenerate} className="px-3 py-2 rounded-lg text-xs font-medium bg-zinc-100 hover:bg-zinc-200 active:scale-95 text-zinc-700 flex items-center gap-1.5 cursor-pointer transition-all">
              <RotateCw className="w-3.5 h-3.5" /> Re-Extract
            </button>
          </div>
          <button onClick={() => handleDownload(resultImage, 'extracted-all.png')} className="px-4 py-2 rounded-lg text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 active:scale-95 text-white flex items-center gap-1.5 cursor-pointer transition-all">
            <Download className="w-3.5 h-3.5" /> Download All
          </button>
        </div>
      </div>

      {/* Per-item cropped cards */}
      {itemResults.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Images className="w-4 h-4 text-zinc-500" />
            <p className="text-xs font-semibold text-zinc-600">
              Individual items — cropped locally, zero extra API cost
            </p>
          </div>

          <div className={`grid gap-3 ${itemResults.length === 1 ? 'grid-cols-1' : itemResults.length === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
            {itemResults.map((result, idx) => {
              const isSaved = savedGarments.some(sg => sg.imageUrl === result.image_url);

              const handleSave = () => {
                if (isSaved) {
                  const existing = savedGarments.find(sg => sg.imageUrl === result.image_url);
                  if (existing) onRemoveSavedItem(existing.id);
                } else {
                  onSaveItem({
                    id: uuidv4(),
                    category: result.item.category,
                    description: result.item.description,
                    color: result.item.color,
                    imageUrl: result.image_url,
                    savedAt: Date.now()
                  });
                }
              };

              return (
                <motion.div
                  key={result.image_url + idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.06 }}
                  className="flex flex-col bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-2xs hover:shadow-md hover:border-zinc-300 transition-all"
                >
                  <div className="w-full aspect-square bg-zinc-50 relative group overflow-hidden">
                    <img src={result.image_url} alt={result.item.description} className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-300" />
                    <button onClick={() => window.open(result.image_url, '_blank')} className="absolute top-2 right-2 p-1.5 bg-white/90 hover:bg-white rounded-full shadow text-zinc-600 opacity-0 group-hover:opacity-100 transition-all cursor-pointer">
                      <Maximize2 className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="p-3 border-t border-zinc-100 space-y-2">
                    <p className="text-xs font-bold text-zinc-900 capitalize truncate">{result.item.category}</p>
                    <p className="text-[10px] text-zinc-500 truncate leading-tight">{result.item.description}</p>
                    <div className="flex gap-1.5">
                      <button onClick={handleSave} className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[10px] font-semibold transition-all active:scale-95 cursor-pointer ${isSaved ? 'bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-red-50 hover:border-red-200 hover:text-red-700' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'}`}>
                        {isSaved ? <Check className="w-3 h-3" /> : <Bookmark className="w-3 h-3" />}
                        {isSaved ? 'Saved' : 'Save'}
                      </button>
                      <button onClick={() => handleDownload(result.image_url, `${result.item.category}-extracted.png`)} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[10px] font-semibold bg-zinc-900 hover:bg-zinc-800 active:scale-95 text-white transition-all cursor-pointer">
                        <Download className="w-3 h-3" /> Download
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
