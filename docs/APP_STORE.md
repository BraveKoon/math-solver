# App Store 등록 가이드 (Math Solver)

## 1. 사전 준비 (사람이 해야 하는 것)
- [ ] Apple Developer Program 가입 (연 $99)
- [ ] Bundle ID 등록: `com.mathsolver.app` (원하는 ID로 바꾸려면 `capacitor.config.json`과 Xcode 프로젝트의 `PRODUCT_BUNDLE_IDENTIFIER` 모두 변경)
- [ ] App ID에서 **Increased Memory Limit** capability 활성화
- [ ] App Store Connect에서 새 앱 생성
- [ ] `docs/PRIVACY.md`를 공개 URL로 호스팅 (GitHub Pages 가능) → 개인정보 처리방침 URL 입력
- [ ] 지원 URL 준비 (GitHub 저장소 URL 가능)

## 2. 빌드·업로드
1. `npm install && npm run ios` (Mac, Xcode 26)
2. Signing & Capabilities → Team 지정, 버전/빌드 번호 설정
3. 실기기(iPhone 16)로 Run → 모델 다운로드/추론/오프라인(비행기 모드) 동작 확인
4. Product → Archive → Distribute App → App Store Connect → TestFlight로 먼저 검증
5. 심사 제출

## 3. 심사 체크 (Guideline 대응)
- **4.2 최소 기능**: 웹 래퍼로 보이지 않도록 완전 오프라인 온디바이스 AI 추론이라는 네이티브급 기능을 심사 노트에 명시.
- **2.5.2 / 코드 다운로드**: 다운로드하는 것은 실행 코드가 아닌 모델 가중치(데이터)임을 명시. (WebLLM의 wasm 모델 라이브러리는 첫 실행 때 받습니다. 심사 거절 시 앱 번들에 wasm을 포함하도록 전환 필요)
- **5.1.1 개인정보**: 데이터 수집 없음. App Privacy → "데이터 수집 안 함". `PrivacyInfo.xcprivacy` 포함됨.
- **수출 규제**: `ITSAppUsesNonEncryption=false` 설정됨(HTTPS 표준 암호만 사용).
- **AI 생성 콘텐츠**: 부정확할 수 있음을 앱/설명에 고지(아래 설명에 포함). 제한 없는 풀이를 표방해도 수학 이외 범용 챗봇이 되지 않도록 시스템 프롬프트가 수학에 한정되어 있음.
- **심사 노트에 쓸 것**: "첫 실행 시 약 1.2GB 모델을 다운로드합니다. Wi-Fi에서 모델 선택 후 '모델 불러오기'를 눌러 주세요. iOS 26 이상 필요."

## 4. 스토어 메타데이터 초안
**이름**: Math Solver – 오프라인 수학 풀이
**부제**: 인터넷 없이 AI가 풀어주는 수학
**카테고리**: 교육 / 보조: 유틸리티
**키워드**: 수학,풀이,AI,오프라인,방정식,미적분,LLM,계산,공부
**연령 등급**: 4+

**설명(KO)**
인터넷이 없어도, 횟수 제한 없이, 내 아이폰 안에서 AI가 수학 문제를 단계별로 풀어줍니다.
• 완전 오프라인: 모델을 한 번 내려받으면 비행기 모드에서도 동작
• 프라이버시: 문제와 대화가 기기 밖으로 나가지 않음, 계정·광고·추적 없음
• 오픈소스 AI 모델(Qwen3 등) 선택
• 수식(LaTeX)을 보기 좋게 표시, 추론 과정 펼쳐보기
• 대수, 방정식, 미적분, 확률, 선형대수 등 다양한 문제
※ 최초 1회 모델 다운로드(약 0.6~3GB) 필요, iPhone 16 및 iOS 26 이상 권장. AI 답변은 틀릴 수 있으니 중요한 결과는 검증하세요.

**Description (EN)**
Solve math step by step with an open-source AI that runs entirely on your iPhone — no internet, no limits, no account. Download a model once and it works in airplane mode. Your problems never leave your device.

## 5. 스크린샷
iPhone 6.9" (1320×2868) 필수. 시뮬레이터 iPhone 16 Pro Max로 촬영: 문제 입력 / 풀이 결과(수식) / 모델 선택 / 설정.
