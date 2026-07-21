# Provider: 공공데이터포털(data.go.kr) 한국 주식 일봉, BYOK

docs/09_SECURITY_AND_DATA_LICENSING.md §5의 기록 의무 항목. 2026-07-21 WebSearch/WebFetch로 확인한 공식 문서·커뮤니티 자료 기준(D-017, OQ-005 RESOLVED). 같은 날 사용자의 실 서비스 키로 성공 경로(엔드포인트·인증·응답 스키마·`endBasDt` 경계)를 직접 호출해 재확인했다(D-019) — 자세한 내용은 아래 각 절 참고.

## 데이터 의미

- 데이터 소유자: 한국거래소(KRX). API 제공기관: 금융위원회(공공데이터포털 경유)
- 서비스명: "금융위원회_주식시세정보"(`GetStockSecuritiesInfoService`)
- 과거 일봉(EOD)만 제공한다. 기준일로부터 익영업일 오후 1시 이후 갱신되므로 실시간·당일 시세가 아니다(리플레이 앱 특성상 이 지연은 문제되지 않는다)
- **원시 시세만 제공한다 — 수정주가(분할·배당 조정가)는 이 API에 없다.** 모든 캔들의 `adjustedClose`는 undefined, `source.priceBasis`는 `"raw"`다. 시뮬레이션 엔진은 `adjustedClose` 부재 시 원시 종가로 폴백한다(M4, `simulationTimeline.ts`) — 사용자가 "수정주가" 배당 정책을 선택해도 앱이 오류를 내지 않지만, 실제로는 원시 종가로 계산된다는 점을 UI에서 감출 수 없다(가정 표시 원칙, `docs/00`)
- **BYOK(Bring-Your-Own-Key)** — 이 앱은 데이터를 재배포하지 않는다. 각 사용자가 공공데이터포털에 직접 가입해 발급받은 자신의 무료 서비스 키를 앱에 입력하고, 앱은 그 키로 사용자 자신의 조회만 대행한다(D-017, D-015와 동일 원칙)

## 엔드포인트

- `GET https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo`
- 쿼리 파라미터: `serviceKey`(인증키), `resultType=json`, `numOfRows`, `pageNo`, `likeSrtnCd`(6자리 단축코드), `beginBasDt`/`endBasDt`(`YYYYMMDD`)
- **`beginBasDt`는 포함, `endBasDt`는 배타적이다(실측 확인, 2026-07-21, D-019)** — 흔한 문서·커뮤니티 서술("포함 범위")과 다르다. `beginBasDt=20260720&endBasDt=20260720`(같은 날)과 `beginBasDt=20260718&endBasDt=20260720`(종료일에 그 날짜 포함 의도)은 실제로 07-20 데이터를 반환하지 않았고, `endBasDt=20260721`이어야 07-20이 포함됐다 — 반개구간 `[beginBasDt, endBasDt)`. `KrxPublicDataProvider`는 도메인의 반개구간 `range`를 날짜 변환 없이 그대로 두 파라미터에 전달한다(우연히 정확히 일치)
- 인증: `serviceKey` 쿼리 파라미터. 공공데이터포털은 "Encoding"(이미 URL 인코딩된 값)과 "Decoding"(원문 값) 두 종류의 키를 함께 발급한다 — 이 앱은 URL을 만들 때 항상 `encodeURIComponent`를 적용하므로, **사용자는 "Decoding"(일반 인증키, 평문) 값을 입력해야 한다.** Encoding 키를 그대로 입력하면 이중 인코딩으로 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`가 난다 — `ProviderApiKeyField`의 안내 문구에 반영
- **엔드포인트는 오퍼레이션 경로(`/getStockPriceInfo`)까지 정확히 가리켜야 한다** — 서비스 루트(`.../GetStockSecuritiesInfoService`)까지만 주면 요청 자체가 성립하지 않는다(사용자가 `.env`의 `OPEN_API_ENDPOINT`를 서비스 루트로 넣어 실제로 겪은 오류, D-019). `KrxPublicDataProvider`는 `baseUrl` 오버라이드가 `/getStockPriceInfo`로 끝나지 않으면 자동으로 붙여 방어한다
- 응답: data.go.kr 표준 OpenAPI 봉투. `response.header.resultCode`/`resultMsg`, `response.body.totalCount`, `response.body.items.item`. 실측(2026-07-21)으로는 `totalCount=1`일 때도 `item`이 배열로 왔다 — 다만 다른 계정·응답 조건에서 단일 객체로 올 가능성을 배제할 수 없어 코드는 두 형태 모두 방어적으로 처리한다. 필드: `basDt`(YYYYMMDD), `srtnCd`(단축코드), `itmsNm`(종목명), `mkp`(시가), `hipr`(고가), `lopr`(저가), `clpr`(종가), `trqu`(거래량, 선택) — 실측 결과 이 숫자 필드들은 JSON 숫자가 아니라 **숫자 문자열**로 온다(예: `"clpr": "244000"`). `KrxPublicDataProvider`는 숫자·숫자 문자열을 모두 받아들인다
- CORS 미지원(공공데이터포털 API 일반적으로 브라우저 직접 호출 시 CORS 오류가 나 서버/네이티브 프록시가 필요하다는 점이 다수 커뮤니티 자료로 확인됨) — Tiingo와 동일하게 `tauri-plugin-http` 기반 `tauriHttpClient`만 사용하며, 브라우저 프리뷰에는 이 Provider를 등록하지 않는다

### 종목 검색 (D-021)

- `GET https://apis.data.go.kr/1160100/service/GetKrxListedInfoService/getItemInfo` — **가격 조회와는 다른 서비스**("금융위원회_KRX상장종목정보")다. 같은 `serviceKey`라도 이 서비스를 공공데이터포털에서 별도로 "활용신청"하지 않았으면 쓸 수 없다
- **실 키로 확인된 중요한 함정(2026-07-21)**: 가격 조회 서비스만 활용신청된 키로 이 검색 엔드포인트를 호출하면 JSON `resultCode` 오류가 아니라 **HTTP `403`과 평문 바디 `"Forbidden"`**이 온다(게이트웨이 단계 거부로 보임 — JSON을 만들어주는 백엔드까지 요청이 도달하지 않는다). `KrxPublicDataProvider`는 이 경우를 `ProviderAuthError`로 매핑하고 "이 오픈API가 활용신청되어 있는지 확인하라"는 안내를 포함한다. **이 앱을 쓰는 사용자가 검색 기능을 쓰려면 data.go.kr에서 "금융위원회_KRX상장종목정보"를 별도로 활용신청해야 한다**(가격 조회용 신청과 별개, 자동승인으로 보임 — 가격 서비스와 동일 페이지 구조)
- 쿼리 파라미터: `serviceKey`, `resultType=json`, `numOfRows`, `pageNo`, `basDt`(YYYYMMDD, **필수** — 생략하면 전체 상장 이력이 수백만 건 반환될 수 있다는 경고가 커뮤니티 코드에 있음), `likeItmsNm`(종목명 부분검색)
- `KrxPublicDataProvider`는 정확한 "가장 최근 거래일"을 계산하지 않고 `basDt`를 현재로부터 7일 전으로 고정한다 — 휴장일 처리를 피하는 단순화이며, 종목명·코드는 며칠 사이 거의 바뀌지 않는다는 전제다
- 응답 필드: `itmsNm`(종목명), `corpNm`(법인명), `srtnCd`(단축코드), `crno`(법인등록번호), `mrktCtg`(시장구분) — 같은 data.go.kr 표준 봉투(`response.header/body`)를 재사용한다
- **`srtnCd`에 "A" 접두사가 붙을 수 있다(가격 조회 API와 다름)** — 커뮤니티 소스 코드(`getkrxcode` 프로젝트)가 `srtnCd`에서 `^A`를 제거하는 것으로 보아 이 서비스의 코드 형식이 가격 서비스(순수 6자리 숫자, 실측 확인됨)와 다를 가능성이 있다. 이 앱은 `/^A\d{6}$/` 패턴이면 접두사를 제거하도록 방어적으로 처리했지만, **활용신청 문제로 이 서비스 자체를 실 키로 호출해 응답 형태를 직접 확인하지는 못했다** — 사용자가 활용신청 후 검색을 1회 사용해 봐야 최종 확인된다
- 빈 질의는 네트워크 요청 없이 큐레이션된 대형주 5종(기존 목록)을 그대로 보여준다

## 호출 제한과 관찰된 동작

- 개발계정: 일 10,000회. 운영계정은 활용사례 등록 신청 시 트래픽 증량 가능(공식 페이지 기준, 2026-07-21)
- **resultCode 매핑**(data.go.kr 플랫폼 공통 `OpenAPI_ServiceResult` 표준 — 이 서비스 전용 문서가 아니라 플랫폼 공통 규격에 근거한 매핑):
  - `00`: 정상 — **실측 확인됨**(2026-07-21, `resultMsg: "NORMAL SERVICE."`, 실 서비스 키로 삼성전자 일봉 조회 성공)
  - `03`: NODATA — 오류가 아니라 빈 결과로 처리(상장 이전·전체 휴장 구간 등). 미검증(이 코드가 실제로 반환되는 상황은 아직 재현하지 못함)
  - `22`: 서비스 요청 제한 횟수 초과 — `ProviderRateLimitError`(재시도 안 함, 계정 단위 일일 한도). 미검증
  - `20`/`21`/`30`/`31`/`32`/`33`: 서비스 접근 거부·키 미등록·미서명 등 — `ProviderAuthError`. 미검증
  - `04`/`05`: HTTP_ERROR/SERVICETIME_OUT — `ProviderNetworkError`(재시도 대상). 미검증
  - 그 외: `ProviderResponseError`. 미검증
  - `00` 외 코드는 실 키가 정상 동작해 오류 경로(잘못된 키·한도 초과 등)를 아직 재현하지 못했다 — 문구가 다르면 갱신 필요
- 앱 정책: 5xx·네트워크 오류는 지수 백오프 재시도, 인증·응답 형식·rate limit 오류는 즉시 실패(재시도로 해결되지 않음) — Tiingo·Binance와 동일 원칙

## 이용조건

- 무료/유료: 무료. 공공데이터포털 "활용신청"이 개발·운영 단계 모두 자동승인
- 개인 사용: data.go.kr 개인 계정으로 발급. 이용허락범위 "제한 없음"으로 명시(공식 페이지 기준)
- 재배포: **하지 않음**. Tiingo(D-015)와 동일하게 BYOK로 재배포 관계 자체가 발생하지 않도록 설계
- 캐시: 사용자 로컬 SQLite에만 저장. 앱 바이너리에 데이터를 내장하지 않음
- 출처 표시: UI와 내보내기 파일에 "한국거래소(공공데이터포털 경유)" 출처를 명시
- API 키 저장: Windows 자격 증명 관리자(Rust `keyring` crate, Tiingo와 동일 경로 재사용) — 평문 SQLite·파일에 저장하지 않는다(D-015, D-016, docs/09 §2). 개발 편의로 저장소 루트 `.env`의 `OPEN_API_KEY`/`OPEN_API_ENDPOINT`가 있으면 자동 적용되지만, 이 값은 Rust 런타임에서만 읽고 배포 바이너리에는 포함되지 않는다(D-018)
- 근거 문서: https://www.data.go.kr/data/15094808/openapi.do (가격 조회 서비스 개요·활용신청·트래픽), https://www.data.go.kr/data/15094775/openapi.do (종목 검색 서비스 "금융위원회_KRX상장종목정보"), 공공데이터포털 공통 OpenAPI 오류 규격(플랫폼 전반에서 재사용되는 `resultCode` 표)
- 공개 릴리스 게이트(docs/09 §6): BYOK 모델이라 이 앱의 상업적 재배포 권한 여부와 무관하게 동작. 가격 조회 성공 경로(엔드포인트·인증·응답 스키마·날짜 경계)는 실 서비스 키로 확인됨(2026-07-19, D-019). 종목 검색 서비스는 이 세션에서 활용신청이 안 돼 있어 성공 응답을 직접 보지 못했다(D-021, 403 Forbidden만 확인) — 사용자가 활용신청 후 1회 확인 필요. 오류 경로(`resultCode` 00 외)는 아직 미검증 — PROJECT_STATE 남은 위험 참고

## 정규화 규칙

- 거래일: `basDt`(`YYYYMMDD`)를 `YYYY-MM-DD`로 변환해 그대로 거래일로 사용한다 — 이 API의 일봉 하루가 곧 KRX 거래일이므로 별도 시간대 변환이 필요 없다
- `openTimeUtcMs`는 해당 거래일의 UTC 자정, `closeTimeUtcMs`는 다음 날 UTC 자정 직전(Binance·Tiingo와 동일한 내부 표현 관례 — 실제 KST 개장 시각을 뜻하지 않는다)
- 가격·거래량은 JSON 숫자 또는 숫자 문자열로 올 수 있어 두 형태 모두 받아들이고, 도메인 경계 진입 시 `DomainDecimal`을 거쳐 `DecimalString`으로 변환한다
- `close`는 `clpr`(원시 종가). `adjustedClose`는 항상 undefined(이 API에 수정주가 없음). `source.priceBasis`는 `"raw"`
- `likeSrtnCd`는 LIKE 검색이라 이론상 다른 코드가 섞여 들어올 수 있어, 응답 행의 `srtnCd`가 요청한 `providerSymbol`과 다르면 버린다
- 요청 범위 밖 응답은 절단, 중복 제거(같은 날짜는 마지막 관측 우선), 오름차순 정렬 후 OHLC 불변조건 검증(Binance·Tiingo와 동일 계약)
- 페이지네이션: `numOfRows`/`pageNo`로 전체 결과를 모아 결합한다. `totalCount`에 못 미치고 페이지가 끝나면(빈 페이지) `ProviderResponseError`로 실패한다 — 부분 데이터를 전체로 위장하지 않는다
