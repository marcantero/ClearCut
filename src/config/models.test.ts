import { describe, expect, it } from 'vitest';
import { MODELS, getDownloadSizeMb, getDtypeCandidates, getModelConfig } from './models';

const model = (id: string) => {
  const config = getModelConfig(id);
  if (!config) throw new Error(`missing model ${id}`);
  return config;
};

describe('getDtypeCandidates', () => {
  it('prefers fp16 with fp32 fallback on WebGPU with shader-f16', () => {
    expect(getDtypeCandidates(model('briaai/RMBG-1.4'), 'webgpu-f16')).toEqual(['fp16', 'fp32']);
  });

  it('uses fp32 on WebGPU without f16 support', () => {
    expect(getDtypeCandidates(model('briaai/RMBG-1.4'), 'webgpu')).toEqual(['fp32']);
  });

  it('uses q8 on CPU, falling back to fp32', () => {
    expect(getDtypeCandidates(model('Xenova/modnet'), 'wasm')).toEqual(['q8', 'fp32']);
  });

  it('skips precisions a model does not ship (BiRefNet has no q8)', () => {
    expect(getDtypeCandidates(model('onnx-community/BiRefNet-ONNX'), 'wasm')).toEqual(['fp32']);
  });

  it('always offers at least one precision for every model and backend', () => {
    for (const m of MODELS) {
      for (const backend of ['webgpu-f16', 'webgpu', 'wasm'] as const) {
        expect(getDtypeCandidates(m, backend).length, `${m.id} on ${backend}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('getDownloadSizeMb', () => {
  it('reports the size of the first precision that will be tried', () => {
    expect(getDownloadSizeMb(model('briaai/RMBG-1.4'), 'webgpu-f16')).toBe(88);
    expect(getDownloadSizeMb(model('briaai/RMBG-1.4'), 'wasm')).toBe(44);
  });
});
