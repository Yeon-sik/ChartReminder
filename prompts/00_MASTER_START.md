# 최초 지시 — 그대로 붙여 넣기

```text
이 저장소는 Investment Replay Windows 데스크톱 앱의 신규 프로젝트다.

먼저 다음 파일을 반드시 읽어라.
- @GOAL.md
- @CLAUDE.md
- @PROJECT_STATE.md
- @docs/00_PRODUCT_SCOPE.md
- @docs/01_ARCHITECTURE.md
- @docs/10_MILESTONES.md
- @docs/11_DEFINITION_OF_DONE.md
- @docs/13_RISK_REGISTER.md
- @docs/OPEN_QUESTIONS.md

그다음 현재 디렉터리, Git 상태, 설치된 Node/Rust/Claude 개발 환경을 조사하라. 외부 라이브러리와 Tauri 명령은 기억으로 추측하지 말고 현재 공식 문서를 확인하라.

이번 작업 범위는 M0뿐이다. 앱 전체 기능, 시장 데이터 Provider, 차트, 투자 시뮬레이션은 아직 구현하지 마라.

수행할 일:
1. 문서 간 충돌, 구현을 막는 미결정 사항, 위험한 전제를 먼저 찾아라.
2. 합리적인 기본값으로 진행 가능한 항목과 사용자의 결정이 필요한 항목을 구분하라.
3. Tauri 2 + React + TypeScript + Vite 기반 Windows 프로젝트를 스캐폴딩하라.
4. 모듈형 단일 저장소 구조를 잡되 빈 추상화와 과도한 보일러플레이트는 만들지 마라.
5. format, lint, typecheck, unit test, cargo check를 반복 실행 가능한 명령으로 구성하라.
6. 최소 시작 화면만 만들고, 앱의 목적과 현재 M0 상태를 표시하라.
7. 관련 명령을 실제로 실행하고 실패를 해결하라.
8. 장기 영향을 주는 선택은 @docs/12_DECISION_LOG.md에 기록하라.
9. @PROJECT_STATE.md를 사실에 근거해 갱신하라.

작업 전에는 간결한 구현 계획과 예상 변경 파일을 보여라. 그 후 M0을 끝까지 수행하라. 완료 보고에는 변경 파일, 선택 이유, 실행한 검증 명령과 실제 결과, 남은 위험을 포함하라.
```
