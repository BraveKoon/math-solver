// WebLLM 사전 빌드 모델 중 수학에 적합한 것들. vram은 대략적인 필요 메모리(MB).
export const IS_IOS = typeof navigator !== 'undefined' &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

// iosOk가 없는 모델은 iPhone에서 숨김. Qwen3.5 4B는 iPhone 16에서 로딩 중 앱 화면이 강제 종료되어 제외.
// iPhone 16 = A18 + RAM 8GB. 앱당 메모리 한도 때문에 4B 이하만 노출(8B/7B는 메모리 부족으로 종료됨).
const ALL_MODELS = [
  { id: 'Qwen3-0.6B-q4f16_1-MLC', name: '오일러 미니', base: 'Qwen3 0.6B', desc: '초경량·가장 빠름 (~1.4GB)', sizeMB: 600, thinking: true, iosOk: true },
  { id: 'Qwen3-1.7B-q4f16_1-MLC', name: '오일러', base: 'Qwen3 1.7B', desc: '폰 기본 추천 (~2GB)', sizeMB: 1200, thinking: true, iosOk: true },
  { id: 'Qwen3-4B-q4f16_1-MLC', name: '오일러 플러스', base: 'Qwen3 4B', desc: '정확도 높음·실험적 (~3.4GB, iPhone에서 앱이 종료될 수 있음)', sizeMB: 2500, thinking: true, iosOk: true },
  { id: 'Qwen3.5-4B-q4f16_1-MLC', name: '오일러 플러스 N', base: 'Qwen3.5 4B', desc: '최신 4B (~3.9GB, iPhone 미지원: 메모리 부족)', sizeMB: 2700, thinking: true },
  { id: 'Qwen3-8B-q4f16_1-MLC', name: '오일러 프로', base: 'Qwen3 8B', desc: 'PC/큰 GPU용 (~5.7GB)', sizeMB: 4800, thinking: true },
  { id: 'DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC', name: '가우스', base: 'DeepSeek-R1 Distill 7B', desc: '추론 특화, PC용 (~5.1GB)', sizeMB: 4400, thinking: false },
  { id: 'Qwen2.5-Math-1.5B-Instruct-q4f16_1-MLC', name: '오일러 매스', base: 'Qwen2.5-Math 1.5B', desc: '수학 전용, 영어 위주 (~1.6GB)', sizeMB: 1000, thinking: false, iosOk: true },
].map((m) => ({ ...m, label: `${m.name} · ${m.base} — ${m.desc}` }));

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
