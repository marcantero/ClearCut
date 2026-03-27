export type ModelStatus = 'idle' | 'loading' | 'ready' | 'error';

export type ModelStatusBannerProps = {
  status: ModelStatus;
  message?: string;
  /**
   * Percentatge aproximat de descarrega del model (0-100).
   * Només es mostra quan l'estat és `loading`.
   */
  progress?: number;
  /**
   * Fase opcional del procés de càrrega (p.ex. "Downloading", "Optimizing").
   */
  phase?: string;
};

export function ModelStatusBanner({ status, message, progress, phase }: ModelStatusBannerProps) {
  if (status === 'idle') return null;

  const isError = status === 'error';
  const isLoading = status === 'loading';

  const label = isError
    ? 'Error loading the AI model'
    : isLoading
    ? 'Initializing the AI model in your browser'
    : 'AI model ready';

  const description =
    message ??
    (isError
      ? 'Reload the page or try again later.'
      : isLoading
      ? 'The first time may take a bit while the model downloads. Keep this tab open; you will see the bar progress to 100%.'
      : 'The model is loaded in your browser. Your image never leaves your device.');

  const clampedProgress =
    typeof progress === 'number' && progress >= 0
      ? Math.max(0, Math.min(100, progress))
      : undefined;

  const barWidth = clampedProgress != null ? `${Math.max(5, clampedProgress)}%` : '40%';

  const progressLabelBase = phase?.trim().length
    ? phase
    : 'Downloading AI model';

  return (
    <div
      className={[
        'mb-6 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm transition-transform duration-300 ease-out translate-y-0 animate-[fade-in_220ms_ease-out_forwards]',
        isError
          ? 'border-red-500/40 bg-red-500/10 text-red-100'
          : isLoading
            ? 'border-amber-500/40 bg-amber-500/10 text-amber-100'
            : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100',
      ].join(' ')}
    >
      <div className="mt-0.5 text-base">
        {isError ? '⚠️' : isLoading ? '⏳' : '✨'}
      </div>
      <div>
        <p className="font-medium">{label}</p>
        <p className="mt-0.5 text-xs opacity-80">{description}</p>
        {isLoading && (
          <div className="mt-2 flex flex-col gap-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-emerald-300 transition-[width] duration-300 ease-out shadow-[0_0_12px_rgba(56,189,248,0.65)] animate-pulse"
                style={{ width: barWidth }}
              />
            </div>
            <p className="text-[10px] uppercase tracking-wide text-amber-100/80">
              {progressLabelBase}
              {clampedProgress != null ? ` · ${Math.round(clampedProgress)}%` : '…'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
