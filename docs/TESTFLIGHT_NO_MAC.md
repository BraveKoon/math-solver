# 맥 없이 TestFlight에 올리기

GitHub Actions의 macOS 서버가 빌드·서명·업로드를 대신합니다. 브라우저만 있으면 됩니다.
(애플 인증서는 Xcode의 클라우드 관리 서명이 자동으로 만들어서, 인증서·프로파일 파일을 다룰 필요가 없습니다.)

## 1회 준비
1. **App ID 등록**: developer.apple.com → Identifiers → `com.bravekoon.mathsolver.app`, Capability에서 **Increased Memory Limit** 체크.
2. **앱 만들기**: appstoreconnect.apple.com → 앱 → + → 신규 앱 (번들 ID는 위에서 등록한 것).
3. **API 키 만들기**: App Store Connect → 사용자 및 액세스 → **통합 → App Store Connect API** → 키 생성 (역할: **Admin** 또는 **App Manager**).
   - `.p8` 파일은 **한 번만 다운로드**할 수 있습니다. Key ID와 Issuer ID도 화면에 표시됩니다.
4. **Team ID**: developer.apple.com → 멤버십 세부 정보의 10자리 Team ID.
5. GitHub 저장소 → Settings → Secrets and variables → Actions → **New repository secret** 4개:

| 이름 | 값 |
|---|---|
| `APPLE_TEAM_ID` | 10자리 Team ID |
| `ASC_KEY_ID` | API 키의 Key ID |
| `ASC_ISSUER_ID` | Issuer ID (UUID) |
| `ASC_KEY_P8_BASE64` | `.p8` 파일 내용을 base64로 인코딩한 값 (아래) |

`.p8`을 base64로 바꾸는 법:
- Windows PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("AuthKey_XXXX.p8"))`
- 또는 iPhone/PC 어디서든 base64 인코딩 사이트 대신 **로컬 도구**를 쓰세요 (키는 비밀입니다. 채팅·메일에 붙여넣지 마세요).

## 업로드
GitHub 저장소 → **Actions** → **TestFlight** → **Run workflow**.
- 빌드 번호는 실행 번호(`run_number`)로 자동 증가합니다.
- 10~20분 뒤 업로드가 끝나고, App Store Connect 처리 후(10~30분) TestFlight 탭에 빌드가 나타납니다.
- iPhone에 TestFlight 앱을 설치하고 같은 Apple ID로 로그인하면 설치할 수 있습니다.

## 자주 막히는 곳
- `No profiles for 'com.bravekoon.mathsolver.app'`: App ID가 등록되지 않았거나 API 키 역할이 낮습니다(Admin/App Manager 필요).
- 엔타이틀먼트(Increased Memory Limit) 오류: 1번에서 Capability를 켠 뒤 다시 실행.
- 첫 외부 테스터 초대에는 Apple의 베타 심사가 필요합니다. 본인(내부 테스터)은 바로 설치됩니다.
- 실패 로그를 알려 주시면 이어서 고치겠습니다. 이 워크플로는 실제 계정으로 아직 실행해 보지 못했습니다.
