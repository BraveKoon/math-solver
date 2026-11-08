import { Capacitor, registerPlugin } from '@capacitor/core';
import { ggufFiles } from './models.js';

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

// ---------------------------------------------------------------- 브라우저: 실행 불가 안내
export class UnsupportedEngine {
  kind = 'unsupported';
  supportsImages = false;
  async status(models) { return Object.fromEntries(models.map((m) => [m.id, { downloaded: false, downloading: false }])); }
  fail() { return Promise.reject(new Error('브라우저에서는 실행할 수 없어요. iPhone 앱을 사용하세요.')); }
  download() { return this.fail(); }
  cancel() {}
  remove() { return this.fail(); }
  load() { return this.fail(); }
  generate() { return this.fail(); }
  stop() {}
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
