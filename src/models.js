// WebLLM 사전 빌드 모델 중 수학에 적합한 것들. vram은 대략적인 필요 메모리(MB).
export const MODELS = [
  { id: 'Qwen3-1.7B-q4f16_1-MLC', label: 'Qwen3 1.7B — 가벼움 (폰 권장, ~2GB)', thinking: true },
  { id: 'Qwen3-4B-q4f16_1-MLC', label: 'Qwen3 4B — 균형 (고급 폰/노트북, ~3.4GB)', thinking: true },
  { id: 'Qwen3-8B-q4f16_1-MLC', label: 'Qwen3 8B — 정확 (GPU 6GB+, ~5.7GB)', thinking: true },
  { id: 'DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC', label: 'DeepSeek-R1 Distill 7B — 추론 특화 (~5.1GB)', thinking: false },
  { id: 'Qwen2.5-Math-1.5B-Instruct-q4f16_1-MLC', label: 'Qwen2.5-Math 1.5B — 수학 전용 (영어 위주, ~1.6GB)', thinking: false },
];

export const DEFAULT_SYSTEM = `You are an expert mathematician and tutor running fully offline on the user's device.
Solve any math problem the user gives, with no topic restrictions.
- Reply in the user's language (Korean if they write Korean).
- Show clear step-by-step reasoning, then state the final answer.
- Write all math in LaTeX: inline with $...$, display with $$...$$.
- Put the final answer in \\boxed{...}.
- If the problem is ambiguous, state your assumption and proceed.
- Double-check arithmetic before answering.`;
