import type { Backend } from '../config/models';

let cached: Promise<Backend> | null = null;

/** Detects the best available inference backend. Works on the main thread and in workers. */
export function detectBackend(): Promise<Backend> {
  cached ??= (async (): Promise<Backend> => {
    try {
      const gpu = (navigator as any).gpu;
      if (!gpu) return 'wasm';
      const adapter = await gpu.requestAdapter();
      if (!adapter) return 'wasm';
      return adapter.features?.has('shader-f16') ? 'webgpu-f16' : 'webgpu';
    } catch (e) {
      console.warn('Error checking WebGPU adapter:', e);
      return 'wasm';
    }
  })();
  return cached;
}
