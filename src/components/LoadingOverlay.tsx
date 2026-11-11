import { useEffect } from 'react';

type LoadingOverlayProps = {
  /** Download progress, 0–100. */
  progress?: number;
  phase?: string;
  onCancel: () => void;
};

const RING_RADIUS = 36;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function LoadingOverlay({ progress, phase, onCancel }: LoadingOverlayProps) {
  const value = Math.max(0, Math.min(100, progress ?? 0));

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 px-4 backdrop-blur-md dark:bg-[#060a10]/80">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="loading-overlay-title"
        aria-describedby="loading-overlay-phase"
        className="flex w-full max-w-sm flex-col items-center justify-center space-y-6 rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-2xl motion-safe:animate-[fade-in_300ms_ease-out_forwards] dark:border-white/10 dark:bg-slate-900/50 dark:shadow-[0_0_80px_rgba(34,211,238,0.12)]"
      >
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={value}
          aria-label="Model download progress"
          className="relative flex h-20 w-20 items-center justify-center"
        >
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 80 80" aria-hidden="true">
            <circle cx="40" cy="40" r={RING_RADIUS} fill="none" strokeWidth="6" className="stroke-slate-100 dark:stroke-slate-800" />
            <circle
              cx="40"
              cy="40"
              r={RING_RADIUS}
              fill="none"
              strokeWidth="6"
              strokeLinecap="round"
              className="stroke-cyan-500 transition-[stroke-dashoffset] duration-300 ease-out"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - value / 100)}
            />
          </svg>
          <span className="text-xl font-bold text-slate-900 dark:text-white">
            {value}<span className="text-sm opacity-60">%</span>
          </span>
        </div>

        <div className="space-y-2">
          <h3 id="loading-overlay-title" className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            Loading AI Model
          </h3>
          <p id="loading-overlay-phase" className="break-words text-sm font-medium text-slate-500 dark:text-slate-400">
            {phase || 'Downloading weights...'}
          </p>
          <p className="text-[11px] text-slate-500 opacity-80">
            This only happens once. The model runs 100% on-device.
          </p>
        </div>

        <button
          type="button"
          onClick={onCancel}
          autoFocus
          className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:text-slate-300 dark:ring-white/10 dark:hover:bg-white/5"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
