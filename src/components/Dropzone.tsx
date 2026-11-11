import { useEffect, useRef, useState, DragEvent, ChangeEvent, KeyboardEvent } from 'react';
import { sileo } from 'sileo';

export type DropzoneProps = {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
};

function notifyNotAnImage() {
  sileo.error({ title: 'Unsupported file', description: 'Please choose an image (PNG, JPG, WEBP).' });
}

export function Dropzone({ onFileSelected, disabled }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notifyNotAnImage();
      return;
    }
    onFileSelected(file);
  };

  // Paste an image from the clipboard (Ctrl/Cmd+V) anywhere on the page.
  const onFileSelectedRef = useRef(onFileSelected);
  onFileSelectedRef.current = onFileSelected;
  useEffect(() => {
    if (disabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length === 0) return;
      e.preventDefault();
      const image = files.find((f) => f.type.startsWith('image/'));
      if (image) onFileSelectedRef.current(image);
      else notifyNotAnImage();
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [disabled]);

  const onDragOver  = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); if (!disabled) setIsDragOver(true); };
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragOver(false); };
  const onDrop      = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;
    handleFile(e.dataTransfer?.files?.[0]);
  };
  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleFile(e.target.files?.[0]);
    // Allow selecting the same file again.
    e.target.value = '';
  };
  const openDialog = () => { if (!disabled) inputRef.current?.click(); };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openDialog();
    }
  };

  return (
    <div className="w-full">
      <input ref={inputRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onChange} />
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label="Upload an image: drop it here, paste it, or press Enter to browse"
        onClick={openDialog}
        onKeyDown={onKeyDown}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={[
          'group relative flex h-52 w-full flex-col items-center justify-center gap-4 rounded-xl border border-dashed transition-all duration-200',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#060a10]',
          disabled
            ? 'cursor-not-allowed border-slate-200 opacity-50 dark:border-white/[0.04]'
            : isDragOver
            ? 'cursor-pointer border-cyan-500/60 bg-cyan-50 ring-1 ring-cyan-500/20 dark:border-cyan-400/50 dark:bg-cyan-400/[0.04] dark:ring-cyan-400/20'
            : 'cursor-pointer border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100 dark:border-white/[0.07] dark:bg-white/[0.02] dark:hover:border-white/[0.12] dark:hover:bg-white/[0.03]',
        ].join(' ')}
      >
        {/* Upload icon */}
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border transition-all duration-200 ${
          isDragOver
            ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:border-cyan-400/30 dark:bg-cyan-400/10 dark:text-cyan-400'
            : 'border-slate-200 bg-white text-slate-500 group-hover:border-slate-300 group-hover:text-slate-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:group-hover:border-white/[0.14] dark:group-hover:text-slate-400'
        }`}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </div>

        <div className="text-center">
          <p className={`text-sm font-medium transition-colors ${
            isDragOver
              ? 'text-cyan-700 dark:text-cyan-300'
              : 'text-slate-700 group-hover:text-slate-900 dark:text-slate-300 dark:group-hover:text-slate-200'
          }`}>
            {isDragOver ? 'Drop to upload' : 'Drop an image here'}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            or click to browse · paste with Ctrl+V · PNG, JPG, WEBP
          </p>
        </div>
      </div>
    </div>
  );
}
