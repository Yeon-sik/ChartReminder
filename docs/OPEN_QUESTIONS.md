# Open Questions

결정되지 않은 사안을 이 파일에서 관리한다. Claude가 임의로 제품 결정을 확정하지 않는다.

## OQ-001 제품명

- 상태: RESOLVED (2026-07-21, D-016 — D-014의 "CashOS" 결정을 대체)
- 결정: 표시명 "Chart Reminder" (README, GOAL, 창 제목, 앱 내 표기, 내보내기 파일 헤더 전체 반영)
- 유지: Tauri identifier `com.investmentreplay.dev`, npm 패키지명 `investment-replay`, Cargo 패키지명, SQLite DB 파일명은 변경하지 않음(D-016 — 재설치·데이터 경로 단절 방지가 표시명 변경보다 우선)

## OQ-002 패키지 매니저

- 상태: RESOLVED (2026-07-14, D-006)
- 결정: npm
- 근거: 단일 앱 저장소에는 npm으로 충분하고 Tauri 공식 스캐폴딩 기본 경로와 일치

## OQ-003 암호화폐 기준 거래쌍

- 상태: RESOLVED (2026-07-14, D-010)
- 결정: USDT 기준 (Binance BTCUSDT·ETHUSDT·SOLUSDT)
- 근거: Binance 공개 API에 USD 현물 쌍이 없음. UI에 해당 공급자의 USDT 시장 가격임을 명시

## OQ-004 미국 주식 데이터 공급자

- 상태: RESOLVED (2026-07-19, D-015)
- 결정: Tiingo, BYOK(Bring-Your-Own-Key) 모델 — 사용자가 자신의 무료 개인 키를 앱에 입력
- 근거 요약(상세 조사는 D-015 참조): 검토한 모든 공급자(Alpha Vantage, Tiingo, Twelve Data, Financial Modeling Prep)가 "본인 자신의 이용"과 "앱이 불특정 최종사용자에게 데이터를 재배포"를 구분하며 후자는 유료·별도 계약을 요구함(docs/09 §5). BYOK로 각 사용자 본인의 개인 이용 범위 안에 들어오게 해 무료 티어로 합법적으로 운영
- Tiingo 선택 이유: 무료 "Starter" 티어가 수정주가(adjOpen/High/Low/Close, splitFactor, divCash)를 원시가와 같은 응답에 포함 — 조사한 다른 공급자는 수정주가가 유료 전용이거나 확인 불가

## OQ-005 한국 주식 데이터 공급자와 공개 범위

- 상태: RESOLVED (2026-07-21, D-017)
- 결정: 공공데이터포털(data.go.kr) "금융위원회_주식시세정보", BYOK(Bring-Your-Own-Key) 모델 — 사용자가 자신의 무료 개인 키를 앱에 입력
- 근거 요약(상세는 D-017 참조): 한국투자증권 Open API는 무료지만 증권 계좌 개설이 전제 조건이라 BYOK 진입장벽이 지나치게 높음. 공공데이터포털은 개인 계정만으로 자동승인 발급되고 "이용허락범위 제한없음"이 명시되어 있어 D-015(Tiingo)와 같은 BYOK 논리를 그대로 적용 가능
- 알려진 한계: 이 API는 수정주가(분할·배당 조정가)를 제공하지 않는다(원시 시세만) — `docs/providers/KRX_PUBLIC_DATA.md` 참고

## OQ-006 교차 통화 비교

- 상태: RESOLVED (2026-07-21, D-020)
- 결정: 표시/입력 경계 전용 "현재 환율" 변환 — 시뮬레이션 엔진·캔들 캐시는 항상 자산 고유 통화를 그대로 쓰고, 화면 표시와 통합 투자 금액 입력에서만 사용자가 고른 표시 통화(KRW 또는 USD)로 환산한다
- 근거: 애초에 우려했던 "날짜 정합성"은 과거 날짜별 환율이 아니라 현재 환율 하나만 요구되면서 필요 없어짐(사용자가 명시적으로 "현재 환율"만 요청). FX 공급자는 Frankfurter(무료, 키 불필요, CORS 열림) 채택 — 상세는 D-020·`docs/providers/FRANKFURTER.md` 참고
- 가정: USD와 USDT는 1:1로 간주(사용자 명시)

## OQ-007 MDD 정의

- 상태: RESOLVED (2026-07-14, D-012)
- 결정: 가격 기준 MDD("가격 최대 낙폭")를 기본 제공하고, 총자산 기준 MDD("총자산 최대 낙폭 · 기여금 유입 미조정")를 별도 표기. 스냅샷의 drawdownRate는 총자산 기준. 단위가치(시간가중) MDD는 MVP 이후

## OQ-008 앱 자동 업데이트

- 상태: DEFERRED
- Crypto Alpha 설치 검증 후 평가
