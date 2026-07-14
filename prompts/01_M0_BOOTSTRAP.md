# M0 — 저장소 기반

```text
@CLAUDE.md, @PROJECT_STATE.md, @docs/01_ARCHITECTURE.md, @docs/10_MILESTONES.md의 M0, @docs/11_DEFINITION_OF_DONE.md를 읽어라.

현재 저장소가 M0 완료 조건을 충족하는지 감사하라. 누락된 항목만 구현하고 기존의 정상 동작을 불필요하게 다시 작성하지 마라.

반드시 검증할 것:
- Tauri 2 개발 실행 가능
- React + TypeScript 빌드 가능
- format/lint/typecheck/test 명령
- cargo check
- Windows production build의 조기 실패 요인
- Git에 들어가면 안 되는 생성물과 비밀정보

완료 후 PROJECT_STATE를 갱신하고 M1로 넘어갈 준비가 됐는지 증거와 함께 보고하라. M1 코드는 작성하지 마라.
```
