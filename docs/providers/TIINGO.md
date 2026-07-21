# Provider: Tiingo (미국 주식 일봉, BYOK)

docs/09_SECURITY_AND_DATA_LICENSING.md §5의 기록 의무 항목. 2026-07-19 공식 문서·ToS 기준(D-015, OQ-004 RESOLVED).

## 데이터 의미

- 데이터 소유자·API 공급자: Tiingo
- 과거 일봉(EOD, end-of-day). 실시간 스트리밍은 사용하지 않는다.
- 원시 종가(raw close)와 수정 종가(adjusted close, 분할·배당 반영)를 모두 제공한다 — UI/도메인에서 두 값을 분리해 표시한다(docs/03 §6).
- **BYOK(Bring-Your-Own-Key)** — 이 앱은 Tiingo 데이터를 재배포하지 않는다. 각 사용자가 Tiingo에 직접 가입해 발급받은 자신의 무료 키를 앱에 입력하고, 앱은 그 키로 사용자 자신의 조회만 대행한다(D-015).

## 엔드포인트

- `GET https://api.tiingo.com/tiingo/daily/<ticker>/prices?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&format=json`
- 인증: `Authorization: Token <API 키>` 헤더 (curl로 잘못된 키에 `403 {"detail":"Invalid token."}` 확인). 쿼리 파라미터 `?token=`도 공식적으로 지원하지만, URL이 로그에 남기 쉬워 헤더를 사용한다(docs/09 §2)
- 응답: 날짜별 객체 배열. `date`(ISO), `open/high/low/close/volume`(원시, JSON 숫자), `adjOpen/adjHigh/adjLow/adjClose/adjVolume`(수정), `divCash`(배당), `splitFactor`(분할 비율)
- CORS 미지원 확인(curl에 `Origin` 헤더를 보내도 `Access-Control-Allow-Origin` 미응답) — 브라우저/webview `fetch`로 호출 불가. `tauri-plugin-http` 기반 `tauriHttpClient`만 사용하며, 브라우저 프리뷰(`isTauri() === false`)에서는 이 Provider를 등록하지 않는다

### 종목 검색 (D-021)

- `GET https://api.tiingo.com/tiingo/utilities/search?query=<검색어>` — 같은 `Authorization: Token` 헤더 인증. 2026-07-21 실 키로 curl 확인(정상 동작)
- 공식 문서(`https://www.tiingo.com/documentation/utilities/search`)가 "early beta"로 표시하고 있다 — 향후 응답 형태가 바뀔 수 있어 방어적으로 파싱한다(`normalizeSearchResults`, 알 수 없는 필드는 무시)
- 응답: 래핑 없는 JSON 배열. 필드 `ticker`, `name`, `assetType`(`"Stock"`/`"ETF"`/`"Mutual Fund"`), `isActive`, `countryCode`. `exchange` 필드는 없다 — 검색 결과 `Instrument.market`은 큐레이션 목록과 달리 `"US"` 일반값을 쓴다
- 같은 티커가 여러 `countryCode`로 중복될 수 있다(예: `AAPL`이 `US`·`CA` 둘 다) — 이 앱은 `countryCode === "US"`이고 `assetType === "Stock"`인 것만 남긴다(docs/00 범위: 미국 주식만)
- 빈 질의는 네트워크 요청 없이 큐레이션된 대형주 5종(기존 목록)을 그대로 보여준다 — 검색은 실제 입력이 있을 때만 호출한다

## 호출 제한과 관찰된 동작

- 무료 "Starter" 티어: 월 500 심볼, 시간당 50회, 일 1,000회, 월 1GB 대역폭 (2026-07-19 pricing 페이지 기준)
- **문서화되지 않은 동작**: 계정 할당량 초과 시 HTTP 상태는 `200`을 유지한 채 평문(비-JSON) 본문(`"You have run over your ... limits increased."` 형태)을 반환하는 사례가 확인됨(Tiingo Python 클라이언트의 GitHub 이슈로 확인, Tiingo 공식 문서에는 없음). `TiingoProvider`는 JSON 파싱 실패 시 본문에 할당량 관련 문구(`limit`, `upgrade`)가 있으면 `ProviderRateLimitError`로, 없으면 `ProviderResponseError`로 분류한다 — 이 휴리스틱은 관찰 기반이라 문구가 바뀌면 갱신이 필요하다
- `403`은 키 미설정·무효로 간주해 `ProviderAuthError`로 매핑한다(재시도하지 않음)
- 앱 정책: 5xx·네트워크 오류는 지수 백오프 재시도, 인증·응답 형식·rate limit 오류는 즉시 실패(재시도로 해결되지 않음)

## 이용조건

- 무료/유료: EOD 일봉은 무료 "Starter" 티어에 포함. 유료 "Power"(월 $30)는 호출량만 늘어남
- 개인 사용: 개인(Individual) 계정 범위에서 허용. 조직·비즈니스 용도는 Tiingo 자체 Commercial 플랜이 필요(Tiingo ToS가 계정 생성 시점에 구분)
- 재배포: **하지 않음**. 이 앱은 사용자 자신의 키로 사용자 자신의 조회만 대행한다(BYOK) — Tiingo의 "내부 소비 전용" 제약과 재배포 승인·추가 비용 요구를 정면으로 우회하지 않고, 애초에 재배포 관계 자체가 발생하지 않도록 설계했다
- 캐시: 사용자 로컬 SQLite에만 저장. 앱 바이너리에 데이터를 내장하지 않음
- 출처 표시: UI와 내보내기 파일에 "Tiingo" 출처를 명시. Tiingo가 재배포 허가 시 요구하는 표준 문구는 `"Data sourced by Tiingo"` + `https://www.tiingo.com` 링크이나, 이 앱은 재배포하지 않으므로 필수 요건은 아니다 — 그래도 출처 투명성을 위해 표시한다
- API 키 저장: Windows 자격 증명 관리자(Rust `keyring` crate) — 평문 SQLite·파일에 저장하지 않는다(D-015, docs/09 §2). 개발 편의로 저장소 루트 `.env`의 `TIINGO_API_KEY`가 있으면 자동 적용되지만, 이 값은 Rust 런타임에서만 읽고 배포 바이너리에는 포함되지 않는다(D-018)
- 근거 문서: https://www.tiingo.com/documentation/end-of-day (엔드포인트), https://www.tiingo.com/documentation/general/connecting (인증), https://www.tiingo.com/about/pricing (요금제), https://app.tiingo.com/tos/ (이용약관)
- 공개 릴리스 게이트(docs/09 §6): BYOK 모델 자체가 이 앱의 상업적 재배포 권한 여부와 무관하게 동작하므로 게이트에 걸리지 않는다. 다만 Tiingo가 BYOK 방식 자체를 금지하는 방향으로 ToS를 바꾸면 재검토 필요(D-015 재검토 조건)

## 정규화 규칙

- 거래일: Tiingo가 반환하는 `date`의 달력 부분(`YYYY-MM-DD`)을 그대로 거래일로 사용한다 — Tiingo의 일봉 하루가 곧 NYSE/NASDAQ 거래일이므로 별도 시간대 변환이 필요 없다
- `openTimeUtcMs`는 해당 거래일의 UTC 자정, `closeTimeUtcMs`는 다음 날 UTC 자정 직전(Binance와 동일한 내부 표현 관례)
- 가격·거래량은 Tiingo 응답에서 JSON 숫자로 오므로, 도메인 경계 진입 시 `DomainDecimal`을 거쳐 `DecimalString`으로 변환한다(문자열 그대로 오는 Binance와 다름)
- `close`는 원시 종가, `adjustedClose`는 Tiingo의 `adjClose`. `source.priceBasis`는 `"raw"`(주 OHLC 기준이 원시가라는 뜻) — 수정주가 사용 여부는 `SimulationConfig.dividendPolicy === "adjusted-price"`로 사용자가 선택한다(M4에서 이미 구현된 `useAdjustedClose` 폴백 로직 재사용, 신규 로직 없음)
- 요청 범위 밖 응답은 절단, 중복 제거(같은 날짜는 마지막 관측 우선), 오름차순 정렬 후 OHLC 불변조건 검증(Binance와 동일 계약)
