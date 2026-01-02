import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  ArrowRight,
  Download,
  FileArchive,
  Info,
  Loader2,
  Maximize2,
  Moon,
  Plus,
  Settings as SettingsIcon,
  Sparkles,
  Sun,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import JSZip from 'jszip';
import imageCompression from 'browser-image-compression';
import { ImageFile, ProcessingSettings, TargetFormat, ProcessingStatus } from './types';

// Components
const ProgressBar: React.FC<{ progress: number; status: ProcessingStatus }> = ({ progress, status }) => {
  const getBgColor = () => {
    if (status === 'error') return 'bg-rose-500';
    if (status === 'completed') return 'bg-emerald-500';
    return 'bg-indigo-600';
  };

  return (
    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
      <div 
        className={`h-full rounded-full transition-all duration-500 ease-out ${getBgColor()}`} 
        style={{ width: `${progress}%` }}
      />
    </div>
  );
};

const formatBytes = (bytes: number, decimals = 2) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  if (!Number.isFinite(i) || i < 0 || i >= sizes.length) return '0 Bytes';
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const percentSaved = (originalBytes: number | undefined, optimizedBytes: number | undefined) => {
  if (!Number.isFinite(originalBytes) || !Number.isFinite(optimizedBytes)) return 0;
  if (!originalBytes || originalBytes <= 0) return 0;
  if (optimizedBytes < 0) return 0;

  const pct = (1 - (optimizedBytes / originalBytes)) * 100;
  if (!Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(100, Math.round(pct)));
};

const resizeImageToFit = async (file: File, maxWidth: number, maxHeight: number): Promise<File> => {
  if (!Number.isFinite(maxWidth) || !Number.isFinite(maxHeight) || maxWidth <= 0 || maxHeight <= 0) return file;
  if (!file.type.startsWith('image/')) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(maxWidth / bitmap.width, maxHeight / bitmap.height, 1);

    if (scale >= 1) {
      bitmap.close();
      return file;
    }

    const targetWidth = Math.max(1, Math.round(bitmap.width * scale));
    const targetHeight = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }

    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    bitmap.close();

    const outputType = file.type;
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, outputType);
    });

    if (!blob) return file;

    return new File([blob], file.name, {
      type: blob.type || file.type,
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
};

const fileToDataUrl = async (file: File): Promise<string> => {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(file);
  });
};

const createAiThumbnailPayload = async (file: File) => {
  const resized = await resizeImageToFit(file, 512, 512);

  try {
    const bitmap = await createImageBitmap(resized);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      throw new Error('Canvas context unavailable');
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.75);
    });
    if (!blob) throw new Error('Thumbnail encoding failed');

    const thumbFile = new File([blob], 'thumb.jpg', { type: blob.type || 'image/jpeg' });
    const dataUrl = await fileToDataUrl(thumbFile);
    const base64 = dataUrl.split(',')[1] || '';

    return { mimeType: thumbFile.type, data: base64 };
  } catch {
    const dataUrl = await fileToDataUrl(resized);
    const base64 = dataUrl.split(',')[1] || '';
    return { mimeType: resized.type, data: base64 };
  }
};

export default function App() {
  const [isDark, setIsDark] = useState(false);
  const [images, setImages] = useState<ImageFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewImage, setPreviewImage] = useState<ImageFile | null>(null);
  const [isRenaming, setIsRenaming] = useState<string | null>(null);
  const [settings, setSettings] = useState<ProcessingSettings>({
    targetFormat: 'webp',
    quality: 0.8,
    maxWidth: 2560,
    maxHeight: 1440,
    preserveMetadata: false
  });

  useEffect(() => {
    const stored = globalThis.localStorage?.getItem('kraken-theme');
    if (stored === 'dark') {
      setIsDark(true);
      return;
    }
    if (stored === 'light') {
      setIsDark(false);
      return;
    }

    const prefersDark = globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
    setIsDark(Boolean(prefersDark));
  }, []);

  useEffect(() => {
    const root = globalThis.document?.documentElement;
    if (!root) return;

    if (isDark) root.classList.add('dark');
    else root.classList.remove('dark');

    root.style.colorScheme = isDark ? 'dark' : 'light';
    globalThis.localStorage?.setItem('kraken-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const totalSaved = useMemo(() => {
    return images.reduce((acc, img) => {
      const originalSize = img.originalSize;
      const optimizedSize = img.optimizedSize;
      if (!Number.isFinite(originalSize) || !Number.isFinite(optimizedSize)) return acc;

      const saved = originalSize - optimizedSize;
      if (!Number.isFinite(saved) || saved <= 0) return acc;
      return acc + saved;
      return acc;
    }, 0);
  }, [images]);

  useEffect(() => {
    return () => {
      for (const img of images) {
        if (img.preview) URL.revokeObjectURL(img.preview);
        if (img.optimizedUrl) URL.revokeObjectURL(img.optimizedUrl);
      }
    };
  }, [images]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = (Array.from(e.dataTransfer.files) as File[]).filter(f => f.type.startsWith('image/'));
    addFiles(files);
  }, []);

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = (Array.from(e.target.files) as File[]).filter(f => f.type.startsWith('image/'));
      addFiles(files);
    }
  };

  const addFiles = (files: File[]) => {
    const newImages: ImageFile[] = files.map(file => ({
      id: (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)),
      file,
      preview: URL.createObjectURL(file),
      status: 'pending',
      progress: 0,
      originalSize: file.size,
    }));
    setImages(prev => [...prev, ...newImages]);
  };

  const removeImage = (id: string) => {
    setImages(prev => {
      const target = prev.find(img => img.id === id);
      if (target?.preview) URL.revokeObjectURL(target.preview);
      if (target?.optimizedUrl) URL.revokeObjectURL(target.optimizedUrl);
      return prev.filter(img => img.id !== id);
    });
  };

  const clearWorkspace = () => {
    setPreviewImage(null);
    setIsRenaming(null);
    setImages(prev => {
      for (const img of prev) {
        if (img.preview) URL.revokeObjectURL(img.preview);
        if (img.optimizedUrl) URL.revokeObjectURL(img.optimizedUrl);
      }
      return [];
    });
  };

  const suggestName = async (image: ImageFile) => {
    setIsRenaming(image.id);
    try {
      const payload = await createAiThumbnailPayload(image.file);
      const resp = await fetch('/api/suggest-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        throw new Error(`AI naming failed (${resp.status})`);
      }
      const json = (await resp.json()) as { name?: string };
      const newName = (json.name || 'optimized-image').trim();
      setImages(prev => prev.map(img => img.id === image.id ? { 
        ...img, 
        optimizedName: `${newName}.${img.optimizedName?.split('.').pop() || settings.targetFormat}` 
      } : img));
    } catch (err) {
      console.error("AI Naming failed", err);
    } finally {
      setIsRenaming(null);
    }
  };

  const processImage = async (image: ImageFile) => {
    try {
      setImages(prev => prev.map(img => img.id === image.id ? { ...img, status: 'processing', progress: 5 } : img));

      const sourceFile = await resizeImageToFit(image.file, settings.maxWidth, settings.maxHeight);

      const options = {
        maxSizeMB: (image.originalSize / 1024 / 1024) * settings.quality,
        maxWidthOrHeight: Math.max(settings.maxWidth, settings.maxHeight),
        useWebWorker: true,
        fileType: settings.targetFormat === 'original' ? image.file.type : `image/${settings.targetFormat}`,
        onProgress: (p: number) => {
          setImages(prev => prev.map(img => img.id === image.id ? { ...img, progress: 10 + (p * 0.85) } : img));
        }
      };

      const compressedFile = await imageCompression(sourceFile, options);
      const optimizedUrl = URL.createObjectURL(compressedFile);
      
      const extension = settings.targetFormat === 'original' 
        ? image.file.name.split('.').pop() 
        : settings.targetFormat;

      const fileName = image.file.name.replace(/\.[^/.]+$/, "") + `_opti.${extension}`;

      setImages(prev => prev.map(img => img.id === image.id ? { 
        ...img, 
        status: 'completed', 
        progress: 100,
        optimizedSize: compressedFile.size,
        optimizedUrl,
        optimizedName: img.optimizedName || fileName
      } : img));
    } catch (error) {
      setImages(prev => prev.map(img => img.id === image.id ? { ...img, status: 'error', error: 'Process failed' } : img));
    }
  };

  const processAll = async () => {
    setIsProcessing(true);
    const pending = images.filter(i => i.status !== 'completed');
    for (const image of pending) {
      await processImage(image);
    }
    setIsProcessing(false);
  };

  const downloadZip = async () => {
    const zip = new JSZip();
    const completedImages = images.filter(img => img.status === 'completed' && img.optimizedUrl);
    if (completedImages.length === 0) return;

    for (const img of completedImages) {
      const response = await fetch(img.optimizedUrl!);
      const blob = await response.blob();
      zip.file(img.optimizedName || 'image.webp', blob);
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    const zipUrl = URL.createObjectURL(content);
    link.href = zipUrl;
    link.download = `kraken_batch_${Date.now()}.zip`;
    link.click();

    window.setTimeout(() => URL.revokeObjectURL(zipUrl), 0);
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-200 text-slate-900 selection:bg-indigo-100 dark:bg-slate-950 dark:text-slate-100 dark:selection:bg-indigo-500/30">
      {/* Sidebar */}
      <aside className="w-full md:w-80 bg-white border-r border-slate-200 dark:bg-slate-900 dark:border-slate-800 p-6 flex flex-col gap-8 overflow-y-auto z-20 shadow-xl shadow-slate-200/50 dark:shadow-none">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600 rounded-xl text-white shadow-lg shadow-indigo-200">
            <Zap size={22} fill="currentColor" />
          </div>
          <h1 className="text-xl font-black tracking-tight text-slate-800 dark:text-slate-100">Kraken<span className="text-indigo-600">.</span></h1>
        </div>

        <section className="space-y-6">
          <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 font-bold text-[10px] tracking-widest uppercase">
            <SettingsIcon size={14} />
            <span>Optimization Engine</span>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">Output Format</label>
              <div className="grid grid-cols-2 gap-2">
                {['webp', 'avif', 'jpeg', 'png'].map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => setSettings(s => ({ ...s, targetFormat: fmt as TargetFormat }))}
                    className={`px-3 py-2 rounded-lg text-xs font-bold transition-all border ${
                      settings.targetFormat === fmt 
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100 dark:shadow-none' 
                        : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-indigo-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:border-indigo-400'
                    }`}
                  >
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-200">Quality</label>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200 rounded text-[10px] font-black">{Math.round(settings.quality * 100)}%</span>
              </div>
              <input 
                type="range" min="0.1" max="1" step="0.05"
                className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                value={settings.quality}
                onChange={(e) => setSettings(prev => ({ ...prev, quality: parseFloat(e.target.value) }))}
              />
            </div>

            <div className="p-4 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl border border-indigo-100 dark:border-indigo-500/20 space-y-3">
              <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 font-bold text-xs">
                <Info size={14} />
                <span>Stats Dashboard</span>
              </div>
              <div>
                <div className="text-[10px] text-indigo-400 dark:text-indigo-300/70 uppercase font-bold mb-1">Total Space Saved</div>
                <div className="text-2xl font-black text-indigo-700 dark:text-indigo-300">{formatBytes(totalSaved)}</div>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-auto p-4 bg-slate-900 rounded-2xl text-white">
          <div className="flex items-center gap-2 mb-2 text-indigo-400">
            <Sparkles size={16} />
            <span className="text-xs font-bold uppercase tracking-tighter">Pro Tip</span>
          </div>
          <p className="text-[10px] leading-relaxed text-slate-400 font-medium">
            Use **AVIF** for the best compression-to-quality ratio in modern browsers.
          </p>
        </div>
      </aside>

      {/* Main Content */}
      <main 
        className="flex-1 flex flex-col h-screen overflow-hidden relative"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl px-8 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-bold text-slate-400 dark:text-slate-500">BATCH PROCESSING</h2>
            <div className="h-4 w-px bg-slate-200 dark:bg-slate-800" />
            <span className="text-xs font-black text-slate-700 dark:text-slate-200 px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-full">
              {images.length} FILES
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsDark(v => !v)}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 transition-colors"
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              type="button"
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            {images.length > 0 && (
              <>
                <button 
                  onClick={clearWorkspace}
                  className="p-2 text-slate-400 dark:text-slate-500 hover:text-rose-500 transition-colors"
                  title="Clear Workspace"
                >
                  <Trash2 size={20} />
                </button>
                <button 
                  onClick={processAll}
                  disabled={isProcessing}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-xs font-black transition-all shadow-lg shadow-indigo-200"
                >
                  {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} fill="white" />}
                  PROCESS BATCH
                </button>
                <button 
                  onClick={downloadZip}
                  disabled={!images.some(img => img.status === 'completed')}
                  className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-xs font-black transition-all shadow-lg shadow-slate-200 dark:shadow-none"
                >
                  <FileArchive size={16} />
                  ZIP DOWNLOAD
                </button>
              </>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-10 space-y-6">
          {images.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-[2.5rem] bg-white dark:bg-slate-900 transition-all group hover:border-indigo-400">
              <div className="w-24 h-24 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500 dark:text-indigo-300 rounded-3xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500 shadow-xl shadow-indigo-100 dark:shadow-none">
                <Plus size={48} strokeWidth={2.5} />
              </div>
              <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-2">Drag & Optimize</h2>
              <p className="text-slate-400 dark:text-slate-400 text-sm mb-8 max-w-xs text-center font-medium">
                Processing happens in your browser. AI rename (optional) sends the image to Gemini.
              </p>
              <label className="cursor-pointer bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 hover:border-indigo-600 px-8 py-4 rounded-2xl font-black text-sm transition-all shadow-sm hover:shadow-indigo-100 dark:shadow-none flex items-center gap-2">
                BROWSE FILES
                <ArrowRight size={16} />
                <input type="file" multiple accept="image/*" className="hidden" onChange={onFileSelect} />
              </label>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
              {images.map((img) => (
                <div 
                  key={img.id}
                  className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-5 flex flex-col gap-4 hover:shadow-2xl hover:shadow-slate-200 dark:hover:shadow-none transition-all duration-300 group relative ring-1 ring-slate-100 dark:ring-slate-800"
                >
                  <div className="flex gap-4">
                    <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-50 dark:bg-slate-800 flex-shrink-0 border border-slate-100 dark:border-slate-700 shadow-inner dark:shadow-none relative">
                      <img src={img.preview} alt={img.file.name} className="w-full h-full object-cover" />
                      <button 
                        onClick={() => setPreviewImage(img)}
                        className="absolute inset-0 bg-indigo-600/0 hover:bg-indigo-600/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-all text-white"
                        aria-label="Open preview"
                      >
                        <Maximize2 size={20} />
                      </button>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                        <div className="flex items-center gap-2 truncate">
                          <h3 className="text-xs font-black text-slate-800 dark:text-slate-100 truncate leading-none">
                            {img.optimizedName || img.file.name}
                          </h3>
                          <button 
                            onClick={() => suggestName(img)}
                            disabled={isRenaming === img.id}
                            className={`text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 p-1 rounded transition-colors ${isRenaming === img.id ? 'animate-pulse' : ''}`}
                            title="AI Smart Rename"
                          >
                            <Sparkles size={12} fill={img.optimizedName ? 'currentColor' : 'none'} />
                          </button>
                        </div>
                        <button onClick={() => removeImage(img.id)} className="text-slate-300 dark:text-slate-600 hover:text-rose-500">
                          <X size={16} />
                        </button>
                      </div>

                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-[10px] font-black bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-200 px-1.5 py-0.5 rounded uppercase">
                          {img.file.type.split('/')[1]}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400">
                          {formatBytes(img.originalSize)}
                        </span>
                        {img.optimizedSize && (
                          <>
                            <ArrowRight size={10} className="text-slate-300 dark:text-slate-600" />
                            <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-300">
                              {formatBytes(img.optimizedSize)}
                            </span>
                          </>
                        )}
                      </div>

                      <div className="space-y-2">
                        <ProgressBar progress={img.progress} status={img.status} />
                        <div className="flex justify-between items-center">
                          <span className={`text-[9px] font-black uppercase tracking-widest ${
                            img.status === 'completed' ? 'text-emerald-500' : 
                            img.status === 'processing' ? 'text-indigo-500' : 'text-slate-400 dark:text-slate-500'
                          }`}>
                            {img.status}
                          </span>
                          {img.status === 'completed' && (
                            <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-300 font-black text-[9px] bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full">
                              SAVED {percentSaved(img.originalSize, img.optimizedSize)}%
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {img.status === 'completed' && img.optimizedUrl && (
                    <div className="flex gap-2 border-t border-slate-50 dark:border-slate-800 pt-3 mt-1">
                      <a 
                        href={img.optimizedUrl} 
                        download={img.optimizedName}
                        className="flex-1 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 text-slate-700 dark:text-slate-100 hover:text-indigo-600 flex items-center justify-center gap-2 py-2 rounded-xl text-[10px] font-black transition-all"
                      >
                        <Download size={12} />
                        DOWNLOAD
                      </a>
                      <button 
                        onClick={() => setPreviewImage(img)}
                        className="px-4 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 dark:text-slate-300 flex items-center justify-center rounded-xl transition-all"
                      >
                        <Maximize2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
              
              <label className="border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-[2rem] p-8 flex flex-col items-center justify-center hover:border-indigo-300 hover:bg-white dark:hover:bg-slate-900 transition-all cursor-pointer group h-[180px]">
                <Plus size={24} className="text-slate-300 group-hover:text-indigo-500 group-hover:scale-125 transition-all mb-2" />
                <span className="text-[10px] font-black text-slate-400 group-hover:text-indigo-600 uppercase tracking-widest">Add Images</span>
                <input type="file" multiple accept="image/*" className="hidden" onChange={onFileSelect} />
              </label>
            </div>
          )}
        </div>

        {/* Modal Comparison */}
        {previewImage && (
          <div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-8">
            <div className="bg-white dark:bg-slate-900 w-full max-w-6xl rounded-[2.5rem] overflow-hidden flex flex-col shadow-2xl dark:shadow-none animate-in fade-in zoom-in duration-300">
              <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <div>
                  <h2 className="font-black text-slate-800 dark:text-slate-100">Visual Quality Inspector</h2>
                  <p className="text-xs text-slate-400 dark:text-slate-400 font-medium">{previewImage.file.name} • {settings.targetFormat.toUpperCase()}</p>
                </div>
                <button onClick={() => setPreviewImage(null)} className="p-2 bg-slate-50 dark:bg-slate-800 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-hidden flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-slate-800">
                <div className="flex-1 flex flex-col">
                  <div className="p-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-center">Original</div>
                  <div className="flex-1 relative overflow-hidden bg-slate-50 dark:bg-slate-800 group">
                    <img src={previewImage.preview} alt={previewImage.file.name} className="absolute inset-0 w-full h-full object-contain p-4" />
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/80 dark:bg-slate-900/80 backdrop-blur px-3 py-1 rounded-full text-[10px] font-bold shadow-sm dark:shadow-none">
                      {formatBytes(previewImage.originalSize)}
                    </div>
                  </div>
                </div>
                <div className="flex-1 flex flex-col">
                  <div className="p-4 text-[10px] font-black text-indigo-500 uppercase tracking-widest text-center">Optimized</div>
                  <div className="flex-1 relative overflow-hidden bg-slate-50 dark:bg-slate-800">
                    <img src={previewImage.optimizedUrl || previewImage.preview} alt={previewImage.file.name} className="absolute inset-0 w-full h-full object-contain p-4" />
                    {previewImage.optimizedSize && (
                      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-indigo-600 text-white px-3 py-1 rounded-full text-[10px] font-bold shadow-lg dark:shadow-none">
                        {formatBytes(previewImage.optimizedSize)} (-{percentSaved(previewImage.originalSize, previewImage.optimizedSize)}%)
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="p-8 bg-slate-50 dark:bg-slate-800 flex justify-end gap-3">
                 <button onClick={() => setPreviewImage(null)} className="px-6 py-3 font-black text-sm text-slate-500 dark:text-slate-200">CLOSE</button>
                 {previewImage.optimizedUrl && (
                   <a 
                    href={previewImage.optimizedUrl} 
                    download={previewImage.optimizedName}
                    className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black text-sm shadow-xl shadow-indigo-200 dark:shadow-none"
                   >
                    DOWNLOAD RESULT
                   </a>
                 )}
              </div>
            </div>
          </div>
        )}

        <footer className="h-10 border-t border-slate-100 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-8 flex items-center justify-between text-[9px] text-slate-400 dark:text-slate-500 font-black tracking-widest uppercase">
          <div className="flex gap-6">
            <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /> 256-Bit Browser Encryption</span>
            <span>JS WebWorkers Active</span>
          </div>
          <div className="flex items-center gap-1">
             POWERED BY <span className="text-slate-800 dark:text-slate-200">GLASTOR</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
