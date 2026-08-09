import { SavedGarmentItem } from '../types';
import { Bookmark, Trash2, ExternalLink } from 'lucide-react';

interface SavedClosetProps {
  items: SavedGarmentItem[];
  onRemove: (id: string) => void;
}

export function SavedCloset({ items, onRemove }: SavedClosetProps) {
  if (items.length === 0) return null;

  return (
    <div className="mt-12 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-16">
      <div className="flex items-center gap-2 mb-6 border-b border-zinc-200 pb-3">
        <Bookmark className="w-5 h-5 text-emerald-600" />
        <h3 className="text-lg font-bold text-zinc-900">Saved Garments Closet (الخزانة المحفوظة)</h3>
        <span className="text-xs font-semibold px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-full ml-2">
          {items.length} saved item{items.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {items.map(item => (
          <div 
            key={item.id}
            className="group relative bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm hover:shadow-xl hover:border-zinc-300 hover:-translate-y-1 transition-all duration-300"
          >
            <div className="w-full relative bg-zinc-50 overflow-hidden" style={{ height: 'clamp(280px, 30vw, 420px)' }}>
              <img 
                src={item.imageUrl} 
                alt={item.description} 
                className="w-full h-full object-contain p-2 group-hover:scale-[1.04] transition-transform duration-300"
              />
              <a 
                href={item.imageUrl} 
                target="_blank" 
                rel="noreferrer"
                className="absolute top-2 right-2 p-1.5 bg-white/90 hover:bg-white text-zinc-700 rounded-full shadow-xs opacity-0 group-hover:opacity-100 transition-opacity"
                title="Open full size"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            <div className="p-4 border-t border-zinc-100 bg-white flex items-center justify-between">
              <div className="flex flex-col min-w-0 pr-2">
                <span className="text-sm font-bold text-zinc-900 capitalize truncate">
                  {item.category}
                </span>
                <span className="text-xs text-zinc-500 truncate" title={item.description}>
                  {item.description}
                </span>
              </div>
              
              <button 
                onClick={() => onRemove(item.id)}
                className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer shrink-0"
                title="Remove from saved closet"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
