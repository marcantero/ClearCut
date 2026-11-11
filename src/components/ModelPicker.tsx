import { MODELS, getDownloadSizeMb, getModelConfig, type Backend } from '../config/models';

type ModelPickerProps = {
  selectedModel: string;
  /** Model that produced the current result, if any. */
  resultModelId: string | null;
  /** Detected inference backend; null while detecting. */
  backend: Backend | null;
  isProcessing: boolean;
  canReprocess: boolean;
  onSelect: (modelId: string) => void;
  onReprocess: () => void;
};

export function ModelPicker({
  selectedModel,
  resultModelId,
  backend,
  isProcessing,
  canReprocess,
  onSelect,
  onReprocess,
}: ModelPickerProps) {
  const selectedConfig = getModelConfig(selectedModel);
  const selectedSizeMb = selectedConfig && backend ? getDownloadSizeMb(selectedConfig, backend) : undefined;

  return (
    <div className="flex flex-col gap-3">
      <label className="text-sm font-semibold text-slate-900 dark:text-white">Select AI Model</label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {MODELS.map(model => (
          <button
            key={model.id}
            onClick={() => onSelect(model.id)}
            disabled={isProcessing}
            className={`flex flex-col text-left p-3.5 rounded-xl border transition-all ${
              selectedModel === model.id 
                ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-500/10 ring-1 ring-cyan-500 shadow-sm' 
                : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 bg-white dark:bg-white/[0.02]'
            } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span className={`text-sm font-semibold ${selectedModel === model.id ? 'text-cyan-700 dark:text-cyan-400' : 'text-slate-900 dark:text-white'}`}>{model.name}</span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{model.description}</span>
            {backend && getDownloadSizeMb(model, backend) !== undefined && (
              <span className="mt-2 text-[10px] font-medium text-slate-400 dark:text-slate-500">
                ~{getDownloadSizeMb(model, backend)} MB download · {backend === 'wasm' ? 'CPU' : 'GPU'}
              </span>
            )}
          </button>
        ))}
      </div>
      {canReprocess && selectedConfig && (
        <button
          type="button"
          onClick={onReprocess}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 active:scale-[0.98]"
        >
          {resultModelId ? `Re-process with ${selectedConfig.name}` : `Remove background with ${selectedConfig.name}`}
          {selectedSizeMb !== undefined && (
            <span className="text-[11px] font-medium opacity-70">(~{selectedSizeMb} MB if not cached)</span>
          )}
        </button>
      )}
    </div>
  );
}
