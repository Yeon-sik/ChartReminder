# CashOS

과거의 특정 시점으로 돌아가 투자 규칙을 적용했을 때 자산가치가 어떻게 전개됐는지 재생·비교하는 Windows 데스크톱 앱. Tauri 2 + React + TypeScript + Vite.

- 제품 목표와 범위: `GOAL.md`
- 개발 규칙: `CLAUDE.md`
- 현재 진행 상태: `PROJECT_STATE.md`
- 명세: `docs/`

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

## 권장 IDE

[VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
