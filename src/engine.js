import { CreateMLCEngine, prebuiltAppConfig } from '@mlc-ai/web-llm';
import { IS_IOS } from './models.js';

// 모델 실행 라이브러리(wasm)를 앱에 번들(public/wasm)해서 첫 실행에도 GitHub 접속이 필요 없게 함.
const BUNDLED_LIBS = [
  'Qwen3-0.6B-q4f16_1-MLC', 'Qwen3-1.7B-q4f16_1-MLC', 'Qwen3-4B-q4f16_1-MLC', 'Qwen3.5-4B-q4f16_1-MLC', 'Qwen2.5-Math-1.5B-Instruct-q4f16_1-MLC',
];
function localAppConfig() {
  const model_list = prebuiltAppConfig.model_list.map((m) => {
    if (!BUNDLED_LIBS.includes(m.model_id)) return m;
    const file = m.model_lib.split('/').pop();
    return { ...m, model_lib: new URL(`wasm/${file}`, document.baseURI).href };
  });
  return { ...prebuiltAppConfig, model_list, useIndexedDBCache: false };
}

export const hasWebGPU = () => typeof navigator !== 'undefined' && !!navigator.gpu;

/** 브라우저 내장 엔진 (WebLLM / WebGPU). 모델은 Cache API에 저장되어 이후 오프라인 동작. */
export class BrowserEngine {
  async load({ modelId }, onProgress) {
    if (!hasWebGPU()) throw new Error('WebGPU를 쓸 수 없습니다. iPhone은 iOS 26 이상이 필요합니다(설정 > 일반 > 소프트웨어 업데이트). 데스크톱/안드로이드는 최신 Chrome을 쓰세요.');
    this.engine = await CreateMLCEngine(
      modelId,
      {
        appConfig: localAppConfig(),
        initProgressCallback: (p) => onProgress(p.progress ?? 0, p.text ?? ''),
      },
      // iOS는 KV 캐시 메모리를 아끼기 위해 컨텍스트를 4096으로 제한
      IS_IOS ? { context_window_size: 4096 } : undefined,
    );
  }
  async stream(messages, { temperature, maxTokens, thinking }, onToken) {
    const chunks = await this.engine.chat.completions.create({
      messages,
      stream: true,
      temperature,
      max_tokens: maxTokens,
      extra_body: { enable_thinking: !!thinking },
    });
    for await (const c of chunks) {
      const t = c.choices[0]?.delta?.content;
      if (t) onToken(t);
    }
  }
  stop() { this.engine?.interruptGenerate(); }
  async clearCache(modelId) {
    const { deleteModelAllInfoInCache } = await import('@mlc-ai/web-llm');
    await deleteModelAllInfoInCache(modelId);
  }
}

/** PC의 Ollama 서버(OpenAI 호환이 아닌 네이티브 /api/chat) 사용. 서버도 로컬이므로 인터넷 불필요. */
export class OllamaEngine {
  async load({ url, model }, onProgress) {
    this.url = url.replace(/\/$/, '');
    this.model = model;
    const r = await fetch(`${this.url}/api/tags`).catch(() => null);
    if (!r?.ok) throw new Error('Ollama 서버에 연결할 수 없습니다. `OLLAMA_ORIGINS=* ollama serve` 로 실행했는지 확인하세요.');
    const names = (await r.json()).models.map((m) => m.name);
    if (!names.some((n) => n === model || n.startsWith(model + ':') || n === model + ':latest'))
      throw new Error(`모델 '${model}' 이 없습니다. 먼저 'ollama pull ${model}' 하세요. 설치됨: ${names.join(', ') || '없음'}`);
    onProgress(1, 'Ollama 연결됨');
  }
  async stream(messages, { temperature, maxTokens, thinking }, onToken) {
    this.ctrl = new AbortController();
    const r = await fetch(`${this.url}/api/chat`, {
      method: 'POST',
      signal: this.ctrl.signal,
      body: JSON.stringify({
        model: this.model, messages, stream: true, think: !!thinking,
        options: { temperature, num_predict: maxTokens },
      }),
    });
    if (!r.ok) throw new Error(`Ollama 오류 ${r.status}: ${await r.text()}`);
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '', inThink = false;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line) continue;
          const m = JSON.parse(line).message || {};
          if (m.thinking) { if (!inThink) { onToken('<think>'); inThink = true; } onToken(m.thinking); }
          if (m.content) { if (inThink) { onToken('</think>'); inThink = false; } onToken(m.content); }
        }
      }
    } catch (e) { if (e.name !== 'AbortError') throw e; }
    if (inThink) onToken('</think>');
  }
  stop() { this.ctrl?.abort(); }
  async clearCache() {}
}
