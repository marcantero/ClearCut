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
          'relative flex flex-col items-center justify-center w-full h-64 cursor-pointer rounded-2xl border-2 border-dashed transition-colors',
          disabled
            ? 'border-slate-700 bg-slate-900/60 cursor-not-allowed'
            : isDragOver
            ? 'border-brand-500 bg-brand-500/10'
            : 'border-slate-700 bg-slate-900/40 hover:border-brand-500/80',
        ].join(' ')}
      >
        <div className="flex flex-col items-center gap-3 text-center px-6">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-900/80 border border-slate-700">
            <span className="text-xl">⬆️</span>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-50">
              Arrossega una imatge aquí o fes clic per seleccionar
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Formats suportats: PNG, JPG, JPEG, WEBP. Mida recomanada fins a 8MB.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
