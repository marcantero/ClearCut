type LoadingOverlayProps = {
  /** Download progress, 0–100. */
  progress?: number;
  phase?: string;
};

export function LoadingOverlay({ progress, phase }: LoadingOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 dark:bg-[#060a10]/80 backdrop-blur-md transition-all duration-500">
      <div className="flex w-full max-w-sm flex-col items-center justify-center space-y-6 rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/50 p-8 shadow-2xl dark:shadow-[0_0_80px_rgba(248,113,113,0.15)] text-center animate-[fade-in_300ms_ease-out_forwards]">

        <div className="relative flex h-20 w-20 items-center justify-center">
          <div className="absolute inset-0 rounded-full border-4 border-slate-100 dark:border-slate-800" />
          <div 
            className="absolute inset-0 rounded-full border-4 border-transparent border-t-cyan-500 border-r-cyan-500 animate-spin transition-all duration-300"
            style={{ transform: `rotate(${(progress || 0) * 3.6}deg)` }}
          />
          <span className="text-xl font-bold text-slate-900 dark:text-white">
            {progress || 0}<span className="text-sm opacity-60">%</span>
          </span>
        </div>

        <div className="space-y-2">
          <h3 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            Loading AI Model
          </h3>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {phase || 'Downloading weights...'}
          </p>
          <p className="text-[11px] opacity-60">
            This only happens once. The model runs 100% on-device.
          </p>
        </div>

        <div className="w-full h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div 
            className="h-full bg-gradient-to-r from-cyan-500 to-teal-400 transition-all duration-300 ease-out"
            style={{ width: `${progress || 0}%` }}
          />
        </div>
      </div>
    </div>
  );
}
