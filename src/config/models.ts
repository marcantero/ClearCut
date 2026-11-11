export type Dtype = 'fp32' | 'fp16' | 'q8';
export type Backend = 'webgpu' | 'webgpu-f16' | 'wasm';

export type ModelConfig = {
  id: string;
  name: string;
  description: string;
  /** Approximate ONNX download size in MB per available precision. */
  sizesMb: Partial<Record<Dtype, number>>;
};

export const MODELS: ModelConfig[] = [
  {
    id: 'briaai/RMBG-1.4',
    name: 'RMBG-1.4',
    description: 'State-of-the-art accuracy. Best for complex subjects and fine details.',
    sizesMb: { fp32: 176, fp16: 88, q8: 44 },
  },
  {
    id: 'onnx-community/BiRefNet-ONNX',
    name: 'BiRefNet',
    description: 'High fidelity edges and ultra-precise segmentation.',
    sizesMb: { fp32: 973, fp16: 490 },
  },
  {
    id: 'Xenova/modnet',
    name: 'MODNet',
    description: 'Lightweight, fast, and optimized for smooth performance.',
    sizesMb: { fp32: 26, fp16: 13, q8: 7 },
  },
];

export const DEFAULT_MODEL_ID = MODELS[0].id;

export const getModelConfig = (id: string) => MODELS.find((m) => m.id === id);

/**
 * Precisions to try, in order, for a model on a given backend.
 * - WebGPU with shader-f16: fp16 (half the download, same quality), fp32 as fallback.
 * - WebGPU without f16: fp32.
 * - WASM (CPU): q8 to keep the tab responsive; fp32 if the model has no q8 build.
 */
export function getDtypeCandidates(model: ModelConfig, backend: Backend): Dtype[] {
  const preferred: Dtype[] =
    backend === 'webgpu-f16' ? ['fp16', 'fp32'] : backend === 'webgpu' ? ['fp32'] : ['q8', 'fp32'];
  return preferred.filter((d) => model.sizesMb[d] !== undefined);
}

export function getDownloadSizeMb(model: ModelConfig, backend: Backend): number | undefined {
  const [first] = getDtypeCandidates(model, backend);
  return first ? model.sizesMb[first] : undefined;
}
