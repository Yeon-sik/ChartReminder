# M1 — 도메인과 Golden Fixture

```text
/feature-dev를 사용할 수 있다면 다음 작업에 사용하라. 사용할 수 없으면 동일 절차로 직접 수행하라.

@CLAUDE.md, @docs/02_DOMAIN_MODEL.md, @docs/05_SIMULATION_ENGINE_SPEC.md, @docs/08_TEST_STRATEGY.md, @docs/10_MILESTONES.md의 M1을 읽어라.

M1 범위만 구현하라.
- Instrument, Candle, Money/Decimal 경계
- 거래일과 UTC 시간 표현
- OHLC 불변조건 검증
- 작은 Golden Fixture와 독립 기대값
- 타임라인 합집합의 기본 순수 함수

금융 값 누적에 JavaScript number를 사용하지 마라. 현재 유지보수되는 Decimal 라이브러리를 공식 문서와 프로젝트 조건으로 평가하고 선택 이유를 Decision Log에 남겨라.

UI, 네트워크, SQLite, Binance 코드는 추가하지 마라.

테스트를 먼저 또는 함께 작성하고 모든 검증을 실행하라. 완료 후 PROJECT_STATE를 갱신하라.
```
