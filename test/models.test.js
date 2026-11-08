import { describe, it, expect } from 'vitest';
import { CATALOG, modelsFor, defaultModel, ggufFiles } from '../src/models.js';

describe('model catalog', () => {
  it('has unique ids and every model has a GGUF file', () => {
    expect(new Set(CATALOG.map((m) => m.id)).size).toBe(CATALOG.length);
    for (const m of CATALOG) expect(m.gguf?.file, m.id).toMatch(/\.gguf$/);
  });
  it('has a default, a vision model with mmproj, and valid HF urls', () => {
    const list = modelsFor();
    expect(defaultModel(list).id).toBe('euler');
    const vision = list.find((m) => m.vision);
    expect(ggufFiles(vision).map((f) => f.name)).toHaveLength(2);
    for (const m of list) for (const f of ggufFiles(m)) expect(f.url).toMatch(/^https:\/\/huggingface\.co\/[^/]+\/[^/]+\/resolve\/main\/[^/]+\.gguf\?download=true$/);
  });
});
