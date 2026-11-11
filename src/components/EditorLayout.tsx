import { MaskEditorOverlay } from './MaskEditorOverlay';

type EditorLayoutProps = {
  originalImageData: ImageData;
  aiResultImageData: ImageData;
  onRefined: (refined: ImageData) => void;
  onDownload: () => void;
  onExit: () => void;
};

export function EditorLayout({
  originalImageData,
  aiResultImageData,
  onRefined,
  onDownload,
  onExit,
}: EditorLayoutProps) {
  return (
    <div className="flex h-[calc(100vh-60px)] w-full flex-col overflow-hidden lg:flex-row">
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-slate-100 dark:bg-[#04070d] lg:border-r border-slate-200 dark:border-white/[0.06] transition-colors duration-300">
        <MaskEditorOverlay originalImageData={originalImageData} aiResultImageData={aiResultImageData} onRefined={onRefined} />
      </div>

      <aside className="flex w-full flex-col gap-5 overflow-y-auto border-t border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#080c14] px-5 py-5 lg:w-72 lg:border-t-0 xl:w-80">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500">Editing</p>
          <h2 className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">Refine edges</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            Paint over areas where the AI missed. Restore brings back removed pixels, Erase removes extra background.
          </p>
        </div>

        <div className="h-px bg-slate-100 dark:bg-white/[0.06]" />

        <div className="space-y-2.5">
          <p className="text-[10px] font-medium uppercase tracking-widest text-slate-400 dark:text-slate-600">Tips</p>
          {[
            { icon: '⚡', text: 'Smart brush auto-selects by colour similarity' },
            { icon: '🎯', text: 'Lower tolerance = more precise edges' },
            { icon: '↕', text: 'Adjust brush size for fine vs. broad strokes' },
          ].map(({ icon, text }) => (
            <div key={text} className="flex items-start gap-2.5">
              <span className="mt-px text-sm leading-none">{icon}</span>
              <p className="text-[11px] leading-relaxed text-slate-500">{text}</p>
            </div>
          ))}
        </div>

        <div className="h-px bg-slate-100 dark:bg-white/[0.06]" />

        <div className="mt-auto flex flex-col gap-2.5">
          <button type="button" onClick={onDownload} className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 active:scale-[0.98] disabled:opacity-40">
            Download PNG
          </button>
          <button type="button" onClick={onExit} className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 ring-1 ring-slate-200 dark:ring-white/10 hover:bg-slate-100 dark:hover:bg-white/5 transition">
            ← Back to preview
          </button>
        </div>
      </aside>
    </div>
  );
}
