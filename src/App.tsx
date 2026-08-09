import { useState, useEffect, useRef } from 'react';
import { UploadArea } from './components/UploadArea';
import { SettingsPanel } from './components/SettingsPanel';
import { ResultArea } from './components/ResultArea';
import { HistoryList } from './components/HistoryList';
import { DetectedItemsArea } from './components/DetectedItemsArea';
import { SavedCloset } from './components/SavedCloset';
import type {
  GarmentType, BackgroundType, QualityType,
  GenerationHistoryItem, GarmentInventory,
  SavedGarmentItem, ExtractedItemResult,
  ExtractionStage, ExtractionResponse
} from './types';
import { Sparkles, Scissors, AlertCircle, X } from 'lucide-react';

export default function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl]     = useState<string | null>(null);
  const [resultImage, setResultImage]   = useState<string | null>(null);
  const [itemResults, setItemResults]   = useState<ExtractedItemResult[]>([]);

  const [isLoading, setIsLoading]       = useState(false);
  const [isAnalyzing, setIsAnalyzing]   = useState(false);
  const [stage, setStage]               = useState<ExtractionStage>('idle');
  const [inventory, setInventory]       = useState<GarmentInventory | null>(null);
  const [isVerified, setIsVerified]     = useState<boolean | undefined>(undefined);
  const [verificationReason, setVerificationReason] = useState<string | undefined>(undefined);
  const [error, setError]               = useState<string | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [elapsedSecs, setElapsedSecs]   = useState(0);
  const abortControllerRef              = useRef<AbortController | null>(null);
  const timerRef                        = useRef<ReturnType<typeof setInterval> | null>(null);

  const [garmentType, setGarmentType]       = useState<GarmentType>('Auto Detect');
  const [backgroundType, setBackgroundType] = useState<BackgroundType>('Clean White');
  const [quality, setQuality]               = useState<QualityType>('High');

  const [history, setHistory] = useState<GenerationHistoryItem[]>(() => {
    try { return JSON.parse(localStorage.getItem('garment_history') || '[]'); } catch { return []; }
  });
  const [savedGarments, setSavedGarments] = useState<SavedGarmentItem[]>(() => {
    try { return JSON.parse(localStorage.getItem('saved_garments') || '[]'); } catch { return []; }
  });

  useEffect(() => { localStorage.setItem('garment_history', JSON.stringify(history)); }, [history]);
  useEffect(() => { localStorage.setItem('saved_garments', JSON.stringify(savedGarments)); }, [savedGarments]);

  const analyzeImage = async (file: File) => {
    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('/api/garment/analyze', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok && data.success && data.inventory) setInventory(data.inventory);
    } catch (e) { console.warn('Auto analysis skipped:', e); }
    finally { setIsAnalyzing(false); }
  };

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setResultImage(null);
    setItemResults([]);
    setError(null);
    setShowComparison(false);
    setInventory(null);
    setIsVerified(undefined);
    setVerificationReason(undefined);
    setStage('idle');
    analyzeImage(file);
  };

  const handleClear = () => {
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setResultImage(null);
    setItemResults([]);
    setError(null);
    setInventory(null);
    setIsVerified(undefined);
    setVerificationReason(undefined);
    setStage('idle');
  };

  const analyzeAndExtract = async () => {
    if (!selectedFile) return;

    // Setup abort controller for cancel support
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsLoading(true);
    setError(null);
    setResultImage(null);
    setItemResults([]);
    setIsVerified(undefined);
    setVerificationReason(undefined);
    setStage('extracting');
    setElapsedSecs(0);

    // Start elapsed timer
    timerRef.current = setInterval(() => setElapsedSecs(s => s + 1), 1000);

    const formData = new FormData();
    formData.append('image', selectedFile);
    formData.append('garment_type', garmentType);
    formData.append('background', backgroundType);
    formData.append('quality', quality);
    if (inventory) formData.append('confirmed_inventory', JSON.stringify(inventory));

    try {
      const response = await fetch('/api/garment/extract', {
        method: 'POST',
        body: formData,
        signal: abortController.signal
      });

      const isJson = response.headers.get('content-type')?.includes('application/json');
      if (!isJson) throw new Error(`Invalid response (${response.status}). Please try again.`);

      setStage('finalizing');
      const data: ExtractionResponse = await response.json();

      if (!response.ok || !data.success) throw new Error(data.message || 'Extraction failed');

      const imageUrl = data.image_url || data.item_results?.[0]?.image_url;
      if (!imageUrl) throw new Error('No result image returned');

      setResultImage(imageUrl);
      setItemResults(data.item_results || []);
      setIsVerified(data.verified);
      setVerificationReason(data.verification_reason);
      if (data.inventory) setInventory(data.inventory);

      if (previewUrl) {
        setHistory(prev => [{
          id: Math.random().toString(36).substring(7),
          originalImage: previewUrl,
          generatedImage: imageUrl,
          timestamp: Date.now(),
          garmentType,
          verified: data.verified
        }, ...prev].slice(0, 12));
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setError('Extraction cancelled.');
      } else {
        console.error(err);
        setError(err.message || 'An unexpected error occurred.');
      }
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      abortControllerRef.current = null;
      setIsLoading(false);
      setStage('idle');
    }
  };

  const handleCancel = () => {
    abortControllerRef.current?.abort();
    if (timerRef.current) clearInterval(timerRef.current);
    setIsLoading(false);
    setStage('idle');
    setError('Extraction cancelled.');
  };

  const handleSaveItem = (item: SavedGarmentItem) => {
    setSavedGarments(prev => [item, ...prev.filter(i => i.imageUrl !== item.imageUrl)]);
  };

  const handleRemoveSaved = (id: string) => setSavedGarments(prev => prev.filter(i => i.id !== id));

  const loadHistoryItem = (item: GenerationHistoryItem) => {
    setPreviewUrl(item.originalImage);
    setResultImage(item.generatedImage);
    setItemResults([]);
    setGarmentType(item.garmentType);
    setIsVerified(item.verified);
    setShowComparison(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#FBFBFA] font-sans selection:bg-zinc-200">

      <header className="w-full bg-white border-b border-zinc-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-zinc-900 rounded-lg flex items-center justify-center">
              <Scissors className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-zinc-900 tracking-tight">Alta</span>
            <span className="text-zinc-300">/</span>
            <span className="text-sm font-medium text-zinc-500">AI Garment Extractor</span>
          </div>
          <span className="flex items-center gap-2 text-xs font-medium px-2.5 py-1 bg-zinc-100 text-zinc-600 rounded-md">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            1 API call · Local crop per item · Closet saving
          </span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">

          <div className="space-y-6">
            <UploadArea onFileSelect={handleFileSelect} selectedFile={selectedFile} previewUrl={previewUrl} onClear={handleClear} isLoading={isLoading} />

            {selectedFile && (
              <DetectedItemsArea inventory={inventory} isAnalyzing={isAnalyzing} onUpdateInventory={setInventory} disabled={isLoading} />
            )}

            <SettingsPanel garmentType={garmentType} setGarmentType={setGarmentType} backgroundType={backgroundType} setBackgroundType={setBackgroundType} quality={quality} setQuality={setQuality} disabled={isLoading || !selectedFile} />

            {error && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 font-medium">{error}</p>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={analyzeAndExtract} disabled={!selectedFile || isLoading || isAnalyzing}
                className="flex-1 py-4 px-6 bg-zinc-900 hover:bg-zinc-800 active:scale-[0.98] active:bg-black disabled:bg-zinc-200 disabled:text-zinc-400 disabled:transform-none text-white font-semibold rounded-xl shadow-sm hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2 group cursor-pointer">
                {isLoading
                  ? <><div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" /><span>Extracting… <span className="font-mono tabular-nums text-white/70">{elapsedSecs}s</span></span></>
                  : <><Sparkles className="w-5 h-5 group-hover:text-amber-200 transition-colors" />Analyze & Extract</>}
              </button>
              {isLoading && (
                <button onClick={handleCancel} className="px-4 py-4 bg-red-50 hover:bg-red-100 active:scale-95 border border-red-200 text-red-700 font-semibold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0">
                  <X className="w-4 h-4" /> Cancel
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col lg:sticky lg:top-24">
            <ResultArea
              originalImage={previewUrl}
              resultImage={resultImage}
              itemResults={itemResults}
              isLoading={isLoading}
              stage={stage}
              isVerified={isVerified}
              verificationReason={verificationReason}
              savedGarments={savedGarments}
              onSaveItem={handleSaveItem}
              onRemoveSavedItem={handleRemoveSaved}
              onRegenerate={analyzeAndExtract}
              showComparison={showComparison}
              setShowComparison={setShowComparison}
            />
          </div>
        </div>
      </main>

      <SavedCloset items={savedGarments} onRemove={handleRemoveSaved} />
      <HistoryList items={history} onSelect={loadHistoryItem} onDelete={(id) => setHistory(prev => prev.filter(i => i.id !== id))} />
    </div>
  );
}
