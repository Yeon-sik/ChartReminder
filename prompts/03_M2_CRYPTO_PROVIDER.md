# M2 — 암호화폐 Provider와 캐시

```text
@CLAUDE.md, @docs/01_ARCHITECTURE.md, @docs/03_MARKET_DATA_SPEC.md, @docs/07_STORAGE_AND_SESSION_SPEC.md, @docs/08_TEST_STRATEGY.md, @docs/10_MILESTONES.md의 M2를 읽어라.

먼저 공개 일봉 API 공급자와 기준 거래쌍을 현재 공식 문서로 검증하고, 호출 제한·데이터 의미·이용조건을 기록하라. 기억에 의존하지 마라.

M2 범위:
- MarketDataProvider port
- BTC, ETH, SOL 일봉 Provider adapter
- 응답 런타임 검증과 Candle 정규화
- 페이지네이션·재시도·Rate limit 오류 구분
- SQLite CandleRepository와 버전 마이그레이션
- 로컬 캐시 범위 분석과 누락 구간만 조회
- Provider 계약 테스트와 fixture 기반 통합 테스트

React 컴포넌트에서 API나 SQLite를 직접 호출하지 마라. API 키가 필요 없는 공개 데이터 수직 슬라이스를 우선한다.

실제 API 테스트는 불안정한 CI 의존성이 되지 않게 분리하고, 기본 테스트는 fixture로 결정론적으로 실행하라.

완료 후 데이터 출처, 거래쌍, 캐시 정책과 검증 결과를 보고하고 PROJECT_STATE를 갱신하라.
```
