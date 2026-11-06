import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { prebuiltAppConfig } from '@mlc-ai/web-llm';
import { MODELS } from '../src/models.js';

describe('models', () => {
  it('every model exists in the WebLLM prebuilt list', () => {
    const ids = new Set(prebuiltAppConfig.model_list.map((m) => m.model_id));
    for (const m of MODELS) expect(ids.has(m.id), m.id).toBe(true);
  });
  it('bundled wasm exists for every phone-ready model', () => {
    const phone = MODELS.filter((m) => m.iosOk);
    expect(phone.length).toBeGreaterThan(0);
    for (const m of phone) {
      const lib = prebuiltAppConfig.model_list.find((x) => x.model_id === m.id).model_lib.split('/').pop();
      expect(existsSync(`public/wasm/${lib}`), lib).toBe(true);
    }
  });
  it('has friendly names and the default is the 1.7B model', () => {
    for (const m of MODELS) expect(m.name && m.label.includes(m.base)).toBeTruthy();
    expect(MODELS[0].id).toContain('1.7B');
  });
});
