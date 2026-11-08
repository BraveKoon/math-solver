# Math Solver — 오프라인 로컬 LLM 수학 풀이 (웹/PWA)

인터넷 없이, 사용 횟수·주제 제한 없이, 오픈소스 LLM으로 수학 문제를 푸는 웹앱입니다.
서버도 계정도 필요 없고 입력한 문제는 기기 밖으로 나가지 않습니다.

## 구조
- **iPhone 앱 (기본)**: Capacitor 네이티브 플러그인(`plugins/capacitor-llama`)으로 [llama.cpp](https://github.com/ggml-org/llama.cpp)를 Metal GPU에서 실행. 모델(GGUF)은 앱 안의 모델 선택 시트에서 Hugging Face로부터 한 번 내려받고 이후 완전 오프라인.
- **이미지 첨부**: llama.cpp의 `mtmd`(멀티모달)로 비전 모델(오일러 비전, Qwen2.5-VL 3B)이 사진 속 문제를 읽고 풉니다.
- **실행 환경**: iPhone 앱 전용(llama.cpp). 브라우저에서 열면 화면만 볼 수 있어요. 갤럭시는 추후 Android용 llama.cpp 플러그인으로 지원 예정.
- **화면**: 왼쪽 서랍에 세션 목록(검색·삭제), 하단 시트에서 모델 선택·다운로드·삭제, 입력창 ＋로 이미지 첨부. 세션은 기기에만 저장.
- 모델 목록: `src/models.js` (오일러 미니/오일러/오일러 플러스/오일러 비전, 더 많은 모델: 오일러 매스 등)

## 실행
```bash
npm install
npm run dev        # 개발 (http://localhost:5173/?mock 이면 가짜 엔진으로 화면 확인)
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
- iPhone에서는 메모리 한도 때문에 Qwen3 0.6B·1.7B(기본)·4B(실험적), Qwen2.5-Math 1.5B만 노출 (Qwen3.5 4B는 메모리 부족으로 화면이 종료되어 제외)되고, 컨텍스트 4096·최대 토큰 2048로 제한합니다.
- `increased-memory-limit` 엔타이틀먼트를 `ios/App/App/App.entitlements`에 설정했습니다(개발자 계정 App ID에서 Increased Memory Limit capability 활성화 필요).
- **검증 필요**: 이 저장소는 Linux 환경에서 만들어져 Xcode 빌드와 실기기 추론은 아직 테스트하지 못했습니다. 4B가 불안정하면 1.7B를 쓰세요.
- 성능이 부족하면 다음 단계로 네이티브 llama.cpp/MLX 플러그인으로 교체할 수 있습니다(웹 UI는 그대로).

## 로드맵
- 사진(OCR/비전) 입력, Capacitor로 Android 앱 패키징(네이티브 llama.cpp 백엔드), 계산 검증용 로컬 CAS(예: Pyodide+SymPy).
