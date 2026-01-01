
export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'error';

export type TargetFormat = 'original' | 'webp' | 'avif' | 'jpeg' | 'png';

export interface ProcessingSettings {
  targetFormat: TargetFormat;
  quality: number;
  maxWidth: number;
  maxHeight: number;
  preserveMetadata: boolean;
}

export interface ImageFile {
  id: string;
  file: File;
  preview: string;
  status: ProcessingStatus;
  progress: number;
  originalSize: number;
  optimizedSize?: number;
  optimizedUrl?: string;
  optimizedName?: string;
  error?: string;
  aiSuggestedName?: string;
}

export interface GlobalState {
  images: ImageFile[];
  settings: ProcessingSettings;
  isProcessing: boolean;
}
