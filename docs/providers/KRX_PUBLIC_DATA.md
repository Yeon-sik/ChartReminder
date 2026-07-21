# Provider: 공공데이터포털(data.go.kr) 한국 주식 일봉, BYOK

docs/09_SECURITY_AND_DATA_LICENSING.md §5의 기록 의무 항목. 2026-07-21 WebSearch/WebFetch로 확인한 공식 문서·커뮤니티 자료 기준(D-017, OQ-005 RESOLVED).

## 데이터 의미

- 데이터 소유자: 한국거래소(KRX). API 제공기관: 금융위원회(공공데이터포털 경유)
- 서비스명: "금융위원회_주식시세정보"(`GetStockSecuritiesInfoService`)
- 과거 일봉(EOD)만 제공한다. 기준일로부터 익영업일 오후 1시 이후 갱신되므로 실시간·당일 시세가 아니다(리플레이 앱 특성상 이 지연은 문제되지 않는다)
- **원시 시세만 제공한다 — 수정주가(분할·배당 조정가)는 이 API에 없다.** 모든 캔들의 `adjustedClose`는 undefined, `source.priceBasis`는 `"raw"`다. 시뮬레이션 엔진은 `adjustedClose` 부재 시 원시 종가로 폴백한다(M4, `simulationTimeline.ts`) — 사용자가 "수정주가" 배당 정책을 선택해도 앱이 오류를 내지 않지만, 실제로는 원시 종가로 계산된다는 점을 UI에서 감출 수 없다(가정 표시 원칙, `docs/00`)
- **BYOK(Bring-Your-Own-Key)** — 이 앱은 데이터를 재배포하지 않는다. 각 사용자가 공공데이터포털에 직접 가입해 발급받은 자신의 무료 서비스 키를 앱에 입력하고, 앱은 그 키로 사용자 자신의 조회만 대행한다(D-017, D-015와 동일 원칙)

## 엔드포인트

- `GET https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo`
- 쿼리 파라미터: `serviceKey`(인증키), `resultType=json`, `numOfRows`, `pageNo`, `likeSrtnCd`(6자리 단축코드), `beginBasDt`/`endBasDt`(`YYYYMMDD`, 포함 범위)
- 인증: `serviceKey` 쿼리 파라미터. 공공데이터포털은 "Encoding"(이미 URL 인코딩된 값)과 "Decoding"(원문 값) 두 종류의 키를 함께 발급한다 — 이 앱은 URL을 만들 때 항상 `encodeURIComponent`를 적용하므로, **사용자는 "Decoding"(일반 인증키, 평문) 값을 입력해야 한다.** Encoding 키를 그대로 입력하면 이중 인코딩으로 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`가 난다 — `ProviderApiKeyField`의 안내 문구에 반영
- 응답: data.go.kr 표준 OpenAPI 봉투. `response.header.resultCode`/`resultMsg`, `response.body.totalCount`, `response.body.items.item`(배열 또는 단일 객체 — 항목이 1개면 배열이 아니라 단일 객체로 올 수 있어 방어적으로 배열화한다). 필드: `basDt`(YYYYMMDD), `srtnCd`(단축코드), `itmsNm`(종목명), `mkp`(시가), `hipr`(고가), `lopr`(저가), `clpr`(종가), `trqu`(거래량, 선택)
- CORS 미지원(공공데이터포털 API 일반적으로 브라우저 직접 호출 시 CORS 오류가 나 서버/네이티브 프록시가 필요하다는 점이 다수 커뮤니티 자료로 확인됨) — Tiingo와 동일하게 `tauri-plugin-http` 기반 `tauriHttpClient`만 사용하며, 브라우저 프리뷰에는 이 Provider를 등록하지 않는다

## 호출 제한과 관찰된 동작

- 개발계정: 일 10,000회. 운영계정은 활용사례 등록 신청 시 트래픽 증량 가능(공식 페이지 기준, 2026-07-21)
- **resultCode 매핑**(data.go.kr 플랫폼 공통 `OpenAPI_ServiceResult` 표준 — 이 서비스 전용 문서가 아니라 플랫폼 공통 규격에 근거한 매핑이므로, 실제 서비스 키로 호출해 재확인이 필요한 항목으로 남긴다):
  - `00`: 정상
  - `03`: NODATA — 오류가 아니라 빈 결과로 처리(상장 이전·전체 휴장 구간 등)
  - `22`: 서비스 요청 제한 횟수 초과 — `ProviderRateLimitError`(재시도 안 함, 계정 단위 일일 한도)
  - `20`/`21`/`30`/`31`/`32`/`33`: 서비스 접근 거부·키 미등록·미서명 등 — `ProviderAuthError`
  - `04`/`05`: HTTP_ERROR/SERVICETIME_OUT — `ProviderNetworkError`(재시도 대상)
  - 그 외: `ProviderResponseError`
- 앱 정책: 5xx·네트워크 오류는 지수 백오프 재시도, 인증·응답 형식·rate limit 오류는 즉시 실패(재시도로 해결되지 않음) — Tiingo·Binance와 동일 원칙

## 이용조건

- 무료/유료: 무료. 공공데이터포털 "활용신청"이 개발·운영 단계 모두 자동승인
- 개인 사용: data.go.kr 개인 계정으로 발급. 이용허락범위 "제한 없음"으로 명시(공식 페이지 기준)
- 재배포: **하지 않음**. Tiingo(D-015)와 동일하게 BYOK로 재배포 관계 자체가 발생하지 않도록 설계
- 캐시: 사용자 로컬 SQLite에만 저장. 앱 바이너리에 데이터를 내장하지 않음
- 출처 표시: UI와 내보내기 파일에 "한국거래소(공공데이터포털 경유)" 출처를 명시
- API 키 저장: Windows 자격 증명 관리자(Rust `keyring` crate, Tiingo와 동일 경로 재사용) — 평문 SQLite·파일에 저장하지 않는다(D-015, D-016, docs/09 §2)
- 근거 문서: https://www.data.go.kr/data/15094808/openapi.do (서비스 개요·활용신청·트래픽), 공공데이터포털 공통 OpenAPI 오류 규격(플랫폼 전반에서 재사용되는 `resultCode` 표)
- 공개 릴리스 게이트(docs/09 §6): BYOK 모델이라 이 앱의 상업적 재배포 권한 여부와 무관하게 동작. 다만 이 문서의 `resultCode` 매핑과 응답 봉투 구조는 실 서비스 키로 아직 검증하지 못했다(이 세션에 실 키가 없음) — 사용자가 실 키로 1회 확인 필요(PROJECT_STATE 남은 위험 참고)

## 정규화 규칙

- 거래일: `basDt`(`YYYYMMDD`)를 `YYYY-MM-DD`로 변환해 그대로 거래일로 사용한다 — 이 API의 일봉 하루가 곧 KRX 거래일이므로 별도 시간대 변환이 필요 없다
- `openTimeUtcMs`는 해당 거래일의 UTC 자정, `closeTimeUtcMs`는 다음 날 UTC 자정 직전(Binance·Tiingo와 동일한 내부 표현 관례 — 실제 KST 개장 시각을 뜻하지 않는다)
- 가격·거래량은 JSON 숫자 또는 숫자 문자열로 올 수 있어 두 형태 모두 받아들이고, 도메인 경계 진입 시 `DomainDecimal`을 거쳐 `DecimalString`으로 변환한다
- `close`는 `clpr`(원시 종가). `adjustedClose`는 항상 undefined(이 API에 수정주가 없음). `source.priceBasis`는 `"raw"`
- `likeSrtnCd`는 LIKE 검색이라 이론상 다른 코드가 섞여 들어올 수 있어, 응답 행의 `srtnCd`가 요청한 `providerSymbol`과 다르면 버린다
- 요청 범위 밖 응답은 절단, 중복 제거(같은 날짜는 마지막 관측 우선), 오름차순 정렬 후 OHLC 불변조건 검증(Binance·Tiingo와 동일 계약)
- 페이지네이션: `numOfRows`/`pageNo`로 전체 결과를 모아 결합한다. `totalCount`에 못 미치고 페이지가 끝나면(빈 페이지) `ProviderResponseError`로 실패한다 — 부분 데이터를 전체로 위장하지 않는다
