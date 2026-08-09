import { type GarmentType, type BackgroundType, type QualityType } from '../types';

interface SettingsPanelProps {
  garmentType: GarmentType;
  setGarmentType: (v: GarmentType) => void;
  backgroundType: BackgroundType;
  setBackgroundType: (v: BackgroundType) => void;
  quality: QualityType;
  setQuality: (v: QualityType) => void;
  disabled: boolean;
}

export function SettingsPanel({
  garmentType, setGarmentType,
  backgroundType, setBackgroundType,
  quality, setQuality,
  disabled
}: SettingsPanelProps) {
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-5 bg-white border border-zinc-100 shadow-sm rounded-2xl">
      <div className="space-y-2">
        <label className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
          Garment Type
        </label>
        <select 
          value={garmentType}
          onChange={(e) => setGarmentType(e.target.value as GarmentType)}
          disabled={disabled}
          className="w-full bg-zinc-50 border border-zinc-200 text-zinc-900 text-sm rounded-lg focus:ring-zinc-800 focus:border-zinc-800 block p-2.5 outline-none transition-colors disabled:opacity-50"
        >
          <option value="Auto Detect">Auto Detect</option>
          <option value="T-Shirt">T-Shirt</option>
          <option value="Shirt">Shirt</option>
          <option value="Blouse">Blouse</option>
          <option value="Hoodie">Hoodie</option>
          <option value="Sweatshirt">Sweatshirt</option>
          <option value="Jacket">Jacket</option>
          <option value="Coat">Coat</option>
          <option value="Dress">Dress</option>
          <option value="Skirt">Skirt</option>
          <option value="Pants">Pants</option>
          <option value="Jeans">Jeans</option>
          <option value="Shorts">Shorts</option>
          <option value="Other">Other</option>
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
          Background
        </label>
        <select 
          value={backgroundType}
          onChange={(e) => setBackgroundType(e.target.value as BackgroundType)}
          disabled={disabled}
          className="w-full bg-zinc-50 border border-zinc-200 text-zinc-900 text-sm rounded-lg focus:ring-zinc-800 focus:border-zinc-800 block p-2.5 outline-none transition-colors disabled:opacity-50"
        >
          <option value="Clean White">Clean White</option>
          <option value="Light Gray">Light Gray</option>
          <option value="Transparent-style">Transparent-style</option>
          <option value="Original-like neutral">Original-like neutral</option>
          <option value="Auto">Auto</option>
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
          Output Quality
        </label>
        <select 
          value={quality}
          onChange={(e) => setQuality(e.target.value as QualityType)}
          disabled={disabled}
          className="w-full bg-zinc-50 border border-zinc-200 text-zinc-900 text-sm rounded-lg focus:ring-zinc-800 focus:border-zinc-800 block p-2.5 outline-none transition-colors disabled:opacity-50"
        >
          <option value="Standard">Standard</option>
          <option value="High">High</option>
          <option value="Ultra">Ultra</option>
        </select>
      </div>
    </div>
  );
}
