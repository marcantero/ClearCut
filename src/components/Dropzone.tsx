import { useRef, useState, DragEvent, ChangeEvent } from 'react';

export type DropzoneProps = {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
};

export function Dropzone({ onFileSelected, disabled }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith('image/')) return;
    onFileSelected(file);
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) return;
    setIsDragOver(true);
  };

  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) return;
    setIsDragOver(false);
    handleFiles(event.dataTransfer?.files ?? null);
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFiles(event.target.files);
  };

  const openFileDialog = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  return (
    <div className="w-full">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onChange}
      />
      <div
        onClick={openFileDialog}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={[
          'group relative flex flex-col items-center justify-center w-full h-64 cursor-pointer rounded-2xl border border-dashed transition-all duration-300 ease-out',
          'bg-slate-950/70 backdrop-blur-md shadow-[0_18px_60px_rgba(15,23,42,0.9)]',
          disabled
            ? 'border-slate-800/70 cursor-not-allowed opacity-60'
            : isDragOver
            ? 'border-brand-500/80 bg-slate-900/90 outline outline-2 outline-brand-500/40 scale-[1.01]'
            : 'border-slate-700/70 hover:border-brand-500/70 hover:bg-slate-900/90 hover:scale-[1.01] hover:shadow-[0_22px_70px_rgba(15,23,42,0.95)]',
        ].join(' ')}
      >
        <div className="pointer-events-none absolute inset-0 opacity-50 mix-blend-screen">
          <div className="absolute -inset-24 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.35),transparent_60%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.95),transparent_60%)]" />
        </div>
        <div className="relative flex flex-col items-center gap-3 text-center px-6">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950/90 border border-slate-700/80 shadow-[0_0_0_1px_rgba(15,23,42,0.95)]">
            <span className="text-lg transition-transform duration-300 ease-out group-hover:translate-y-0.5 group-hover:scale-105">
              ⬆️
            </span>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-50 transition-colors duration-300 ease-out group-hover:text-slate-100">
              Drop an image or click to upload
            </p>
            <p className="mt-1 text-xs text-slate-400 transition-colors duration-300 ease-out group-hover:text-slate-300">
              PNG, JPG, WEBP
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
