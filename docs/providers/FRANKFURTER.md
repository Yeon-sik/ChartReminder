# Provider: Frankfurter (USD/KRW 현재 환율)

docs/09_SECURITY_AND_DATA_LICENSING.md §5의 기록 의무 항목. 2026-07-21 WebFetch·curl 실측 기준(D-020, OQ-006 RESOLVED).

## 데이터 의미

- 84개 중앙은행 데이터를 취합한 "blended"(혼합) 환율. 특정 한 기관의 공식 고시환율이 아니라 여러 출처를 조합한 참고값이다
- **표시/입력 통화 변환 전용** — 시뮬레이션 엔진·캔들 캐시는 이 값을 전혀 모른다. 사용자가 화면에서 KRW/USD(USDT)로 보거나 투자 금액을 입력할 때만 쓰인다(D-020)
- "현재 환율"만 제공한다 — 과거 날짜별 정합(historical FX matching)은 이 앱 범위 밖이다(OQ-006이 처음 우려했던 "날짜 정합성" 문제는 표시 전용 변환으로 범위를 좁혀 회피)
- 일별 기준(각 중앙은행이 영업일마다 1회 고시) — 실시간 시세가 아니다

## 엔드포인트

- `GET https://api.frankfurter.dev/v2/rate/USD/KRW`
- 인증 불필요. 쿼리 파라미터 없음(단일 통화쌍 고정 경로)
- 응답 예: `{"date":"2026-07-21","base":"USD","quote":"KRW","rate":1482.6}`
- CORS 지원 확인(curl로 `Origin` 헤더 포함 요청 시 `access-control-allow-origin: *` 응답) — Tiingo·공공데이터포털과 달리 `tauri-plugin-http`가 필요 없다. 기존 `fetchHttpClient`(webview/브라우저 fetch)로 Tauri·브라우저 프리뷰 모두에서 동작한다

## 호출 제한과 캐시 정책

- 공식 문서: "There are no quotas. Requests are rate-limited to prevent abuse, but there are no monthly or daily caps." — 월/일 한도 없음, 남용 방지 rate-limit만 존재
- 앱 정책: `FrankfurterFxRateProvider`가 1시간 in-memory 캐시를 둔다(`maxAgeMs`, 기본 3,600,000ms) — 세션 중 반복 호출을 줄이고, 설정 화면의 "새로고침" 버튼은 `forceRefresh`로 캐시를 무시한다
- 5xx·네트워크 오류는 `FxRateError("network")`, 응답 스키마 이상은 `FxRateError("invalid-response")`로 구분한다(재시도 로직은 두지 않는다 — 표시 전용 값이라 실패 시 사용자가 명확한 오류를 보고 다시 시도하면 충분, 과설계 방지)

## 이용조건

- 무료: 완전 무료, API 키 불필요
- 상업적 사용: 공식 FAQ에서 명시적으로 허용("Yes, absolutely")
- 재배포·캐시: 공식 문서에 명시적 조항은 없으나, 대량 사용 시 "caching responses, self-hosting, or querying the datasets directly"를 권장 — 이 앱의 1시간 캐시 정책과 부합
- 출처 표시: 공식적으로 의무화된 문구는 없음. 이 앱은 화면에 "Frankfurter" 출처와 환율 기준일을 함께 표시해 투명성을 유지한다
- 근거 문서: https://frankfurter.dev/ (개요·FAQ), `https://api.frankfurter.dev/v2/providers`(원천 데이터 제공 84개 중앙은행 목록, curl로 확인)
- 공개 릴리스 게이트(docs/09 §6): 상업적 사용이 명시적으로 허용되고 키가 필요 없어 게이트에 걸리지 않는다

## 정규화 규칙

- 응답의 `rate`(JSON 숫자)를 `DomainDecimal`을 거쳐 `DecimalString`(`UsdKrwRate.krwPerUsd`)으로 변환
- 응답의 `date`(`YYYY-MM-DD`)를 그 날짜의 UTC 자정으로 `asOfUtcMs`에 매핑(Binance·Tiingo·공공데이터포털과 동일한 내부 표현 관례)
- **USD/USDT 1:1 가정**(D-020, 사용자 명시): 이 Provider는 USD/KRW만 조회하고, USDT는 도메인 계층(`src/domain/shared/fxConversion.ts`)에서 USD와 동일하게 취급한다 — Frankfurter에 USDT 조회를 별도로 하지 않는다(USDT는 ISO 4217 통화가 아니라 애초에 이 API가 다루지 않음)
