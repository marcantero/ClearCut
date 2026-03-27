export type ModelStatus = 'idle' | 'loading' | 'ready' | 'error';

export type ModelStatusBannerProps = {
  status: ModelStatus;
  message?: string;
};

export function ModelStatusBanner({ status, message }: ModelStatusBannerProps) {
  if (status === 'idle') return null;

  const isError = status === 'error';
  const isLoading = status === 'loading';

  const label = isError
    ? 'Error carregant el model d\'IA'
    : isLoading
    ? 'Inicialitzant el model d\'IA al navegador'
    : 'Model d\'IA llest';

  const description =
    message ??
    (isError
      ? 'Recarrega la pàgina o torna-ho a provar més tard.'
      : isLoading
      ? 'La primera vegada pot trigar una mica mentre es descarrega el model.'
      : 'El model està carregat al teu navegador. La teva imatge no surt del dispositiu.');

  return (
    <div
      className={[
        'mb-6 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm',
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
      </div>
    </div>
  );
}
