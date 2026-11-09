// 모델 카탈로그. iPhone 앱(llama.cpp)이 Hugging Face에서 GGUF를 내려받아 실행.
// bundled: 앱 설치 파일에 포함(받기 불필요, 삭제 불가)
// thinking: 'toggle' = 사고 모드 스위치로 켜고 끔, 'always' = 항상 생각, 'none' = 생각 단계 없음
// vision: 사진을 직접 봄(mmproj). 아니면 기기 글자 인식(OCR) 결과를 대신 전달
export const CATALOG = [
  // Qwen3.5 소형(2026): 모델 하나로 글과 사진을 모두 처리(mmproj = 이미지 인코더)
  {
    id: 'euler-mini', name: '오일러 미니', desc: '가장 빠른 답변', detail: 'Qwen3.5 0.8B',
    sizeMB: 800, nCtx: 4096, thinking: 'toggle', vision: true,
    gguf: { repo: 'unsloth/Qwen3.5-0.8B-GGUF', file: 'Qwen3.5-0.8B-Q4_K_M.gguf', mmproj: 'mmproj-F16.gguf' },
  },
  {
    id: 'euler', name: '오일러', desc: '일상 문제와 사진 문제에 가장 효율적', detail: 'Qwen3.5 2B',
    sizeMB: 1900, nCtx: 4096, thinking: 'toggle', vision: true, default: true, bundled: true,
    gguf: { repo: 'unsloth/Qwen3.5-2B-GGUF', file: 'Qwen3.5-2B-Q4_K_M.gguf', mmproj: 'mmproj-F16.gguf' },
  },
  {
    id: 'euler-plus', name: '오일러 플러스', desc: '어려운 문제를 위해 깊게 생각', detail: 'Qwen3.5 4B',
    sizeMB: 3300, nCtx: 4096, thinking: 'always', vision: true,
    gguf: { repo: 'unsloth/Qwen3.5-4B-GGUF', file: 'Qwen3.5-4B-Q4_K_M.gguf', mmproj: 'mmproj-F16.gguf' },
  },
  {
    id: 'euler-coder', name: '오일러 코더', desc: '코드 작성·디버깅, 생각 없이 바로 답변', detail: 'Qwen3 4B Instruct 2507',
    sizeMB: 2500, nCtx: 4096, thinking: 'none', coder: true,
    gguf: { repo: 'unsloth/Qwen3-4B-Instruct-2507-GGUF', file: 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf' },
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
- If an image or text read from a photo is attached, first restate the problem, then solve it.
- If the problem is ambiguous, state your assumption and proceed.
- Double-check arithmetic before answering.`;

export const CODER_SYSTEM = `You are an expert software engineer running fully offline on the user's device.
- Reply in the user's language (Korean if they write Korean); keep code, identifiers and comments idiomatic.
- Put code in fenced blocks with a language tag, and give the file name on the line before a block when it belongs in a file.
- Prefer complete, runnable code. Explain briefly what changed and why.
- For math, write formulas in LaTeX ($...$).`;
