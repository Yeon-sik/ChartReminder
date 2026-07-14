---
name: milestone-closeout
description: 현재 마일스톤의 범위, 테스트, 문서, Git diff와 PROJECT_STATE를 감사하고 종료 보고를 만든다.
---

# Milestone Closeout

1. 해당 마일스톤 acceptance criteria를 읽는다.
2. git diff와 status를 확인한다.
3. 범위 밖 변경을 식별한다.
4. format, lint, typecheck, tests, cargo check, 필요한 build를 실행한다.
5. 실패·경고·미검증 항목을 숨기지 않는다.
6. Decision Log, Open Questions, Risk Register가 필요한지 검사한다.
7. PROJECT_STATE를 사실 기반으로 갱신한다.
8. 완료/부분 완료/차단 중 하나로 판정한다.
