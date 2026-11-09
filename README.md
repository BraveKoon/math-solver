# 오일러 — 오프라인 수학 풀이 (iPhone)

인터넷 없이, 사용 횟수·주제 제한 없이 오픈소스 LLM으로 수학 문제를 푸는 iPhone 앱입니다.
모델은 [llama.cpp](https://github.com/ggml-org/llama.cpp)로 기기 안(Metal GPU)에서 실행되고, 입력한 문제와 사진은 기기 밖으로 나가지 않습니다.

## 구조
- **추론 엔진**: Capacitor 네이티브 플러그인 [`plugins/capacitor-llama`](plugins/capacitor-llama) (Swift)이 llama.cpp `llama.xcframework`(버전은 `scripts/LLAMA_TAG`)를 감싸 GGUF 모델을 실행합니다. 토큰은 실시간 스트리밍.
- **모델**: `src/models.js`의 카탈로그. 기본 모델 *오일러*(Qwen3 1.7B)는 앱 설치 파일에 포함되고, 나머지는 앱 안 모델 시트에서 Hugging Face로부터 한 번 내려받은 뒤 완전 오프라인으로 동작합니다.

  | 이름 | 모델 | 특징 |
  |---|---|---|
  | 오일러 미니 | Qwen3 0.6B | 가장 빠름 |
  | 오일러 (기본·내장) | Qwen3 1.7B | 일상 문제 |
  | 오일러 플러스 | Qwen3 4B Thinking | 어려운 문제, 깊게 생각 |
  | 오일러 비전 | Qwen3-VL 4B | 사진 속 그래프·도형까지 직접 인식 |
  | 오일러 매스 (더 보기) | Qwen2.5-Math 1.5B | 수학 전용 소형 |

- **사진 첨부**
  - 오일러 비전: llama.cpp `mtmd`로 사진을 직접 봅니다.
  - 그 밖의 모델: iOS 내장 글자 인식(Vision, 오프라인)으로 사진 속 문제를 글로 옮겨 모델에 전달합니다. 인쇄된 문장형 문제에 적합하고, 그래프·도형·복잡한 수식은 오일러 비전이 정확합니다.
- **화면**: 왼쪽 서랍의 세션 목록, 하단 시트의 모델 선택·다운로드·삭제, 입력창 ＋로 사진 첨부. 세션은 기기에만 저장됩니다.

## 개발
```bash
npm install
npm run dev     # http://localhost:5173/?mock — 가짜 엔진으로 화면만 확인(브라우저에서는 모델 실행 불가)
npm test
```

## iPhone 빌드
- 요구사항: iOS 26 이상, Xcode 26. 1차 타깃은 iPhone 16(A18, RAM 8GB).
- Mac에서: `npm run ios` → llama.cpp xcframework·기본 모델을 받고 Xcode를 엽니다. Signing Team 지정 후 실기기로 Run (xcframework에 시뮬레이터용 바이너리가 없음).
- Mac 없이: GitHub Actions `TestFlight` 워크플로가 빌드·서명·업로드합니다 → [docs/TESTFLIGHT_NO_MAC.md](docs/TESTFLIGHT_NO_MAC.md)
- `increased-memory-limit` 엔타이틀먼트(`ios/App/App/App.entitlements`)로 4B 모델 메모리를 확보합니다. 컨텍스트 4096, 최대 답변 2048 토큰(설정에서 변경).

## CI
- `web`: 테스트·빌드
- `models`: 카탈로그의 Hugging Face 다운로드 주소 확인
- `ios`: 실기기용 Xcode 빌드(서명 없음)

## 문서
- [App Store 제출 메모](docs/APP_STORE.md) · [개인정보 처리방침](docs/PRIVACY.md) · [이름 후보](docs/NAMING.md)

## 주의
- 모델 첫 다운로드(약 0.4~3GB)에는 인터넷이 필요합니다.
- 소형 모델은 계산 실수를 할 수 있으니 중요한 결과는 검산하세요.
- 갤럭시(Android)는 추후 Android용 llama.cpp 플러그인으로 지원 예정입니다.
