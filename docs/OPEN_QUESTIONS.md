# Open Questions

결정되지 않은 사안을 이 파일에서 관리한다. Claude가 임의로 제품 결정을 확정하지 않는다.

## OQ-001 제품명

- 상태: RESOLVED (2026-07-19, D-014)
- 결정: 표시명 "CashOS" (README, GOAL, 창 제목, 앱 내 표기, 내보내기 파일 헤더 전체 반영)
- 유지: Tauri identifier `com.investmentreplay.dev`, npm 패키지명 `investment-replay`, Cargo 패키지명은 변경하지 않음(D-014 — 재설치·데이터 경로 단절 방지가 표시명 변경보다 우선)

## OQ-002 패키지 매니저

- 상태: RESOLVED (2026-07-14, D-006)
- 결정: npm
- 근거: 단일 앱 저장소에는 npm으로 충분하고 Tauri 공식 스캐폴딩 기본 경로와 일치

## OQ-003 암호화폐 기준 거래쌍

- 상태: RESOLVED (2026-07-14, D-010)
- 결정: USDT 기준 (Binance BTCUSDT·ETHUSDT·SOLUSDT)
- 근거: Binance 공개 API에 USD 현물 쌍이 없음. UI에 해당 공급자의 USDT 시장 가격임을 명시

## OQ-004 미국 주식 데이터 공급자

- 상태: OPEN
- 기준: 수정주가, 과거 일봉 범위, 호출 제한, 상업·재배포 조건, 비용
- M7 전까지 구현 확정 금지

## OQ-005 한국 주식 데이터 공급자와 공개 범위

- 상태: OPEN
- 기준: 개인 계정 사용, 제3자 제공, 공개 앱 배포 조건
- M8 출시 게이트

## OQ-006 교차 통화 비교

- 상태: DEFERRED
- MVP 초기에는 각 자산 원래 통화 또는 정규화 수익률 비교
- KRW 환산을 지원하려면 FX 데이터 공급자와 날짜 정합성이 추가로 필요

## OQ-007 MDD 정의

- 상태: RESOLVED (2026-07-14, D-012)
- 결정: 가격 기준 MDD("가격 최대 낙폭")를 기본 제공하고, 총자산 기준 MDD("총자산 최대 낙폭 · 기여금 유입 미조정")를 별도 표기. 스냅샷의 drawdownRate는 총자산 기준. 단위가치(시간가중) MDD는 MVP 이후

## OQ-008 앱 자동 업데이트

- 상태: DEFERRED
- Crypto Alpha 설치 검증 후 평가
