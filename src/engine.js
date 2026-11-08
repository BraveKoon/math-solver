import { Capacitor, registerPlugin } from '@capacitor/core';
import { ggufFiles, IS_IOS } from './models.js';

/*
 공통 인터페이스
   status(models)            -> { [id]: { downloaded, downloading } }
   download(model, onProg)   -> 내려받기(onProg: 0~1)
   cancel(model), remove(model)
   load(model, onProg)       -> 메모리에 올리기
   generate(opts, onToken)   -> 종료 사유. opts: { model, messages, images, temperature, maxTokens, thinking }
   stop()
*/

const Llama = registerPlugin('Llama');
export const nativeAvailable = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Llama');
export const hasWebGPU = () => typeof navigator !== 'undefined' && !!navigator.gpu;

/** Qwen3 하이브리드 모델은 사용자 메시지 끝의 /no_think 로 생각 단계를 끈다. */
function withThinking(messages, model, thinking) {
  if (model.thinking !== 'toggle' || thinking) return messages;
  const out = messages.map((m) => ({ ...m }));
  const last = out.findLastIndex((m) => m.role === 'user');
  if (last >= 0) out[last].content += ' /no_think';
  return out;
}

// ---------------------------------------------------------------- iPhone: llama.cpp
export class NativeEngine {
  kind = 'native';
  supportsImages = true;

  async status(models) {
    const r = await Llama.status({ ids: models.map((m) => m.id) });
    this.freeBytes = r.freeBytes;
    return r.models;
  }

  async download(model, onProgress) {
    const files = ggufFiles(model);
    const sub = await Llama.addListener('downloadProgress', (e) => {
      if (e.id !== model.id) return;
      const part = e.total > 0 ? e.received / e.total : 0;
      onProgress?.((e.fileIndex + part) / e.fileCount);
    });
    try {
      await Llama.download({ id: model.id, urls: files.map((f) => f.url), names: files.map((f) => f.name) });
    } finally {
      sub.remove();
    }
  }

  cancel(model) { return Llama.cancelDownload({ id: model.id }); }
  remove(model) { return Llama.deleteModel({ id: model.id }); }

  async load(model) {
    const r = await Llama.load({ id: model.id, file: model.gguf.file, mmproj: model.gguf.mmproj, nCtx: model.nCtx ?? 4096 });
    this.vision = r.vision;
  }

  async generate({ model, messages, images = [], temperature, maxTokens, thinking }, onToken) {
    const sub = await Llama.addListener('token', (e) => onToken(e.text));
    try {
      const r = await Llama.generate({
        messages: withThinking(messages, model, thinking),
        images: images.map((d) => d.replace(/^data:[^,]+,/, '')),
        temperature, maxTokens,
      });
      return r.stopReason;
    } finally {
      sub.remove();
    }
  }

  stop() { return Llama.stop(); }
}

// ---------------------------------------------------------------- 웹/PWA: WebLLM
// 모델 실행 라이브러리(wasm)를 앱에 번들(public/wasm)해서 첫 실행에도 GitHub 접속이 필요 없게 함.
const BUNDLED_LIBS = [
  'Qwen3-0.6B-q4f16_1-MLC', 'Qwen3-1.7B-q4f16_1-MLC', 'Qwen3-4B-q4f16_1-MLC', 'Qwen2.5-Math-1.5B-Instruct-q4f16_1-MLC',
];

export class WebEngine {
  kind = 'web';
  supportsImages = false;

  async lib() {
    if (!this._lib) this._lib = await import('@mlc-ai/web-llm');
    return this._lib;
  }

  async appConfig() {
    const { prebuiltAppConfig } = await this.lib();
    const model_list = prebuiltAppConfig.model_list.map((m) => {
      if (!BUNDLED_LIBS.includes(m.model_id)) return m;
      const file = m.model_lib.split('/').pop();
      return { ...m, model_lib: new URL(`wasm/${file}`, document.baseURI).href };
    });
    return { ...prebuiltAppConfig, model_list, useIndexedDBCache: false };
  }

  async status(models) {
    const { hasModelInCache } = await this.lib();
    const cfg = await this.appConfig();
    const out = {};
    for (const m of models) {
      let downloaded = false;
      try { downloaded = await hasModelInCache(m.mlc, cfg); } catch {}
      out[m.id] = { downloaded, downloading: false };
    }
    return out;
  }

  // WebLLM은 불러오면서 내려받는다.
  download(model, onProgress) { return this.load(model, onProgress); }
  cancel() {}

  async remove(model) {
    const { deleteModelAllInfoInCache } = await this.lib();
    if (this.loadedId === model.id) { await this.engine?.unload(); this.engine = null; this.loadedId = null; }
    await deleteModelAllInfoInCache(model.mlc, await this.appConfig());
  }

  async load(model, onProgress) {
    if (!hasWebGPU()) throw new Error('이 브라우저는 WebGPU를 지원하지 않습니다. iPhone은 iOS 26 이상, PC/안드로이드는 최신 Chrome이 필요합니다.');
    if (this.loadedId === model.id) return;
    const { CreateMLCEngine } = await this.lib();
    await this.engine?.unload?.();
    this.engine = await CreateMLCEngine(
      model.mlc,
      { appConfig: await this.appConfig(), initProgressCallback: (p) => onProgress?.(p.progress ?? 0, p.text) },
      IS_IOS ? { context_window_size: 4096 } : undefined,
    );
    this.loadedId = model.id;
  }

  async generate({ messages, images = [], temperature, maxTokens, thinking }, onToken) {
    if (images.length) throw new Error('웹 버전은 이미지를 읽을 수 없습니다. iPhone 앱의 오일러 비전을 사용하세요.');
    const chunks = await this.engine.chat.completions.create({
      messages, stream: true, temperature, max_tokens: maxTokens,
      extra_body: { enable_thinking: !!thinking },
    });
    let reason = 'eos';
    for await (const c of chunks) {
      const t = c.choices[0]?.delta?.content;
      if (t) onToken(t);
      if (c.choices[0]?.finish_reason) reason = c.choices[0].finish_reason;
    }
    return reason;
  }

  stop() { this.engine?.interruptGenerate(); }
}

// ---------------------------------------------------------------- 개발용 가짜 엔진 (?mock)
export class MockEngine {
  kind = 'mock';
  supportsImages = true;
  state = { 'euler-mini': true, euler: true };

  async status(models) {
    return Object.fromEntries(models.map((m) => [m.id, { downloaded: !!this.state[m.id], downloading: false }]));
  }

  async download(model, onProgress) {
    this.cancelled = false;
    for (let i = 1; i <= 20; i++) {
      if (this.cancelled) throw new Error('다운로드를 취소했습니다.');
      await new Promise((r) => setTimeout(r, 60));
      onProgress?.(i / 20);
    }
    this.state[model.id] = true;
  }

  cancel() { this.cancelled = true; }
  async remove(model) { delete this.state[model.id]; }
  async load() { await new Promise((r) => setTimeout(r, 200)); }

  async generate({ images = [] }, onToken) {
    this.stopped = false;
    const text = (images.length ? '사진 속 문제: $x^2-5x+6=0$\n\n' : '') +
      '<think>인수분해를 먼저 시도한다.</think>\n**풀이**\n\n$$x^2-5x+6=(x-2)(x-3)=0$$\n\n$$\\boxed{x=2\\ \\text{또는}\\ x=3}$$';
    for (const ch of text.match(/.{1,4}/gs)) {
      if (this.stopped) return 'stopped';
      onToken(ch);
      await new Promise((r) => setTimeout(r, 15));
    }
    return 'eos';
  }

  stop() { this.stopped = true; }
}
