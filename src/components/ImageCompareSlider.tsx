import { useState } from 'react';

export type ImageCompareSliderProps = {
  originalSrc: string;
  processedSrc: string;
};

export function ImageCompareSlider({
  originalSrc,
  processedSrc,
}: ImageCompareSliderProps) {
  const [position, setPosition] = useState(50);

  const onChange = (value: number) => {
    if (Number.isNaN(value)) return;
    setPosition(Math.min(100, Math.max(0, value)));
  };

  return (
    <div className="relative w-full max-w-2xl mx-auto select-none">
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        <img
          src={originalSrc}
          alt="Original"
          className="block w-full h-auto object-contain"
          draggable={false}
        />
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden"
          style={{ width: `${position}%` }}
        >
          <img
            src={processedSrc}
            alt="Sense fons"
            className="block w-full h-auto object-contain"
            draggable={false}
          />
        </div>
        <div
          className="pointer-events-none absolute inset-y-0 flex items-center"
          style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
        >
          <div className="h-40 w-px bg-white/60 shadow-[0_0_12px_rgba(0,0,0,0.6)]" />
          <div className="ml-2 rounded-full bg-slate-900/80 border border-slate-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-100">
            Before / After
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3 text-xs text-slate-400">
        <span>Abans</span>
        <input
          type="range"
          min={0}
          max={100}
          value={position}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-brand-500"
        />
        <span>Després</span>
      </div>
    </div>
  );
}
