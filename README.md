# Chart Reminder

과거의 특정 시점으로 돌아가 투자 규칙을 적용했을 때 자산가치가 어떻게 전개됐는지 재생·비교하는 Windows 데스크톱 앱. Tauri 2 + React + TypeScript + Vite.

- 제품 목표와 범위: `GOAL.md`
- 개발 규칙: `CLAUDE.md`
- 현재 진행 상태: `PROJECT_STATE.md`
- 명세: `docs/`
- 프로젝트 소개: [`docs/Project_Intro.md`](docs/Project_Intro.md)
- 기술 상세: [`docs/Project_Detail.md`](docs/Project_Detail.md)
- Notion 미러 운영: [`docs/PROJECT_DOCS_OPERATIONS.md`](docs/PROJECT_DOCS_OPERATIONS.md)

## 개발 환경

- Node.js 22+, npm
- Rust stable (MSVC toolchain), WebView2 Runtime

## 명령

```powershell
npm install          # 의존성 설치
npm run tauri dev    # 데스크톱 개발 모드 실행
npm run verify       # format 검사 + lint + typecheck + test + cargo check
npm run format       # Prettier로 코드 정리
npm run tauri build  # Windows 설치 파일 빌드
```

## BYOK 개발 편의(.env)

미국·한국 주식 Provider는 BYOK(Bring-Your-Own-Key)라 앱 화면에서 직접 키를 입력해야 한다.
저장소 루트에 `.env`(Git에 커밋되지 않음)를 두면 개발 중 입력을 반복하지 않아도 된다 — 값이
있으면 앱 화면의 수동 입력 UI를 건너뛰고 자동 적용되고, 없으면 기존과 동일하게 화면에서
입력해 OS 자격 증명 관리자(keyring)에 저장한다(D-018). 배포된 설치 파일 곁에는 `.env`가
없으므로 다른 사용자의 앱에는 아무 영향이 없다.

```
TIINGO_API_KEY=...
OPEN_API_KEY=...          # 공공데이터포털(한국 주식) 서비스 키 — "일반 인증키(Decoding)" 값
OPEN_API_ENDPOINT=...     # 선택. 공공데이터포털 엔드포인트를 바꿔야 할 때만
```

## 권장 IDE

[VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
