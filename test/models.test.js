import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { prebuiltAppConfig } from '@mlc-ai/web-llm';
import { CATALOG, modelsFor, defaultModel, ggufFiles } from '../src/models.js';

describe('model catalog', () => {
  it('has unique ids and every model runs somewhere', () => {
    expect(new Set(CATALOG.map((m) => m.id)).size).toBe(CATALOG.length);
    for (const m of CATALOG) expect(m.gguf || m.mlc, m.id).toBeTruthy();
  });
  it('web models exist in the WebLLM prebuilt list', () => {
    const ids = new Set(prebuiltAppConfig.model_list.map((m) => m.model_id));
    for (const m of CATALOG.filter((x) => x.mlc)) expect(ids.has(m.mlc), m.mlc).toBe(true);
  });
  it('bundled wasm exists for every model allowed on iOS web', () => {
    for (const m of CATALOG.filter((x) => x.mlc && x.mlcIos)) {
      const lib = prebuiltAppConfig.model_list.find((x) => x.model_id === m.mlc).model_lib.split('/').pop();
      expect(existsSync(`public/wasm/${lib}`), lib).toBe(true);
    }
  });
  it('native list has a default, a vision model with mmproj, and valid HF urls', () => {
    const native = modelsFor('native');
    expect(defaultModel(native).id).toBe('euler');
    const vision = native.find((m) => m.vision);
    expect(ggufFiles(vision).map((f) => f.name)).toHaveLength(2);
    for (const m of native) for (const f of ggufFiles(m)) expect(f.url).toMatch(/^https:\/\/huggingface\.co\/[^/]+\/[^/]+\/resolve\/main\/[^/]+\.gguf\?download=true$/);
  });
  it('iOS web list hides models that crash the WebView', () => {
    expect(modelsFor('web', true).map((m) => m.id)).not.toContain('euler-plus');
    expect(modelsFor('web', false).map((m) => m.id)).toContain('euler-pro');
  });
});
