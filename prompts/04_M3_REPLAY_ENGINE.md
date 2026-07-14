# M3 — 리플레이 엔진

```text
@CLAUDE.md, @docs/04_REPLAY_ENGINE_SPEC.md, @docs/08_TEST_STRATEGY.md, @docs/10_MILESTONES.md의 M3를 읽어라.

UI와 타이머 구현을 섞지 말고, 가짜 scheduler로 완전 테스트 가능한 결정론적 리플레이 상태 머신을 구현하라.

필수 기능:
- initialize
- play/pause
- stepForward
- seek
- setSpeed
- restart/dispose
- completed 상태
- 자산 거래일 합집합 타임라인
- 중복 타이머 방지

시장 API, SQLite 스키마, 투자 계산, 디자인은 수정하지 마라. 필요한 인터페이스 변경은 최소화하고 이유를 기록하라.

상태 전이 테스트를 충분히 작성하고 PROJECT_STATE를 갱신하라.
```
