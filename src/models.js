// 모델 카탈로그. iPhone 앱(llama.cpp)이 Hugging Face에서 GGUF를 내려받아 실행.
// bundled: 앱 설치 파일에 포함(받기 불필요, 삭제 불가)
// thinking: 'toggle' = /no_think 로 끌 수 있음(Qwen3 하이브리드), 'always' = 항상 생각, 'none' = 생각 단계 없음
export const CATALOG = [
  {
    id: 'euler-mini', name: '오일러 미니', desc: '가장 빠른 답변', detail: 'Qwen3 0.6B',
    sizeMB: 400, nCtx: 4096, thinking: 'toggle',
    gguf: { repo: 'unsloth/Qwen3-0.6B-GGUF', file: 'Qwen3-0.6B-Q4_K_M.gguf' },
  },
  {
    id: 'euler', name: '오일러', desc: '일상 문제에 가장 효율적', detail: 'Qwen3 1.7B',
    sizeMB: 1100, nCtx: 4096, thinking: 'toggle', default: true, bundled: true,
    gguf: { repo: 'unsloth/Qwen3-1.7B-GGUF', file: 'Qwen3-1.7B-Q4_K_M.gguf' },
  },
  {
    id: 'euler-plus', name: '오일러 플러스', desc: '어려운 문제를 위해 깊게 생각', detail: 'Qwen3 4B Thinking',
    sizeMB: 2500, nCtx: 4096, thinking: 'always',
    gguf: { repo: 'unsloth/Qwen3-4B-Thinking-2507-GGUF', file: 'Qwen3-4B-Thinking-2507-Q4_K_M.gguf' },
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
  },
];

export const ggufFiles = (m) => {
  if (!m.gguf) return [];
  const url = (f) => `https://huggingface.co/${m.gguf.repo}/resolve/main/${f}?download=true`;
  return [m.gguf.file, m.gguf.mmproj].filter(Boolean).map((name) => ({ name, url: url(name) }));
};

export const modelsFor = () => CATALOG.filter((m) => m.gguf);

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
