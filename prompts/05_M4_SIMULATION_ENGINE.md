# M4 — 투자 시뮬레이션

```text
@CLAUDE.md, @docs/02_DOMAIN_MODEL.md, @docs/05_SIMULATION_ENGINE_SPEC.md, @docs/08_TEST_STRATEGY.md, @docs/10_MILESTONES.md의 M4, @docs/OPEN_QUESTIONS.md를 읽어라.

M4 범위만 구현하라.
- 일시투자
- 매주·매월 정기 정액매수
- 종가 체결
- 수수료
- 소수점 수량
- 휴장일 또는 데이터 없는 예정일 이월
- 기여 원금, 현금, 수량, 평가액, 손익, 수익률
- MDD 정의를 명확히 확정하고 UI에 사용할 명칭 제공
- 거래 기록과 날짜별 PortfolioSnapshot

Golden Fixture의 기대값을 같은 엔진으로 생성하지 마라. 독립 계산 결과와 일치해야 한다.

AI, 실제 주문, 세금, 슬리피지, 기술지표 전략을 추가하지 마라.

모든 검증을 실행하고 PROJECT_STATE, Decision Log, Open Questions를 갱신하라.
```
