# 이름 구상

## 모델 이름 (앱 안에 표시, 실제 모델명은 함께 표기해 오픈소스 출처를 밝힘)
| 표시 이름 | 실제 모델 | 용도 |
|---|---|---|
| 오일러 미니 | Qwen3 0.6B | 초경량, 가장 빠름 |
| **오일러** (기본) | Qwen3 1.7B | iPhone 16 기본 추천 |
| 오일러 플러스 | Qwen3 4B | 정확도 높음, 메모리 여유 필요 |
| 오일러 플러스 N | Qwen3.5 4B | 최신 4B |
| 오일러 프로 | Qwen3 8B | PC/큰 GPU (iPhone 제외) |
| 가우스 | DeepSeek-R1 Distill 7B | 추론 특화, PC |
| 오일러 매스 | Qwen2.5-Math 1.5B | 수학 전용(영어 위주) |

규칙: 크기가 커질수록 미니 → (없음) → 플러스 → 프로. `src/models.js`의 `name`만 바꾸면 전체 UI에 반영됩니다.

## 앱 이름 후보
스토어 이름은 최대 30자, 핵심은 "수학 + 오프라인 + 프라이버시".

| 순위 | 이름 | 부제 | 메모 |
|---|---|---|---|
| 1 | **오일러 – 오프라인 수학 풀이** (Euler: Offline Math) | 인터넷 없이 AI가 풀어주는 수학 | 모델 이름 체계와 일치, 발음·기억 쉬움 |
| 2 | **수식이** | 내 폰 속 수학 선생님 | 친근, 어린 학생층에 적합 |
| 3 | **Q.E.D.** | Offline AI Math Solver | 증명 끝 기호, 간결·글로벌 |
| 4 | **ZeroNet Math / 제로넷 수학** | 네트워크 없이도 푼다 | 오프라인 강조 |
| 5 | **풀이노트** | 온디바이스 AI 수학 | 학습 노트 느낌 |

## 결정 전 확인할 것 (사람이 해야 함)
- App Store Connect에서 **이름 사용 가능 여부** 조회 (이미 쓰이는 이름이면 부제를 붙여 구분)
- 상표 검색(KIPRIS / USPTO)과 도메인·GitHub 이름 확인
- 확정 후 바꿀 곳: `capacitor.config.json`의 `appName`, `ios/App/App/Info.plist`의 `CFBundleDisplayName`, `index.html` 제목, `vite.config.js` 매니페스트, 스토어 메타데이터(`docs/APP_STORE.md`)
- Bundle ID(`com.mathsolver.app`)는 이름과 무관하며, 첫 등록 후에는 바꿀 수 없으니 등록 전에 확정
