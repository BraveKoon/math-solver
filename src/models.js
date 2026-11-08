// 모델 카탈로그.
// - gguf: iPhone 앱(llama.cpp 네이티브)에서 Hugging Face로부터 내려받아 실행
// - mlc : 웹/PWA(WebLLM, WebGPU)에서 실행
// thinking: 'toggle' = /no_think 로 끌 수 있음(Qwen3 하이브리드), 'always' = 항상 생각, 'none' = 생각 단계 없음
export const IS_IOS = typeof navigator !== 'undefined' &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export const CATALOG = [
  {
    id: 'euler-mini', name: '오일러 미니', desc: '가장 빠른 답변', detail: 'Qwen3 0.6B',
    sizeMB: 400, nCtx: 4096, thinking: 'toggle',
    gguf: { repo: 'unsloth/Qwen3-0.6B-GGUF', file: 'Qwen3-0.6B-Q4_K_M.gguf' },
    mlc: 'Qwen3-0.6B-q4f16_1-MLC', mlcIos: true,
  },
  {
    id: 'euler', name: '오일러', desc: '일상 문제에 가장 효율적', detail: 'Qwen3 1.7B',
    sizeMB: 1100, nCtx: 4096, thinking: 'toggle', default: true,
    gguf: { repo: 'unsloth/Qwen3-1.7B-GGUF', file: 'Qwen3-1.7B-Q4_K_M.gguf' },
    mlc: 'Qwen3-1.7B-q4f16_1-MLC', mlcIos: true,
  },
  {
    id: 'euler-plus', name: '오일러 플러스', desc: '어려운 문제를 위해 깊게 생각', detail: 'Qwen3 4B Thinking',
    sizeMB: 2500, nCtx: 4096, thinking: 'always',
    gguf: { repo: 'unsloth/Qwen3-4B-Thinking-2507-GGUF', file: 'Qwen3-4B-Thinking-2507-Q4_K_M.gguf' },
    mlc: 'Qwen3-4B-q4f16_1-MLC', mlcIos: false,
  },
  {
    id: 'euler-vision', name: '오일러 비전', desc: '사진 속 문제를 읽고 풀이', detail: 'Qwen2.5-VL 3B',
    sizeMB: 2800, nCtx: 4096, thinking: 'none', vision: true,
    gguf: {
      repo: 'ggml-org/Qwen2.5-VL-3B-Instruct-GGUF',
      file: 'Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf',
      mmproj: 'mmproj-Qwen2.5-VL-3B-Instruct-Q8_0.gguf',
    },
  },
  // ---- 더 많은 모델 ----
  {
    id: 'euler-math', name: '오일러 매스', desc: '수학 전용 소형 모델 (영어 위주)', detail: 'Qwen2.5-Math 1.5B',
    sizeMB: 1000, nCtx: 4096, thinking: 'none', more: true,
    gguf: { repo: 'bartowski/Qwen2.5-Math-1.5B-Instruct-GGUF', file: 'Qwen2.5-Math-1.5B-Instruct-Q4_K_M.gguf' },
    mlc: 'Qwen2.5-Math-1.5B-Instruct-q4f16_1-MLC', mlcIos: true,
  },
  {
    id: 'euler-pro', name: '오일러 프로', desc: 'PC 전용 · 큰 GPU에서 가장 정확', detail: 'Qwen3 8B',
    sizeMB: 4800, thinking: 'toggle', more: true, mlc: 'Qwen3-8B-q4f16_1-MLC', mlcIos: false,
  },
  {
    id: 'gauss', name: '가우스', desc: 'PC 전용 · 추론 특화', detail: 'DeepSeek-R1 Distill 7B',
    sizeMB: 4400, thinking: 'always', more: true, mlc: 'DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC', mlcIos: false,
  },
];

export const ggufFiles = (m) => {
  if (!m.gguf) return [];
  const url = (f) => `https://huggingface.co/${m.gguf.repo}/resolve/main/${f}?download=true`;
  return [m.gguf.file, m.gguf.mmproj].filter(Boolean).map((name) => ({ name, url: url(name) }));
};

/** 실행 방식(native | web)에 맞는 모델만. */
export function modelsFor(mode, ios = IS_IOS) {
  if (mode === 'native') return CATALOG.filter((m) => m.gguf);
  return CATALOG.filter((m) => m.mlc && (!ios || m.mlcIos));
}

export const defaultModel = (list) => list.find((m) => m.default) ?? list[0];

export const DEFAULT_SYSTEM = `You are an expert mathematician and tutor running fully offline on the user's device.
Solve any math problem the user gives, with no topic restrictions.
- Reply in the user's language (Korean if they write Korean).
- Show clear step-by-step reasoning, then state the final answer.
- Write all math in LaTeX: inline with $...$, display with $$...$$.
- Put the final answer in \\boxed{...}.
- If an image is attached, first transcribe the problem from it, then solve it.
- If the problem is ambiguous, state your assumption and proceed.
- Double-check arithmetic before answering.`;
