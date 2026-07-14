# M7 — 미국 주식 Provider

```text
@CLAUDE.md, @docs/03_MARKET_DATA_SPEC.md, @docs/05_SIMULATION_ENGINE_SPEC.md, @docs/09_SECURITY_AND_DATA_LICENSING.md, @docs/10_MILESTONES.md의 M7, @docs/OPEN_QUESTIONS.md를 읽어라.

코드를 작성하기 전에 현재 사용 가능한 미국 주식 일봉 데이터 공급자 후보를 공식 문서로 비교하라. 다음을 표로 기록하라.
- 전체 과거 일봉 범위
- 수정주가와 분할·배당 처리
- 요청 제한
- 개인·상업 사용
- 캐시와 제3자 화면 표시·재배포 조건
- 가격

이용조건이 확인되지 않으면 Provider를 공개 기능으로 확정하지 마라. 선택 근거를 Decision Log에 기록한 뒤 M7 범위만 구현하라.

필수:
- 미국 주식 Instrument 검색 또는 제한된 symbol 입력
- Provider adapter와 공통 계약 테스트
- 미국 거래일과 exchange timezone
- raw close/adjusted close 의미 분리
- USD와 기존 암호화폐 비교 시 정규화 수익률 기본값
- 데이터 출처와 adjustment mode 표시

교차 통화 원화 환산, 실시간 시세, 실제 주문은 추가하지 마라.

전체 검증을 실행하고 PROJECT_STATE, Open Questions, Risk Register를 갱신하라.
```
