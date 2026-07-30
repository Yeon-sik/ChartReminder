# Provider: Binance (암호화폐 일봉)

docs/09_SECURITY_AND_DATA_LICENSING.md §5의 기록 의무 항목. 2026-07-31 공식 문서와 실 API 재확인 기준.

## 데이터 의미

- 데이터 소유자·API 공급자: Binance
- 이 앱이 표시하는 가격은 "암호화폐 전체 시장의 유일한 가격"이 아니라 **선택한 Binance 현물 USDT 거래쌍의 시장 가격**이다. UI에 거래쌍과 출처를 명시한다.
- 과거 일봉(historical klines). 실시간 스트리밍은 사용하지 않는다.
- 종목 탐색 범위는 `TRADING` 상태이며 SPOT 거래가 허용된 USDT 거래쌍이다. 2026-07-31 실측 시 480개였고 상장·상장폐지에 따라 변할 수 있다.

## 엔드포인트

- `GET /api/v3/exchangeInfo?permissions=SPOT&symbolStatus=TRADING&showPermissionSets=false` — 전체 탐색 카탈로그, 인증·API 키 불필요, 요청 weight 20
- `GET /api/v3/klines` — 인증·API 키 불필요
- 기본 base URL: `https://data-api.binance.vision` (공개 시장 데이터 전용). 대체: `https://api.binance.com` 등
- 파라미터: `symbol`, `interval=1d`, `startTime`/`endTime`(ms), `limit`(기본 500, 최대 1000)
- 응답: 12원소 배열의 배열. `[openTime, open, high, low, close, volume, closeTime, quoteVolume, trades, takerBase, takerQuote, ignore]` — 가격·거래량은 문자열
- 요청 weight: 2 (IP 기준)
- `exchangeInfo` 결과는 앱 프로세스 메모리에 15분 캐시한다. 검색어를 입력할 때마다 API를 다시 호출하지 않으며 동시 검색은 진행 중인 요청 하나를 공유한다.

## 호출 제한

- IP 기준 weight 제한. 사용량은 `X-MBX-USED-WEIGHT-*` 응답 헤더로 확인
- HTTP 429: 제한 초과. `Retry-After`(초) 준수 후 재시도
- HTTP 418: 반복 위반으로 IP ban(2분~3일). **재시도 금지**, 사용자에게 알림
- 앱 정책: 제한된 횟수의 지수 백오프, 429의 Retry-After 우선, 418 즉시 중단

## 이용조건

- 무료/유료: 공개 시장 데이터 엔드포인트는 무료, 키 불필요
- 개인 사용: 허용 (Binance API 이용약관 범위 내)
- 캐시: 사용자 로컬 SQLite에만 저장. 앱 바이너리에 데이터를 내장하지 않음
- 재배포: 하지 않음. 각 사용자가 자신의 기기에서 직접 Binance API를 호출한다
- 출처 표시: UI와 내보내기 파일에 "Binance, BTC/USDT" 형식으로 표시
- 근거 문서: https://github.com/binance/binance-spot-api-docs/blob/master/rest-api.md#exchange-information, https://github.com/binance/binance-spot-api-docs/blob/master/faqs/market_data_only.md, Binance 이용약관 https://www.binance.com/en/terms
- 공개 릴리스 게이트(docs/09 §6): 위 정책이 바뀌면 릴리스 전 재확인

## 정규화 규칙

- 거래일: `openTime`의 UTC 달력일
- `closeTime`은 Binance가 주는 값(개장 + 86,399,999ms)을 그대로 보존
- 가격·거래량 문자열을 DecimalString으로 검증 후 저장. number 변환 없음
- 요청 범위 밖 응답은 절단, 중복 제거, 오름차순 정렬 후 OHLC 불변조건 검증
- `exchangeInfo`의 `symbol`·`baseAsset`·`quoteAsset`·`status`를 런타임 검증하고 공통 `Instrument`로 변환한다. BTC·ETH·SOL은 기존 표시명과 ID를 보존하며 그 외 종목은 base asset 코드를 표시명으로 쓴다.
