# Math Solver — 오프라인 로컬 LLM 수학 풀이 (웹/PWA)

인터넷 없이, 사용 횟수·주제 제한 없이, 오픈소스 LLM으로 수학 문제를 푸는 웹앱입니다.
서버도 계정도 필요 없고 입력한 문제는 기기 밖으로 나가지 않습니다.

## 구조
- **브라우저 내장 모드 (기본)**: [WebLLM](https://github.com/mlc-ai/web-llm) + WebGPU로 모델을 브라우저에서 직접 실행. 갤럭시(Android Chrome, WebGPU 지원 기기)에서도 동일하게 동작.
- **Ollama 모드 (PC용)**: 같은 PC의 Ollama 서버를 사용해 더 큰 모델 실행. `OLLAMA_ORIGINS=* ollama serve`
- PWA: 앱 셸을 서비스워커로 캐시 → 홈 화면에 설치, 비행기 모드 동작.
- 모델: Qwen3 0.6B·1.7B·4B·8B, Qwen3.5 4B, DeepSeek-R1-Distill-Qwen-7B, Qwen2.5-Math-1.5B — 앱 안에서는 "오일러" 계열 이름으로 표시(`docs/NAMING.md`, `src/models.js`)
- 수식: Markdown + KaTeX, 추론 과정(`<think>`)은 접이식 표시.

## 실행
```bash
npm install
npm run dev        # 개발
npm run build && npm run preview   # 배포 빌드 (PWA 활성)
```
`dist/`를 정적 호스팅(HTTPS 또는 localhost)하면 됩니다. 서비스워커·WebGPU는 보안 컨텍스트가 필요합니다.

## 사용 순서
1. 처음 한 번만 인터넷 연결 상태로 앱을 열고 모델을 선택 → "모델 불러오기" (다운로드 후 기기에 저장).
2. 이후엔 인터넷 없이 사용 가능.

## 주의 / 한계
- 모델 첫 다운로드(약 1~6GB)는 인터넷이 필요합니다. 모델 실행 라이브러리(wasm)는 앱에 번들되어 있습니다.
- 갤럭시: RAM 8GB 이상 + 최신 Chrome 권장, 1.7B 모델부터 시작하세요. 4B 이상은 기기에 따라 메모리 부족이 날 수 있습니다.
- 소형 모델은 계산 실수를 할 수 있으니 중요한 결과는 검증하세요.

## iPhone 앱 (1차 타깃: iPhone 16)
Capacitor로 같은 웹앱을 WKWebView 네이티브 앱으로 감쌉니다 (`ios/`).
- **요구사항**: iOS 26 이상 (Safari/WKWebView의 WebGPU 지원 버전), Mac + Xcode 26, iPhone 16 (A18, RAM 8GB).
- 빌드: `npm install && npm run ios` → Xcode에서 Signing Team 지정 → iPhone 16 선택 후 Run.
- iPhone에서는 메모리 한도 때문에 Qwen3 0.6B·1.7B(기본)·4B, Qwen3.5 4B, Qwen2.5-Math 1.5B만 노출되고, 컨텍스트 4096·최대 토큰 2048로 제한합니다.
- `increased-memory-limit` 엔타이틀먼트를 `ios/App/App/App.entitlements`에 설정했습니다(개발자 계정 App ID에서 Increased Memory Limit capability 활성화 필요).
- **검증 필요**: 이 저장소는 Linux 환경에서 만들어져 Xcode 빌드와 실기기 추론은 아직 테스트하지 못했습니다. 4B가 불안정하면 1.7B를 쓰세요.
- 성능이 부족하면 다음 단계로 네이티브 llama.cpp/MLX 플러그인으로 교체할 수 있습니다(웹 UI는 그대로).

## 로드맵
- 사진(OCR/비전) 입력, Capacitor로 Android 앱 패키징(네이티브 llama.cpp 백엔드), 계산 검증용 로컬 CAS(예: Pyodide+SymPy).
