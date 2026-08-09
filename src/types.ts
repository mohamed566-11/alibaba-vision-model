export type GarmentType = 
  | 'Auto Detect'
  | 'T-Shirt'
  | 'Shirt'
  | 'Blouse'
  | 'Hoodie'
  | 'Sweatshirt'
  | 'Jacket'
  | 'Coat'
  | 'Dress'
  | 'Skirt'
  | 'Pants'
  | 'Jeans'
  | 'Shorts'
  | 'Shoes'
  | 'Other';

export type BackgroundType = 
  | 'Clean White'
  | 'Light Gray'
  | 'Transparent-style'
  | 'Original-like neutral'
  | 'Auto';

export type QualityType = 'Standard' | 'High' | 'Ultra';

export interface GarmentItem {
  id: string;
  category: string;
  description: string;
  color: string;
  visible: boolean; // Controls whether this item is selected for extraction
}

export interface GarmentInventory {
  gender_presentation: 'male' | 'female' | 'neutral';
  items: GarmentItem[];
}

export interface ExtractedItemResult {
  item: {
    id: string;
    category: string;
    description: string;
    color: string;
    visible: boolean;
  };
  image_url: string;
  verified: boolean;
  verification_reason?: string;
}

export interface SavedGarmentItem {
  id: string;
  category: string;
  description: string;
  color: string;
  imageUrl: string;
  savedAt: number;
}

export type ExtractionStage = 
  | 'idle'
  | 'analyzing'
  | 'detecting'
  | 'building_plan'
  | 'extracting'
  | 'verifying'
  | 'finalizing';

export interface GenerationHistoryItem {
  id: string;
  originalImage: string;
  generatedImage: string;
  timestamp: number;
  garmentType: GarmentType;
  verified?: boolean;
}

export type ActiveTab = 'extractor' | 'tryon';

export interface ExtractionResponse {
  success: boolean;
  image_url?: string;
  item_results?: ExtractedItemResult[];
  verified?: boolean;
  verification_reason?: string;
  inventory?: GarmentInventory;
  attempts?: number;
  message?: string;
}

export interface TryOnResponse {
  success: boolean;
  image_url?: string;
  message?: string;
}

