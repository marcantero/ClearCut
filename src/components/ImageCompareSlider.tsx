import { useEffect, useRef, useState, KeyboardEvent } from 'react';

export type ImageCompareSliderProps = {
  originalSrc: string;
  processedSrc: string;
  /**
   * When this key changes, the slider animates from "abans" cap a "després",
   * visualitzant com es retira el fons.
   */
  animationKey?: string;
};

export function ImageCompareSlider({
  originalSrc,
  processedSrc,
  animationKey,
}: ImageCompareSliderProps) {
  const [position, setPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const frameIdRef = useRef<number | null>(null);

  const updatePosition = (value: number) => {
    const clamped = Math.min(100, Math.max(0, value));
    setPosition(clamped);
  };

  // Animación cuando llega un nuevo resultado
  useEffect(() => {
    if (!animationKey) return;

    if (frameIdRef.current) {
      cancelAnimationFrame(frameIdRef.current);
    }

    setPosition(5);
    const start = performance.now();
    const duration = 1200; // Un poco más rápido para mejor UX

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const value = 5 + eased * 45; // Anima hasta el centro (50%) en lugar de casi el final
      setPosition(value);

      if (t < 1) {
        frameIdRef.current = requestAnimationFrame(step);
      }
    };

    frameIdRef.current = requestAnimationFrame(step);

    return () => {
      if (frameIdRef.current) {
        cancelAnimationFrame(frameIdRef.current);
      }
    };
  }, [animationKey]);

  // Arrastre con eventos de puntero (ratón y táctil)
  useEffect(() => {
    if (!isDragging || !containerRef.current) return;

    const container = containerRef.current;

    const handleMove = (e: PointerEvent) => {
      // Evitar scroll táctil mientras se arrastra
      e.preventDefault(); 
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = (x / rect.width) * 100;
      updatePosition(percentage);
    };

    const handleUp = () => setIsDragging(false);

    document.addEventListener('pointermove', handleMove, { passive: false });
    document.addEventListener('pointerup', handleUp);
    document.addEventListener('pointercancel', handleUp);

    return () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
      document.removeEventListener('pointercancel', handleUp);
    };
  }, [isDragging]);

  // Soporte de accesibilidad (Teclado)
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') updatePosition(position - 5);
    if (e.key === 'ArrowRight') updatePosition(position + 5);
  };

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-4 transition-transform duration-500 ease-out">
      <div
        ref={containerRef}
        role="slider"
        aria-valuenow={position}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Comparación de imágenes antes y después"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="relative overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl cursor-col-resize select-none focus:outline-none focus:ring-2 focus:ring-cyan-400 group transition-transform duration-300 ease-out hover:scale-[1.01] hover:shadow-[0_22px_70px_rgba(15,23,42,0.95)]"
        onPointerDown={(e) => {
          // Permite hacer clic en cualquier parte para saltar a esa posición
          const rect = e.currentTarget.getBoundingClientRect();
          updatePosition(((e.clientX - rect.left) / rect.width) * 100);
          setIsDragging(true);
        }}
      >
        {/* Imagen Original (Fondo) */}
        <img
          src={originalSrc}
          alt="Original antes del proceso"
          className="block w-full h-auto object-contain pointer-events-none transition-transform duration-500 ease-out group-hover:scale-[1.01]"
          draggable={false}
        />

        {/* Imagen Procesada (Frente) con patrón de transparencia */}
        <div
          className="absolute inset-0 z-10"
          style={{
            backgroundImage:
              'linear-gradient(45deg, #e5e7eb 25%, transparent 25%, transparent 75%, #e5e7eb 75%), linear-gradient(45deg, #e5e7eb 25%, transparent 25%, transparent 75%, #e5e7eb 75%)',
            backgroundSize: '16px 16px',
            backgroundPosition: '0 0, 8px 8px',
            backgroundColor: '#f9fafb',
            clipPath: `inset(0 ${100 - position}% 0 0)`,
            // NOTA: Eliminada la transición CSS aquí para evitar "jank" al arrastrar
          }}
        >
          <img
            src={processedSrc}
            alt="Procesada después del proceso"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none transition-transform duration-500 ease-out group-hover:scale-[1.01]"
            draggable={false}
          />
        </div>

        <div
          className="absolute inset-y-0 z-20 flex items-center justify-center w-0.5 bg-white shadow-[0_0_10px_rgba(0,0,0,0.5)]"
          style={{ left: `${position}%` }}
        >
          <div className="absolute flex items-center justify-center w-8 h-8 md:w-10 md:h-10 bg-white rounded-full shadow-[0_4px_10px_rgba(0,0,0,0.3)] border border-slate-200 text-slate-600 transition-transform duration-200 ease-out group-hover:scale-110 group-active:scale-95">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m9 18-6-6 6-6" />
              <path d="m15 6 6 6-6 6" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}