// WebLLM 사전 빌드 모델 중 수학에 적합한 것들. vram은 대략적인 필요 메모리(MB).
export const IS_IOS = typeof navigator !== 'undefined' &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

// iPhone 16 = A18 + RAM 8GB. 앱당 메모리 한도 때문에 4B 이하만 노출(8B/7B는 메모리 부족으로 종료됨).
const ALL_MODELS = [
  { id: 'Qwen3-0.6B-q4f16_1-MLC', sizeMB: 600, label: 'Qwen3 0.6B — 초경량·빠름 (~1.4GB)', thinking: true, iosOk: true },
  { id: 'Qwen3-1.7B-q4f16_1-MLC', sizeMB: 1200, label: 'Qwen3 1.7B — 가벼움 (폰 권장, ~2GB)', thinking: true, iosOk: true },
  { id: 'Qwen3-4B-q4f16_1-MLC', sizeMB: 2500, label: 'Qwen3 4B — 정확 (~3.4GB, iPhone은 메모리 한도 확장 필요·불안정할 수 있음)', thinking: true, iosOk: true },
  { id: 'Qwen3-8B-q4f16_1-MLC', sizeMB: 4800, label: 'Qwen3 8B — 정확 (GPU 6GB+, ~5.7GB)', thinking: true },
  { id: 'DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC', sizeMB: 4400, label: 'DeepSeek-R1 Distill 7B — 추론 특화 (~5.1GB)', thinking: false },
  { id: 'Qwen2.5-Math-1.5B-Instruct-q4f16_1-MLC', sizeMB: 1000, label: 'Qwen2.5-Math 1.5B — 수학 전용 (영어 위주, ~1.6GB)', thinking: false, iosOk: true },
];

export const MODELS = IS_IOS ? ALL_MODELS.filter((m) => m.iosOk) : ALL_MODELS.filter((m) => m.id !== 'Qwen3-0.6B-q4f16_1-MLC');
// 기본: 1.7B (iPhone 16에서 속도·정확도 균형). 순서상 첫 항목이 기본이 되도록 정렬.
MODELS.sort((a, b) => (b.id.includes('1.7B') ? 1 : 0) - (a.id.includes('1.7B') ? 1 : 0));

export const DEFAULT_SYSTEM = `You are an expert mathematician and tutor running fully offline on the user's device.
Solve any math problem the user gives, with no topic restrictions.
- Reply in the user's language (Korean if they write Korean).
- Show clear step-by-step reasoning, then state the final answer.
- Write all math in LaTeX: inline with $...$, display with $$...$$.
- Put the final answer in \\boxed{...}.
- If the problem is ambiguous, state your assumption and proceed.
- Double-check arithmetic before answering.`;
