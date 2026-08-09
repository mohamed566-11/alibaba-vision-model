import { useState } from 'react';
import { GarmentInventory, GarmentItem } from '../types';
import { Check, Edit3, Plus, Trash2, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface DetectedItemsAreaProps {
  inventory: GarmentInventory | null;
  isAnalyzing: boolean;
  onUpdateInventory: (inventory: GarmentInventory) => void;
  disabled?: boolean;
}

export function DetectedItemsArea({ 
  inventory, 
  isAnalyzing, 
  onUpdateInventory,
  disabled 
}: DetectedItemsAreaProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [newItemCategory, setNewItemCategory] = useState('');
  const [newItemDescription, setNewItemDescription] = useState('');
  const [newItemColor, setNewItemColor] = useState('');

  if (isAnalyzing) {
    return (
      <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-4 transition-all animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin shrink-0" />
          <div>
            <h4 className="text-sm font-semibold text-amber-950">Stage 1: Analyzing Garments</h4>
            <p className="text-xs text-amber-800/90 mt-0.5">
              AI Vision model is detecting visible clothing items in the reference photo...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!inventory || !inventory.items || inventory.items.length === 0) {
    return (
      <div className="bg-zinc-50 border border-zinc-200/80 rounded-xl p-4 text-center">
        <p className="text-xs text-zinc-500 font-medium">
          Upload an image to automatically detect visible fashion items.
        </p>
      </div>
    );
  }

  const handleToggleItemVisibility = (id: string) => {
    const updated = inventory.items.map(item => {
      if (item.id === id) {
        return { ...item, visible: !item.visible };
      }
      return item;
    });
    onUpdateInventory({
      ...inventory,
      items: updated
    });
  };

  const handleRemoveItem = (id: string) => {
    const updated = inventory.items.filter(item => item.id !== id);
    onUpdateInventory({
      ...inventory,
      items: updated
    });
  };

  const handleAddItem = () => {
    if (!newItemCategory.trim()) return;
    const newItem: GarmentItem = {
      id: uuidv4(),
      category: newItemCategory.trim().toLowerCase(),
      description: newItemDescription.trim() || `${newItemColor} ${newItemCategory}`.trim(),
      color: newItemColor.trim() || 'original',
      visible: true
    };
    onUpdateInventory({
      ...inventory,
      items: [...inventory.items, newItem]
    });
    setNewItemCategory('');
    setNewItemDescription('');
    setNewItemColor('');
  };

  const handleGenderChange = (gender: 'male' | 'female' | 'neutral') => {
    onUpdateInventory({
      ...inventory,
      gender_presentation: gender
    });
  };

  const selectedCount = inventory.items.filter(i => i.visible !== false).length;

  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm space-y-3.5 transition-all">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4.5 h-4.5 text-emerald-600" />
          <h4 className="text-sm font-semibold text-zinc-900">Detected Items</h4>
          <span className="text-xs font-semibold px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200/60 rounded-full">
            {selectedCount} / {inventory.items.length} selected for extraction
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsEditing(!isEditing)}
          disabled={disabled}
          className="text-xs font-medium text-zinc-700 hover:text-zinc-950 active:scale-95 flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 active:bg-zinc-300 rounded-lg transition-all duration-200 disabled:opacity-50 cursor-pointer shadow-2xs"
        >
          <Edit3 className="w-3.5 h-3.5" />
          {isEditing ? 'Done Editing' : 'Edit / Add Items'}
        </button>
      </div>

      <p className="text-[11px] text-zinc-500 font-medium">
        Click an item badge to select/deselect it for extraction. Only checked items will be generated.
      </p>

      {/* Gender presentation badge */}
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <span>Subject Presentation:</span>
        {isEditing ? (
          <div className="flex gap-1.5">
            {(['male', 'female', 'neutral'] as const).map(g => (
              <button
                key={g}
                type="button"
                onClick={() => handleGenderChange(g)}
                className={`px-2.5 py-1 rounded-md text-xs capitalize transition-all duration-150 active:scale-95 cursor-pointer ${
                  inventory.gender_presentation === g 
                    ? 'bg-zinc-900 text-white font-semibold shadow-2xs' 
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        ) : (
          <span className="font-semibold text-zinc-800 capitalize bg-zinc-100 px-2.5 py-0.5 rounded-md border border-zinc-200/60">
            {inventory.gender_presentation}
          </span>
        )}
      </div>

      {/* Item Badges List with Toggle Selection */}
      <div className="flex flex-wrap gap-2 pt-1">
        {inventory.items.map(item => {
          const isSelected = item.visible !== false;

          return (
            <div 
              key={item.id}
              onClick={() => !disabled && handleToggleItemVisibility(item.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium shadow-2xs transition-all duration-200 cursor-pointer select-none ${
                isSelected
                  ? 'bg-emerald-50/90 border border-emerald-300 text-emerald-950 hover:bg-emerald-100/80 ring-1 ring-emerald-400/30'
                  : 'bg-zinc-100 border border-zinc-200 text-zinc-400 line-through opacity-60 hover:opacity-80'
              }`}
              title={isSelected ? "Click to exclude item from extraction" : "Click to include item in extraction"}
            >
              {isSelected ? (
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              ) : (
                <EyeOff className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              )}
              
              <span className="capitalize font-semibold text-zinc-900">{item.category}:</span>
              
              <span>
                {item.color && item.color !== 'original' && item.description.toLowerCase().includes(item.color.toLowerCase())
                  ? item.description
                  : `${item.color && item.color !== 'original' ? item.color + ' ' : ''}${item.description}`}
              </span>

              {isEditing && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveItem(item.id);
                  }}
                  className="ml-1 text-zinc-500 hover:text-red-600 active:scale-90 p-0.5 rounded hover:bg-red-50 transition-all cursor-pointer"
                  title="Remove item permanently"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Manual Item Addition when Editing */}
      {isEditing && (
        <div className="pt-3 border-t border-zinc-100 space-y-2.5">
          <p className="text-xs font-semibold text-zinc-700">Add missing garment item:</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              placeholder="Category (e.g. shirt)"
              value={newItemCategory}
              onChange={e => setNewItemCategory(e.target.value)}
              className="px-3 py-2 text-xs border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900 transition-colors"
            />
            <input
              type="text"
              placeholder="Color (e.g. white)"
              value={newItemColor}
              onChange={e => setNewItemColor(e.target.value)}
              className="px-3 py-2 text-xs border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900 transition-colors"
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={newItemDescription}
              onChange={e => setNewItemDescription(e.target.value)}
              className="px-3 py-2 text-xs border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900 transition-colors"
            />
          </div>
          <button
            type="button"
            onClick={handleAddItem}
            disabled={!newItemCategory.trim()}
            className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 active:scale-[0.98] active:bg-black text-white text-xs font-semibold rounded-lg disabled:bg-zinc-200 disabled:text-zinc-400 disabled:transform-none flex items-center justify-center gap-1.5 transition-all duration-200 cursor-pointer shadow-2xs"
          >
            <Plus className="w-4 h-4" />
            Add Garment to Inventory
          </button>
        </div>
      )}
    </div>
  );
}
