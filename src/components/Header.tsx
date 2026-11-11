import type { WorkerState } from '../hooks/useBackgroundWorker';

type HeaderProps = {
  isEditing: boolean;
  modelStatus: WorkerState['modelStatus'];
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
};

export function Header({ isEditing, modelStatus, theme, onToggleTheme }: HeaderProps) {
  return (
      <header
        className={`sticky top-0 z-30 flex items-center justify-between px-5 sm:px-8 transition-all duration-500 ease-out ${
          isEditing
            ? 'py-2.5 border-b border-slate-200 dark:border-white/[0.05] bg-white/80 dark:bg-[#060a10]/95 backdrop-blur-xl'
            : 'py-4 bg-transparent'
        }`}
      >
    <div className="flex items-center gap-3">
    {/* LOGO DEFINITIU */}
    <div className="relative flex h-8 w-8 items-center justify-center">
      <div 
        className="w-full h-full object-contain text-slate-900 dark:text-white transition-colors duration-300"
        dangerouslySetInnerHTML={{ 
        __html: `
          <svg viewBox="0 0 120 120" fill="currentColor">
          <rect x="20" y="20" width="60" height="60" rx="12" fill="currentColor" />
          <rect x="40" y="40" width="60" height="60" rx="12" fill="none" stroke="currentColor" stroke-width="8" />
          <rect x="0" y="56" width="120" height="8" fill="currentColor" transform="rotate(-45 60 60)" />
          </svg>
        ` 
        }}
      />
    </div>

    <div>
      <span className="text-sm font-semibold tracking-tight text-slate-900 dark:text-white">ClearCut</span>
      <span className="ml-2 hidden text-[11px] text-slate-500 sm:inline">Background remover</span>
    </div>
    </div>

        <div className="flex items-center gap-2.5">

          <span role="status" className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium sm:flex ${
            modelStatus === 'ready'
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/20'
              : modelStatus === 'error'
              ? 'bg-red-500/10 text-red-700 dark:text-red-300 ring-1 ring-red-500/20'
              : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/20'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${
              modelStatus === 'ready' ? 'bg-emerald-500 dark:bg-emerald-400' : modelStatus === 'error' ? 'bg-red-500 dark:bg-red-400' : 'bg-amber-500 dark:bg-amber-400 motion-safe:animate-pulse'
            }`} />
            {modelStatus === 'ready' ? 'On-device AI ready' : modelStatus === 'error' ? 'Model error' : modelStatus === 'loading' ? 'Loading AI…' : 'AI loads on first image'}
          </span>

          <button
            type="button"
            onClick={onToggleTheme}
            className="flex h-7 w-7 items-center justify-center rounded-full text-slate-600 dark:text-slate-400 ring-1 ring-slate-200 dark:ring-white/10 hover:bg-slate-200/60 dark:hover:bg-white/10 transition"
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
            )}
          </button>

          <a
            href="https://github.com/marcantero/ClearCut"
            target="_blank" rel="noreferrer"
            className="flex h-7 items-center gap-1.5 rounded-full px-3 text-[11px] font-medium text-slate-600 dark:text-slate-400 ring-1 ring-slate-200 dark:ring-white/10 transition hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-white/10"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/></svg>
            GitHub
          </a>
        </div>
      </header>
  );
}
