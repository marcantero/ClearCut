import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { sileo } from 'sileo';
import {
  BLUR_DEFAULT,
  BLUR_MAX,
  BLUR_MIN,
  TRANSPARENT,
  type Background,
} from '../lib/background';

const SWATCHES = ['#ffffff', '#f1f5f9', '#0f172a', '#000000', '#22d3ee', '#fde68a', '#fecdd3', '#bbf7d0'];

type BackgroundPickerProps = {
  value: Background;
  onChange: (background: Background) => void;
};

export function BackgroundPicker({ value, onChange }: BackgroundPickerProps) {
  // Remember each option's last settings so switching tabs doesn't lose them.
  const [color, setColor] = useState('#ffffff');
  const [strength, setStrength] = useState(BLUR_DEFAULT);
  const [image, setImage] = useState<{ image: ImageBitmap; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const pickColor = (c: string) => {
    setColor(c);
    onChange({ kind: 'color', color: c });
  };

  const onImageFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      sileo.error({ title: 'Unsupported file', description: 'Please choose an image (PNG, JPG, WEBP).' });
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const next = { image: bitmap, name: file.name };
      setImage(next);
      onChange({ kind: 'image', ...next });
    } catch {
      sileo.error({ title: 'File error', description: 'Could not load that image.' });
    }
  };

  const selectImageTab = () => {
    if (image) onChange({ kind: 'image', ...image });
    else fileInputRef.current?.click();
  };

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/[0.07] dark:bg-white/[0.03] dark:shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id="background-label" className="text-xs font-medium text-slate-800 dark:text-slate-200">Background</p>
        <div role="group" aria-labelledby="background-label" className="flex items-center gap-0.5 rounded-lg border border-slate-200/80 bg-slate-100 p-0.5 dark:border-white/[0.06] dark:bg-black/20">
          <Tab active={value.kind === 'transparent'} onClick={() => onChange(TRANSPARENT)}>None</Tab>
          <Tab active={value.kind === 'color'} onClick={() => onChange({ kind: 'color', color })}>Colour</Tab>
          <Tab active={value.kind === 'blur'} onClick={() => onChange({ kind: 'blur', strength })}>Blur</Tab>
          <Tab active={value.kind === 'image'} onClick={selectImageTab}>Image</Tab>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onImageFile} />

      {value.kind === 'color' && (
        <div className="flex flex-wrap items-center gap-2">
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => pickColor(c)}
              aria-label={`Colour ${c}`}
              aria-pressed={value.color.toLowerCase() === c}
              title={c}
              className={`h-7 w-7 rounded-full ring-1 ring-slate-300 transition dark:ring-white/20 ${
                value.color.toLowerCase() === c ? 'ring-2 ring-cyan-500 ring-offset-2 ring-offset-white dark:ring-cyan-400 dark:ring-offset-[#0b1018]' : 'hover:scale-110'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
          <label className="ml-1 flex cursor-pointer items-center gap-2 text-[11px] text-slate-500">
            <input
              type="color"
              value={value.color}
              onChange={(e) => pickColor(e.target.value)}
              className="h-7 w-9 cursor-pointer rounded border border-slate-200 bg-transparent p-0.5 dark:border-white/10"
            />
            Custom
          </label>
        </div>
      )}

      {value.kind === 'blur' && (
        <label className="flex items-center gap-3 text-[11px] text-slate-500">
          <span className="w-14">Strength</span>
          <input
            type="range"
            min={BLUR_MIN}
            max={BLUR_MAX}
            step={0.5}
            value={value.strength}
            onChange={(e) => {
              const s = Number(e.target.value);
              setStrength(s);
              onChange({ kind: 'blur', strength: s });
            }}
            className="flex-1 accent-cyan-500"
          />
          <span className="w-8 text-right tabular-nums">{value.strength}</span>
        </label>
      )}

      {value.kind === 'image' && (
        <div className="flex items-center justify-between gap-3 text-[11px] text-slate-500">
          <span className="min-w-0 truncate">{value.name}</span>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 rounded-lg px-2.5 py-1.5 font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-100 dark:text-slate-300 dark:ring-white/10 dark:hover:bg-white/5"
          >
            Change image…
          </button>
        </div>
      )}
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
        active
          ? 'bg-white text-cyan-700 shadow-sm ring-1 ring-slate-200/80 dark:bg-cyan-500/20 dark:text-cyan-300 dark:shadow-none dark:ring-0'
          : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
      }`}
    >
      {children}
    </button>
  );
}
