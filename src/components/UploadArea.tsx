import { UploadCloud, Image as ImageIcon, X } from 'lucide-react';
import React, { useCallback, useState } from 'react';

interface UploadAreaProps {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
  previewUrl: string | null;
  onClear: () => void;
  isLoading: boolean;
}

export function UploadArea({ onFileSelect, selectedFile, previewUrl, onClear, isLoading }: UploadAreaProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true);
    } else if (e.type === 'dragleave') {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        onFileSelect(file);
      } else {
        alert('Please upload a valid image file (JPG, PNG, WEBP).');
      }
    }
  }, [onFileSelect]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  if (previewUrl && selectedFile) {
    return (
      <div className="relative w-full h-[500px] bg-zinc-50 rounded-2xl border border-zinc-200 overflow-hidden group shadow-2xs transition-all duration-300">
        <img 
          src={previewUrl} 
          alt="Original Garment Preview" 
          className="w-full h-full object-contain p-4"
        />
        
        {/* Overlay controls */}
        <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-between p-4">
          <div className="flex justify-end">
             <button 
              onClick={onClear}
              disabled={isLoading}
              className="p-2 bg-white/90 hover:bg-white active:scale-95 rounded-full shadow-md text-zinc-700 hover:text-red-600 transition-all duration-200 disabled:opacity-50 cursor-pointer"
              title="Remove image"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <div className="flex items-center justify-between bg-white/95 backdrop-blur-md p-3.5 rounded-xl shadow-md border border-white/40">
            <div className="flex items-center gap-3 overflow-hidden">
               <ImageIcon className="w-5 h-5 text-zinc-500 shrink-0" />
               <div className="flex flex-col min-w-0">
                 <span className="text-sm font-semibold text-zinc-900 truncate">
                   {selectedFile.name}
                 </span>
                 <span className="text-xs text-zinc-500">
                   {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                 </span>
               </div>
            </div>
            
            <div className="relative shrink-0">
               <button 
                 disabled={isLoading}
                 className="text-sm font-medium px-4 py-2 bg-zinc-100 hover:bg-zinc-900 hover:text-white active:scale-95 text-zinc-800 rounded-lg transition-all duration-200 disabled:opacity-50 cursor-pointer shadow-2xs"
               >
                 Replace
               </button>
               <input 
                  type="file" 
                  accept="image/jpeg, image/png, image/webp" 
                  onChange={handleChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  disabled={isLoading}
                />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      className={`relative w-full h-[500px] rounded-2xl border-2 border-dashed transition-all duration-200 flex flex-col items-center justify-center p-6 text-center ${
        isDragging 
          ? 'border-zinc-800 bg-zinc-100/70 scale-[0.99]' 
          : 'border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50/50'
      }`}
    >
      <div className="p-4 bg-zinc-100/90 group-hover:bg-zinc-200/80 rounded-2xl mb-6 transition-colors">
        <UploadCloud className="w-8 h-8 text-zinc-700" />
      </div>
      
      <h3 className="text-xl font-semibold text-zinc-900 mb-2">
        Upload Fashion Image
      </h3>
      <p className="text-zinc-500 max-w-[280px] mb-8 text-sm leading-relaxed">
        Upload a photo containing garments to isolate and extract them cleanly.
      </p>

      <div className="relative">
        <button className="px-6 py-3.5 bg-zinc-900 hover:bg-zinc-800 active:scale-95 text-white font-medium rounded-xl shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer flex items-center gap-2">
          Select Image
        </button>
        <input 
          type="file" 
          accept="image/jpeg, image/png, image/webp" 
          onChange={handleChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>
      
      <div className="mt-6 flex items-center gap-4 text-xs font-medium text-zinc-400">
        <span>JPG</span>
        <div className="w-1 h-1 rounded-full bg-zinc-300" />
        <span>PNG</span>
        <div className="w-1 h-1 rounded-full bg-zinc-300" />
        <span>WEBP</span>
      </div>
    </div>
  );
}
