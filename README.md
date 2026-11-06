# Math Solver — 오프라인 로컬 LLM 수학 풀이 (웹/PWA)

인터넷 없이, 사용 횟수·주제 제한 없이, 오픈소스 LLM으로 수학 문제를 푸는 웹앱입니다.
서버도 계정도 필요 없고 입력한 문제는 기기 밖으로 나가지 않습니다.

## 구조
- **브라우저 내장 모드 (기본)**: [WebLLM](https://github.com/mlc-ai/web-llm) + WebGPU로 모델을 브라우저에서 직접 실행. 갤럭시(Android Chrome, WebGPU 지원 기기)에서도 동일하게 동작.
- **Ollama 모드 (PC용)**: 같은 PC의 Ollama 서버를 사용해 더 큰 모델 실행. `OLLAMA_ORIGINS=* ollama serve`
- PWA: 앱 셸을 서비스워커로 캐시 → 홈 화면에 설치, 비행기 모드 동작.
- 모델: Qwen3 (1.7B/4B/8B), DeepSeek-R1-Distill-Qwen-7B, Qwen2.5-Math-1.5B (`src/models.js`에서 추가 가능)
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
- 모델 첫 다운로드(약 1~6GB)는 인터넷이 필요합니다. WebLLM의 모델 실행 라이브러리(wasm)도 첫 로드 때 함께 저장됩니다.
- 갤럭시: RAM 8GB 이상 + 최신 Chrome 권장, 1.7B 모델부터 시작하세요. 4B 이상은 기기에 따라 메모리 부족이 날 수 있습니다.
- 소형 모델은 계산 실수를 할 수 있으니 중요한 결과는 검증하세요.

## 로드맵
- 사진(OCR/비전) 입력, Capacitor로 Android 앱 패키징(네이티브 llama.cpp 백엔드), 계산 검증용 로컬 CAS(예: Pyodide+SymPy).
