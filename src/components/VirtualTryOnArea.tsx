import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, Sparkles, Check, Bookmark, Image as ImageIcon, 
  User, RefreshCw, AlertCircle, Download, Maximize2, X, Plus
} from 'lucide-react';
import type { SavedGarmentItem } from '../types';
import { BeforeAfterSlider } from './BeforeAfterSlider';

interface VirtualTryOnAreaProps {
  savedGarments: SavedGarmentItem[];
  onSwitchToExtractor: () => void;
}

export function VirtualTryOnArea({ savedGarments, onSwitchToExtractor }: VirtualTryOnAreaProps) {
  // Person photo state
  const [personFile, setPersonFile] = useState<File | null>(null);
  const [personPreview, setPersonPreview] = useState<string | null>(null);
  const personInputRef = useRef<HTMLInputElement>(null);

  // Selected garments state
  const [selectedGarmentIds, setSelectedGarmentIds] = useState<string[]>([]);
  const [customGarments, setCustomGarments] = useState<Array<{ id: string; category: string; description: string; color: string; imageUrl: string }>>([]);
  const customGarmentInputRef = useRef<HTMLInputElement>(null);

  // Execution & Result state
  const [isLoading, setIsLoading]         = useState(false);
  const [elapsedSecs, setElapsedSecs]     = useState(0);
  const [resultImage, setResultImage]     = useState<string | null>(null);
  const [error, setError]                 = useState<string | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [modelUsed, setModelUsed]         = useState<string | null>(null);

  const timerRef            = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortControllerRef  = useRef<AbortController | null>(null);

  // Toggle selection of saved closet item
  const toggleGarmentSelection = (id: string) => {
    setSelectedGarmentIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Handle person photo select
  const handlePersonFileSelect = (file: File) => {
    setPersonFile(file);
    setPersonPreview(URL.createObjectURL(file));
    setError(null);
  };

  // Handle custom extra garment upload
  const handleCustomGarmentUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      const newCustom = {
        id: `custom_${Date.now()}`,
        category: 'custom garment',
        description: file.name.replace(/\.[^/.]+$/, ""),
        color: 'original',
        imageUrl: base64
      };
      setCustomGarments(prev => [...prev, newCustom]);
      setSelectedGarmentIds(prev => [...prev, newCustom.id]);
    };
    reader.readAsDataURL(file);
  };

  // Run Virtual Try-On
  const handleTryOn = async () => {
    if (!personFile) {
      setError('Please upload a photo of yourself or a model first.');
      return;
    }

    // Combine selected saved garments + selected custom garments
    const allAvailable = [...savedGarments, ...customGarments];
    const selected = allAvailable.filter(g => selectedGarmentIds.includes(g.id));

    if (selected.length === 0) {
      setError('Please select at least 1 garment item from your closet or upload one.');
      return;
    }

    // Setup AbortController for cancel support
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsLoading(true);
    setError(null);
    setResultImage(null);
    setModelUsed(null);
    setElapsedSecs(0);

    timerRef.current = setInterval(() => setElapsedSecs(s => s + 1), 1000);

    try {
      const formData = new FormData();
      formData.append('person_image', personFile);
      formData.append('selected_garments', JSON.stringify(selected));

      const res = await fetch('/api/garment/tryon', {
        method: 'POST',
        body: formData,
        signal: abortController.signal
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Virtual try-on failed.');
      }

      setResultImage(data.image_url);
      if (data.model_used) setModelUsed(data.model_used);

    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError('Try-on cancelled.');
      } else {
        console.error(err);
        setError(err.message || 'An error occurred during virtual try-on.');
      }
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancel = () => {
    abortControllerRef.current?.abort();
  };

  const handleDownload = () => {
    if (!resultImage) return;
    const a = document.createElement('a');
    a.href = resultImage;
    a.download = `virtual-tryon-${Date.now()}.png`;
    a.click();
  };

  const allGarments = [...savedGarments, ...customGarments];
  const selectedCount = selectedGarmentIds.length;

  return (
    <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      
      {/* Left Column: Controls & Outfit Selection */}
      <div className="lg:col-span-6 space-y-6">

        {/* STEP 1: Person Photo Upload */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-800 font-bold text-xs">
                1
              </div>
              <h3 className="text-sm font-bold text-zinc-900">Upload Target Person / Your Photo</h3>
            </div>
            {personPreview && (
              <button 
                onClick={() => { setPersonFile(null); setPersonPreview(null); }}
                className="text-xs text-red-600 hover:text-red-700 font-medium cursor-pointer"
              >
                Change photo
              </button>
            )}
          </div>

          <input 
            ref={personInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handlePersonFileSelect(e.target.files[0])}
          />

          {!personPreview ? (
            <div 
              onClick={() => personInputRef.current?.click()}
              className="border-2 border-dashed border-zinc-200 hover:border-zinc-400 bg-zinc-50/50 hover:bg-zinc-50 rounded-xl p-6 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-3"
            >
              <div className="w-12 h-12 rounded-full bg-white shadow-xs border border-zinc-200 flex items-center justify-center text-zinc-600">
                <User className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-900">Click to upload person photo</p>
                <p className="text-xs text-zinc-500 mt-1">Upload a clear full-body or half-body portrait photo</p>
              </div>
            </div>
          ) : (
            <div className="relative rounded-xl overflow-hidden border border-zinc-200 bg-zinc-50 h-56 flex items-center justify-center">
              <img src={personPreview} alt="Person target" className="h-full w-full object-contain p-2" />
              <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-md text-white text-[11px] font-medium px-2.5 py-1 rounded-md flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-emerald-400" /> Model Ready
              </div>
            </div>
          )}
        </div>

        {/* STEP 2: Select Outfit Garments from Closet */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-800 font-bold text-xs">
                2
              </div>
              <h3 className="text-sm font-bold text-zinc-900">Select Outfit from Closet</h3>
            </div>

            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${selectedCount > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-zinc-100 text-zinc-500'}`}>
              {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
            </span>
          </div>

          <input 
            ref={customGarmentInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleCustomGarmentUpload(e.target.files[0])}
          />

          {allGarments.length === 0 ? (
            <div className="text-center py-8 px-4 border border-dashed border-zinc-200 rounded-xl bg-zinc-50/50">
              <Bookmark className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-zinc-700 mb-1">Your saved closet is empty</p>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto mb-4">
                Extract garments from photos first to save them to your closet, or upload a garment image directly.
              </p>
              <div className="flex justify-center gap-2">
                <button 
                  onClick={onSwitchToExtractor}
                  className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold rounded-lg transition-all"
                >
                  Go to Garment Extractor
                </button>
                <button 
                  onClick={() => customGarmentInputRef.current?.click()}
                  className="px-3.5 py-2 bg-white border border-zinc-300 hover:bg-zinc-50 text-zinc-700 text-xs font-semibold rounded-lg transition-all flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Upload Garment
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-72 overflow-y-auto p-1 custom-scrollbar">
                {allGarments.map(item => {
                  const isSelected = selectedGarmentIds.includes(item.id);
                  return (
                    <div 
                      key={item.id}
                      onClick={() => toggleGarmentSelection(item.id)}
                      className={`group relative rounded-xl border cursor-pointer overflow-hidden transition-all duration-200 bg-zinc-50 ${
                        isSelected 
                          ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-sm' 
                          : 'border-zinc-200 hover:border-zinc-300'
                      }`}
                    >
                      <div className="aspect-square w-full relative overflow-hidden bg-white">
                        <img 
                          src={item.imageUrl} 
                          alt={item.description} 
                          className="w-full h-full object-contain p-1.5 group-hover:scale-105 transition-transform" 
                        />
                        <div className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                          isSelected ? 'bg-emerald-500 text-white shadow-xs' : 'bg-white/80 border border-zinc-300 text-transparent'
                        }`}>
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      </div>
                      <div className="p-1.5 text-center bg-white border-t border-zinc-100">
                        <p className="text-[10px] font-bold text-zinc-900 capitalize truncate">{item.category}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 flex justify-between items-center pt-2 border-t border-zinc-100">
                <button 
                  onClick={() => customGarmentInputRef.current?.click()}
                  className="text-xs font-semibold text-zinc-600 hover:text-zinc-900 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add another garment photo
                </button>
                {selectedCount > 0 && (
                  <button 
                    onClick={() => setSelectedGarmentIds([])}
                    className="text-xs text-zinc-400 hover:text-zinc-600 font-medium"
                  >
                    Clear selection
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 font-medium">{error}</p>
          </div>
        )}

        {/* Execute Try-On Button + Cancel */}
        <div className="flex gap-2">
          <button
            onClick={handleTryOn}
            disabled={!personFile || selectedCount === 0 || isLoading}
            className="flex-1 py-4 px-6 bg-zinc-900 hover:bg-zinc-800 active:scale-[0.98] active:bg-black disabled:bg-zinc-200 disabled:text-zinc-400 disabled:transform-none text-white font-semibold rounded-xl shadow-sm hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2 group cursor-pointer"
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                <span>Dressing Model… <span className="font-mono tabular-nums text-white/70">{elapsedSecs}s</span></span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 text-amber-300 group-hover:rotate-12 transition-transform" />
                <span>✨ Fit Outfit on Model</span>
              </>
            )}
          </button>

          {isLoading && (
            <button
              onClick={handleCancel}
              className="px-4 py-4 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 font-semibold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer text-sm"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
          )}
        </div>

      </div>

      {/* Right Column: Result Display */}
      <div className="lg:col-span-6 flex flex-col lg:sticky lg:top-24">
        <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-xs">
          <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-white">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4.5 h-4.5 text-amber-500" />
              <h3 className="text-sm font-bold text-zinc-900">Virtual Try-On Result</h3>
              {modelUsed && (
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                  {modelUsed}
                </span>
              )}
            </div>
            {resultImage && personPreview && (
              <button 
                onClick={() => setShowComparison(!showComparison)}
                className={`text-xs font-semibold px-3 py-1 rounded-md transition-all ${
                  showComparison ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                }`}
              >
                {showComparison ? 'View Result' : 'Compare Before/After'}
              </button>
            )}
          </div>

          <div className="w-full bg-zinc-50 relative overflow-hidden" style={{ minHeight: '480px', maxHeight: '680px', height: 'clamp(480px, 55vw, 680px)' }}>
            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.div 
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-white/90 backdrop-blur-sm"
                >
                  <div className="relative mb-4">
                    <div className="w-16 h-16 border-3 border-emerald-100 border-t-emerald-600 rounded-full animate-spin" />
                    <Sparkles className="w-6 h-6 text-emerald-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                  </div>
                  <h4 className="text-base font-bold text-zinc-900 mb-1">Fitting Outfit onto Person…</h4>
                  <p className="text-xs text-zinc-500 max-w-xs">AI is tailoring and draping the selected clothes onto your target model.</p>
                  <div className="mt-4 px-3 py-1 bg-zinc-100 rounded-full text-xs font-mono text-zinc-600">
                    {elapsedSecs}s elapsed
                  </div>
                </motion.div>
              ) : resultImage ? (
                showComparison && personPreview ? (
                  <motion.div key="cmp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0">
                    <BeforeAfterSlider originalImage={personPreview} resultImage={resultImage} />
                  </motion.div>
                ) : (
                  <motion.div key="res" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 p-4 flex items-center justify-center">
                    <img src={resultImage} alt="Virtual Try-on" className="w-full h-full object-contain rounded-lg" />
                  </motion.div>
                )
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-zinc-400">
                  <div className="w-16 h-16 rounded-full bg-zinc-100 flex items-center justify-center mb-3 text-zinc-300">
                    <User className="w-8 h-8" />
                  </div>
                  <p className="text-sm font-semibold text-zinc-600 mb-1">No Try-On Result Yet</p>
                  <p className="text-xs text-zinc-400 max-w-xs">Upload your photo, choose clothes from your closet, then click "Fit Outfit" to preview yourself in the outfit.</p>
                </div>
              )}
            </AnimatePresence>
          </div>

          {resultImage && (
            <div className="p-4 border-t border-zinc-100 flex items-center justify-between gap-3 bg-white">
              <button
                onClick={handleTryOn}
                disabled={isLoading}
                className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Re-Generate
              </button>
              <button
                onClick={handleDownload}
                className="px-5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold rounded-lg shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Download Outfit Photo
              </button>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
