import { format } from 'date-fns';
import { type GenerationHistoryItem } from '../types';
import { Trash2, ShieldCheck, AlertTriangle } from 'lucide-react';

interface HistoryListProps {
  items: GenerationHistoryItem[];
  onSelect: (item: GenerationHistoryItem) => void;
  onDelete: (id: string) => void;
}

export function HistoryList({ items, onSelect, onDelete }: HistoryListProps) {
  if (items.length === 0) return null;

  return (
    <div className="mt-16 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-24">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-zinc-900">Recent Generations</h3>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {items.map(item => (
          <div 
            key={item.id} 
            className="group relative bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-2xs hover:shadow-md hover:border-zinc-300 transition-all duration-300"
          >
            <button 
              onClick={() => onSelect(item)}
              className="w-full aspect-square relative bg-zinc-50 overflow-hidden block active:scale-95 transition-transform duration-150 cursor-pointer"
            >
              <img 
                src={item.generatedImage} 
                alt={item.garmentType} 
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end p-2.5">
                <span className="text-[11px] font-semibold text-white bg-black/60 backdrop-blur-xs px-2 py-0.5 rounded-md">
                  View Extraction
                </span>
              </div>

              {item.verified !== undefined && (
                <div className="absolute top-2 left-2">
                  {item.verified ? (
                    <div className="bg-emerald-500/90 text-white p-1 rounded-full shadow-xs" title="Verified extraction">
                      <ShieldCheck className="w-3 h-3" />
                    </div>
                  ) : (
                    <div className="bg-amber-500/90 text-white p-1 rounded-full shadow-xs" title="Extraction warning">
                      <AlertTriangle className="w-3 h-3" />
                    </div>
                  )}
                </div>
              )}
            </button>
            
            <div className="p-3 border-t border-zinc-100 flex items-center justify-between bg-white">
              <div className="flex flex-col min-w-0">
                 <span className="text-xs font-semibold text-zinc-900 truncate pr-2">
                   {item.garmentType}
                 </span>
                 <span className="text-[10px] text-zinc-500 font-medium">
                   {format(item.timestamp, 'MMM d, h:mm a')}
                 </span>
              </div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(item.id);
                }}
                className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 active:scale-90 rounded-md transition-all duration-150 cursor-pointer"
                title="Delete history item"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
