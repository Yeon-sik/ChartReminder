# PROJECT STATE

Claude는 각 마일스톤 종료 시 이 파일을 갱신한다. 추측이나 예정사항을 완료로 표시하지 않는다.

## 현재 단계

- 현재 마일스톤: M8 — 한국 주식 Provider
- 상태: DONE
- 마지막 갱신: 2026-07-21

## 완료된 마일스톤

- D-022 — 검색 결과 수 조사·조정 (2026-07-21, D-021 직후 사용자 요청 "전체 주식 중에서 검색")
  - 사용자가 검색 목록이 한정적이라고 지적 — 실측으로 원인을 Provider별로 분리해 확인함(자세한 근거는 D-022 참고)
  - **Tiingo**: 원인이 이 앱 코드가 아니라 **Tiingo 서버 자체가 쿼리당 최대 10건으로 제한**(curl로 "tech"·"bank"·"a" 등 넓은 질의로 확인). 전체 커버리지를 하려면 Tiingo의 벌크 티커 목록(zip, 약 4.9만 US Stock 행)이 필요하지만 회사명이 없어 검색 품질이 떨어짐 — AskUserQuestion으로 확인한 결과 사용자가 **현재 방식(10건 제한) 유지**를 선택
  - **공공데이터포털**: 원인이 이 앱이 스스로 건 `numOfRows=20` — API 자체 제한이 아니었음. **50으로 상향**해 사실상 전체 종목(약 2,600개) 커버
  - 검증: `npm run verify`(482 tests) PASS, 상수 변경만이라 기존 테스트 그대로 통과
- D-021 — 종목 검색 지원, 암호화폐는 기존 유지 (2026-07-21, 정식 마일스톤 번호 없음, D-020 직후 사용자 요청)
  - M7/M8에서 대형주 5종으로 큐레이션했던 Tiingo·공공데이터포털 자산 선택을 실제 검색으로 확장. Binance(암호화폐)는 사용자 명시 요청대로 BTC/ETH/SOL 고정 그대로 유지
  - `src/infrastructure/providers/tiingo/tiingoProvider.ts`: `searchInstruments`가 빈 질의는 큐레이션 5종, 실제 입력은 Tiingo 공식 Search API(`/tiingo/utilities/search`, 실 키로 curl 확인 — 문서상 "early beta")를 호출. 같은 티커의 타국 중복(`countryCode`)·ETF를 걸러 미국 주식만 남긴다
  - `src/infrastructure/providers/krxPublicData/krxPublicDataProvider.ts`: `searchInstruments`가 "금융위원회_KRX상장종목정보"(`GetKrxListedInfoService`, `likeItmsNm`)를 호출. **실 키로 확인한 중요한 함정**: 이 서비스는 가격 조회 서비스("금융위원회_주식시세정보")와 별개라 data.go.kr에서 추가 활용신청이 필요하고, 미신청 시 JSON이 아니라 HTTP `403` + 평문 `"Forbidden"`이 온다 — `ProviderAuthError`로 매핑하고 활용신청 확인 안내 포함
  - `src/application/use-cases/searchInstruments.ts`(신규): `searchInstrumentsAcrossProviders`가 등록된 모든 Provider에 동시 검색을 요청하고 `Promise.allSettled`로 결과를 합친다 — 한 Provider(예: 활용신청 안 된 공공데이터포털)가 실패해도 나머지 결과는 살아남는다. "시장 먼저 선택" 없이 통합 검색창 하나로 설계
  - `src/features/session-setup/InstrumentSearchField.{tsx,css}`(신규): 디바운스(300ms) 검색 콤보박스, 결과는 `<button>` 목록이라 별도 ARIA combobox 없이 키보드 접근 가능. `SessionSetupForm`의 자산별 `<select>`를 대체
  - `src/features/session-setup/sessionPersistenceModel.ts`: `buildCatalogForRecord`(신규) — 저장된 세션이 참조하는 자산이 큐레이션 기본값에 없으면(검색으로 골랐던 경우) provider 재검색으로 보충한 뒤 기존 `restoreSessionFromRecord`를 호출. 이 보정이 없으면 검색으로 고른 종목을 저장한 세션은 재로드가 실패했음
  - 검증: `npm run verify`(format/lint/typecheck/482 tests/cargo check) PASS. 여기서도 `react-hooks/set-state-in-effect`가 실제 문제를 하나 더 잡음(검색 로딩 상태를 effect 안에서 동기 설정하던 부분 → 이벤트 핸들러로 이동)
  - Playwright MCP로 `npm run dev` 브라우저에서 종단 확인: 검색창 포커스 시 크립토 기본 추천(ETH/SOL, 이미 선택된 BTC는 제외) 표시 → "sol" 입력 시 실시간 필터링 → 클릭 선택 시 입력값이 "Solana (SOL/USDT)"로 갱신, 콘솔 오류 없음(파비콘 404 제외)
  - **미검증**: Tiingo 검색은 curl로 실 키 성공 확인했지만 앱 UI를 통한 종단 확인은 Tauri 필요(브라우저 프리뷰에 Tiingo 미등록). 공공데이터포털 검색은 이 세션의 키가 해당 서비스에 활용신청되어 있지 않아 성공 응답 자체를 못 봄(403만 확인) — 사용자가 활용신청 후 `srtnCd` "A" 접두사 가정을 포함해 1회 확인 필요
- D-020 — 통합 투자 설정 + 표시 통화·환율 변환 + 설정 탭 (2026-07-21, 정식 마일스톤 번호 없음, M8 직후 사용자 요청)
  - OQ-006 RESOLVED: 표시/입력 경계 전용 "현재 환율" 변환으로 교차 통화 비교 지원 — 시뮬레이션 엔진·캔들 캐시는 항상 자산 고유 통화를 그대로 쓰고, 표시·입력 시에만 환산한다(엔진 무변경)
  - **통합 투자 설정(완전 통합, AskUserQuestion으로 확정)**: `SessionSetupForm`에서 자산별 모드·금액·주기·수수료 입력을 제거하고 화면 전체에 하나뿐인 투자 설정으로 교체. `prepareReplaySession`/`SimulationConfig`(자산마다 다를 수 있는 애플리케이션 계층)는 변경 없음 — `sessionSetupModel.ts`가 통합 설정을 자산마다 고유 통화로 환산해 개별 `SimulationConfig`를 만든다
  - `src/domain/shared/fxConversion.ts`: `convertAmount`/`convertMoney` — KRW·USD·USDT 세 통화만 지원, USD·USDT는 1:1 가정(사용자 명시), 환산 불가 시 `DomainValidationError`
  - `src/infrastructure/fx/frankfurterFxRateProvider.ts`: Frankfurter(무료·키 불필요·CORS 열림) 기반 USD/KRW 환율 Provider, 1시간 in-memory 캐시. Tiingo·공공데이터포털과 달리 CORS가 열려 있어 `tauri-plugin-http` 불필요 — 기존 `fetchHttpClient`로 Tauri·브라우저 프리뷰 모두 동작(Playwright로 브라우저에서 실제 환율 조회 성공 확인: `1 USD = 1482.6 KRW`)
  - `src/application/ports/appSettingsStore.ts` + `sqlite`/`inMemory` 구현: 표시 통화(KRW/USD) 영속화, 새 SQLite 마이그레이션 v3(`app_settings` key/value). BYOK 비밀정보(`ApiKeyStore`)와 책임 분리
  - `src/features/app-settings/SettingsScreen.tsx`(신규 화면) + `App.tsx` 탭 네비게이션("세션 설정"/"설정") — 표시 통화 선택, 현재 환율 표시+새로고침, 그리고 기존에 메인 화면에 있던 Tiingo·공공데이터포털 `ProviderApiKeyField` 두 개를 이 탭으로 이동
  - `src/features/replay-workspace/viewModel.ts`: `buildResultSummary`·`buildPortfolioSeries`·`buildPriceSeries`(`"raw"` 모드만)가 표시 통화로 환산된 값을 반환 — 서로 다른 통화 자산(KRW·USDT·USD)도 결과 요약·투자금 변화 차트에서 같은 스케일로 비교 가능. 결과 화면에 환산 가정(USDT=USD 1:1, 환율 기준일·출처) 문구 추가
  - `src-tauri/tauri.conf.json`: 초기 창 높이 640 → 1280
  - 검증: `npm run verify`(format/lint/typecheck/463 tests/cargo check) PASS. React 훅 lint 규칙(`react-hooks/set-state-in-effect`)이 실제 버그를 하나 잡음 — 마운트 effect에서 동기적으로 `setState`를 호출하던 환율 조회 로직을 이벤트 핸들러/Promise 콜백 전용으로 재구성
  - Playwright MCP로 `npm run dev` 브라우저에서 종단 확인: 통합 투자 설정 → 설정 탭에서 표시 통화 KRW→USD 전환 → 세션 설정 화면 라벨 즉시 반영("원금 (USD)") → BTC+ETH 2자산 세션 제출 → 결과 요약에 "1000.00 USD"(USDT→USD 1:1 환산)와 환산 가정 문구 정상 표시, 콘솔 오류 없음(파비콘 404 제외)
  - **미검증**: KRW 자산(KRX)을 포함한 실제 환산(예: KRX+크립토 혼합, 표시 통화 USD)은 브라우저 프리뷰에 KRX Provider가 없어 확인 못함 — Tauri 데스크톱에서 사용자가 1회 확인 필요. `AppSettingsStore` SQLite 재시작 후 영속 여부도 Tauri 환경 실사용 확인 필요(단위 테스트로는 확인됨)
- M8 — 한국 주식 Provider (2026-07-21)
  - OQ-005 RESOLVED(D-017): 공공데이터포털(data.go.kr) "금융위원회_주식시세정보"(`GetStockSecuritiesInfoService`), **BYOK** — D-015(Tiingo)와 동일 원칙. 한국투자증권 Open API(무료지만 증권 계좌 개설 전제)보다 진입장벽이 낮아 채택
  - `src/infrastructure/providers/krxPublicData/`: `KrxPublicDataProvider`(BYOK 키 미설정은 `ProviderAuthError`, data.go.kr 표준 `resultCode` 봉투를 `00`/`03`(NODATA→빈 결과)/`22`(한도초과→`ProviderRateLimitError`)/`20·21·30·31·32·33`(인증·권한→`ProviderAuthError`)/`04·05`(일시적→`ProviderNetworkError`)/기타(`ProviderResponseError`)로 매핑, `numOfRows`/`pageNo` 페이지네이션을 Provider 내부에서 결합하고 `totalCount` 미달 시 실패), `KRX_PUBLIC_DATA_INSTRUMENTS`(대형주 5종 큐레이션: 삼성전자·SK하이닉스·NAVER·카카오·현대차)
  - 이 API는 수정주가를 제공하지 않는다 — 모든 캔들이 `priceBasis: "raw"`, `adjustedClose`는 항상 undefined. 시뮬레이션 엔진의 기존 raw-close 폴백(M4)을 그대로 재사용해 엔진 변경 없음
  - **보안 수정**: Tiingo(Authorization 헤더)와 달리 이 API는 `serviceKey`를 쿼리 파라미터로만 받는다 — 재시도 소진 시 오류 메시지에 URL을 포함해야 해서, `redactServiceKey()`로 키 값을 지운 뒤에만 메시지에 넣도록 구현(docs/09 §2, 회귀 테스트 포함)
  - HTTP 전송·키 저장은 M7 인프라를 그대로 재사용(신규 Rust 코드 없음): `tauriHttpClient`(capability에 `https://apis.data.go.kr/*` 추가), keyring 기반 `ApiKeyStore`(D-016에서 표시명과 분리해 둔 `investment-replay.provider-api-key.<providerId>` 접두사 덕분에 새 Provider 추가가 저장 경로 변경 없이 가능)
  - `src/app/composition.ts`: 3번째 Provider(`krx-public-data`) 등록, BYOK 키 로드 루프를 Tiingo·KRX 공통으로 일반화. `src/App.tsx`: 카탈로그 병합에 KRX 추가, 두 번째 `ProviderApiKeyField`(Encoding/Decoding 키 주의 안내 포함— `ProviderApiKeyField`에 선택적 `note` prop 추가)
  - `docs/providers/KRX_PUBLIC_DATA.md`: 데이터 의미·엔드포인트·`resultCode` 매핑·이용조건·정규화 규칙 기록(docs/09 §5)
  - **D-018(같은 날 후속)**: `.env`(개발 편의) 자동 적용 — 저장소 루트 `.env`에 `TIINGO_API_KEY`/`OPEN_API_KEY`/`OPEN_API_ENDPOINT`가 있으면 Rust(Tauri 백엔드, `dotenvy` + `get_env_provider_key`/`get_env_provider_endpoint` 커맨드)에서만 읽어 keyring 값보다 우선 적용하고, `ProviderApiKeyField`는 수동 입력 대신 자동 적용 안내만 보여준다. 값이 없으면 기존 수동 입력→keyring 저장 흐름 그대로. 프런트엔드 Vite 번들(`import.meta.env`)로는 절대 읽지 않아 배포 바이너리에 개인 키가 섞이지 않음
  - **D-019(실 키로 처음 검증, 버그 2건 발견·수정)**: 사용자가 실 서비스 키로 조회 중 오류를 보고 — `curl`로 직접 원인을 재현·격리함. (1) `.env`의 `OPEN_API_ENDPOINT`에 오퍼레이션 경로(`/getStockPriceInfo`)가 빠지면 요청이 성립하지 않음 → `KrxPublicDataProvider`가 자동으로 경로를 보정하도록 수정. (2) **`endBasDt`가 흔한 문서 서술과 달리 배타적(exclusive)** — `[beginBasDt, endBasDt)` 반개구간임을 실측으로 확인, 기존 구현은 반대로 가정해 요청 범위의 마지막 날짜가 항상 누락되고 있었음 → 하루를 빼던 로직 제거. 부수 확인: `resultCode: "00"` 성공 응답, 가격 필드는 숫자 문자열로 옴, `totalCount=1`이어도 `items.item`은 배열로 옴(기존 방어 코드가 이미 처리하고 있어 추가 수정 불필요)
  - 검증: `npm run verify`(format/lint/typecheck/432 tests/cargo check) PASS, `npm run build` PASS, `npm run tauri dev` 정상 기동(패닉 없음). KRX Provider 계약 테스트 30개(정규화·범위 절단·정렬·중복 제거·likeSrtnCd 오검색 방어·resultCode 매핑·페이지네이션 결합·serviceKey 로그 미노출·baseUrl 정규화 등)
  - 브라우저 프리뷰 스모크: Playwright MCP로 `npm run dev` 확인 — 크립토 카탈로그만 노출(KRX·Tiingo 모두 미등록, 설계대로), 콘솔 오류 없음(파비콘 404 제외)
  - **실 키 검증 완료(D-019)**: 사용자의 실 data.go.kr 키로 삼성전자 일봉을 성공적으로 조회함(`resultCode: "00"`, 날짜 경계 정확) — Tiingo와 달리 이 Provider는 이제 성공 경로가 실측 확인됨
  - **남은 미검증**: (1) 크립토+한국 주식 혼합 세션 → 재생까지의 앱 UI 전체 흐름(원시 HTTP 호출은 확인했으나 세션 준비·리플레이 화면은 미확인). (2) `resultCode` 00 외 오류 경로(잘못된 키·한도 초과 등)는 여전히 미검증 — 실패를 인위적으로 재현하지 않는 한 확인 어려움
- M7 — 미국 주식 Provider (2026-07-19)
  - OQ-004 RESOLVED(D-015): 조사 결과 검토한 모든 무료 API(Alpha Vantage·Tiingo·Twelve Data·Financial Modeling Prep)가 "본인 이용"과 "앱의 불특정 최종사용자에게 재배포"를 구분하고 후자는 유료 계약을 요구함 확인 → **BYOK(Bring-Your-Own-Key)** 채택: 앱은 데이터를 재배포하지 않고 각 사용자가 자신의 무료 키를 직접 입력
  - Provider: **Tiingo**(`GET /tiingo/daily/<ticker>/prices`) — 무료 티어에서 원시 OHLC와 수정주가(adjClose 등)를 함께 제공하는 유일한 후보였음(D-015 근거 상세)
  - `src/application/ports/apiKeyStore.ts` + `tauriApiKeyStore.ts`(Rust `keyring` crate → Windows 자격 증명 관리자)·`inMemoryApiKeyStore.ts`(브라우저 프리뷰): BYOK 키를 평문 SQLite가 아닌 OS 보안 저장소에 저장(docs/09 §2)
  - `src/infrastructure/http/tauriHttpClient.ts` + `tauri-plugin-http`: Tiingo는 CORS 미지원(curl로 확인)이라 기존 webview `fetch`(`fetchHttpClient`)를 쓸 수 없음 — capability를 `https://api.tiingo.com/*`로만 스코프
  - `src/infrastructure/providers/tiingo/`: `TiingoProvider`(BYOK 키 미설정·403은 신규 `ProviderAuthError`, 200+평문 할당량 초과 응답은 관찰 기반으로 `ProviderRateLimitError` 분류), `TIINGO_INSTRUMENTS`(대형주 5종 큐레이션 — 전체 종목 검색 UI는 범위 밖)
  - **다중 Provider 조합**: `AppComposition.provider`(단일) → `providers: ReadonlyMap<providerId, MarketDataProvider>`로 확장, `prepareReplaySession`이 자산마다 `instrument.providerId`로 Provider를 조회 — 암호화폐+미국 주식을 한 세션(최대 2개 비교)에서 함께 선택 가능. 브라우저 프리뷰는 Tiingo를 등록하지 않음(CORS·플러그인 모두 불가, SQLite 영속성 없음과 같은 종류의 제약)
  - `src/features/session-setup/ProviderApiKeyField.tsx`: BYOK 키 입력·저장·삭제 UI. `formatProviderError`가 `ProviderAuthError`를 docs/06 §6 "라이선스 또는 인증 설정 필요" 문구로 매핑(이전까지 재현 불가라 매핑하지 않았던 항목)
  - `docs/providers/TIINGO.md`: 데이터 의미·엔드포인트·호출 제한·이용조건·정규화 규칙 기록(docs/09 §5)
  - 검증: `npm run verify`(format/lint/typecheck/404 tests/cargo check) PASS, `npm run build` PASS. Tiingo 계약 테스트 20개(범위 절단·중복 제거·OHLC 위반·BYOK 인증·200+평문 할당량 초과·5xx 재시도·다른 Provider 자산 거부 등), `prepareReplaySession` 다중 Provider 테스트 추가
  - 브라우저 프리뷰 스모크: Playwright MCP로 `npm run dev` 확인 — 크립토 카탈로그만 노출되고(Tiingo 미등록 설계대로) 콘솔 오류 없음(파비콘 404 제외)
  - **미검증**: 실제 Tiingo 무료 키로 `npm run tauri dev`를 통한 종단 확인(암호화폐+미국 주식 혼합 세션, 수정주가 토글, BYOK 키 입력→저장→재생 전체 흐름) — 이 세션에는 실 API 키가 없어 수행하지 못함. 사용자가 실 키로 1회 확인 필요
  - `src/domain/session/`: `ReplaySessionRecord`(schema v1), 자산별 `SimulationConfig` 포함 `SavedSessionConfiguration`, 데이터 버전 추출(`extractDataVersions`), 세션 이름 검증. `exportFormat.ts`: 세션 JSON 페이로드, 자산별 출처·가정 헤더가 포함된 포트폴리오 CSV(호출측이 커서까지 자른 스냅샷만 받음 — R6 유지)
  - `src/application/ports/sessionRepository.ts`·`fileExporter.ts`·`idGenerator.ts`: 저장소·내보내기·ID 생성 포트. `saveReplaySession`·`loadReplaySession` use-case
  - `src/infrastructure/persistence/sqliteSessionRepository.ts`(Tauri, `replay_sessions` 테이블 마이그레이션 추가)·`inMemorySessionRepository.ts`(브라우저 프리뷰)
  - `src/infrastructure/export/tauriFileExporter.ts`: `@tauri-apps/plugin-dialog` 저장 대화상자로 경로를 받고, Rust `write_export_file` 커맨드(capability 우회 없이 사용자가 고른 경로 하나만 쓰기 — docs/09 §3)로 파일 기록. `browserFileExporter.ts`: 브라우저 프리뷰용 다운로드 폴백
  - `src/features/replay-workspace/SessionActions.*`(현재 세션 저장·JSON/CSV 내보내기), `src/features/session-setup/SavedSessionsPanel.*`(저장된 세션 목록·불러오기)
  - `src-tauri/src/lib.rs`·`capabilities/default.json`: `tauri-plugin-dialog` 등록, `dialog:allow-save` 권한, `write_export_file` 커맨드(capability 등록 불필요한 앱 자체 명령)
  - D-014(신규)·OQ-001 RESOLVED: 표시명을 "CashOS"로 확정(창 제목, 앱 내 텍스트, 내보내기 헤더, README/GOAL 제목). Tauri identifier(`com.investmentreplay.dev`)·npm/Cargo 패키지명·SQLite 캐시 파일명은 설치 경로 단절을 피하기 위해 그대로 유지(D-007 연장)
  - 검증: `npm run verify`(format/lint/typecheck/371 tests/cargo check) PASS, `npm audit --production` 취약점 0건, `npm run build` PASS, `npm run tauri build` PASS(`CashOS_0.1.0_x64_en-US.msi`, `CashOS_0.1.0_x64-setup.exe` 생성 — productName 반영 확인)
  - 설치 검증: NSIS(`/S`) 설치 → 실행(창 제목 "CashOS" 확인, 프로세스 정상 유지) → `uninstall.exe /S`로 완전 제거까지 로컬 1회 확인. MSI는 이 세션의 비관리자 셸에서 all-users 설치 권한 부족(Error 1925)으로 실패 — 빌드 자체는 성공했고, 관리자 권한 환경에서 별도 확인 필요(진짜 "신규 환경" 설치 테스트는 아직 다른 물리 머신에서 미실시)
  - GitHub Release 초안: `v0.1.0-alpha`, draft 상태, `feat/m6-alpha-release` 타겟, MSI·NSIS 설치 파일 첨부(https://github.com/Yeon-sik/CashOS/releases — draft이므로 링크는 `untagged-` placeholder로 표시되고 게시 시 `v0.1.0-alpha` 태그로 확정됨)
  - 커밋: `9ac726e`(세션 저장·불러오기·내보내기), `14337c7`(CashOS 표시명 확정). 브랜치 `feat/m6-alpha-release` push 완료
- M5 — MVP UI (2026-07-15)
  - `src/domain/market-data/priceNormalization.ts`: 시작점 100 정규화·누적 수익률 순수 함수(Decimal 경계)
  - `src/application/use-cases/prepareReplaySession.ts`: 자산 1~2개 선택 → 캐시 우선 조회 → 합집합 데이터셋 → 자산별(서로 다른 규칙 허용) 시뮬레이션 실행을 오케스트레이션. 상장 이전·데이터 없음·중간 누락을 엔진 재계산 없이 판정하는 `AssetDataNotice`
  - `src/app/composition.ts`: 조합 루트 — `isTauri()`로 Tauri(SqliteCandleRepository)와 브라우저 프리뷰(InMemoryCandleRepository) 분기, Binance Provider·재생 스케줄러 조립. React 컴포넌트는 이 결과만 주입받는다
  - `src/infrastructure/persistence/inMemoryCandleRepository.ts`: 브라우저 프리뷰 전용 메모리 캐시(영속성 없음)
  - `src/features/replay-workspace/viewModel.ts`: **미래 데이터 비노출(R6)의 실제 구현 지점** — 가격·투자금 차트와 결과 요약 모두 `cursorIndex`까지만 자른다. MDD 등 구간 전체 지표는 리플레이가 마지막 날에 도달했을 때만 노출
  - `src/features/replay-workspace/`: TradingView Lightweight Charts v5 래퍼(`LineSeriesChart`), 재생 제어(Space/→/Home 키보드, 네이티브 버튼), 결과 요약(원금·평가액·손익·수익률·MDD·데이터 상태·계산 가정)
  - `src/features/session-setup/`: 자산 1~2개(서로 다른 투자 규칙) 선택, 기간·표시 기준·일시투자/정기매수 폼, 폼→요청 변환과 클라이언트 검증
  - 시각 디자인: Georgia(제목)·Segoe UI(본문)·Consolas(금액·날짜, tabular-nums) 3단 타이포그래피, 라이트/다크 CSS 변수 토큰, 손익은 색+화살표 글리프 병기(색상만으로 의미 전달 금지)
  - `@testing-library/react` + jsdom 도입(vitest 전역 환경), 새 테스트 84개(도메인·유스케이스·view model·컴포넌트) — 특히 viewModel 커서 절단이 미래 데이터를 포함하지 않는지 검증
  - Playwright MCP로 `npm run dev` 브라우저에서 실제 흐름 검증(설정 → 실제 Binance 데이터 조회 → 차트 렌더 → 재생/일시정지/한 단계/처음으로/키보드 → 2자산 서로 다른 규칙 비교), 콘솔 오류 없음 확인. Tauri 네이티브 통합(SQLite 영속성)은 대체하지 못함 — 브라우저 프리뷰는 InMemory 캐시 사용
- M4 — 투자 시뮬레이션 엔진 (2026-07-15)
  - `src/domain/simulation/simulationConfig.ts`: SimulationConfig 불변조건 검증(일시투자·정기매수 모드별 규칙, 음수·통화 불일치·anchor 종류 거부)
  - `src/domain/simulation/contributionSchedule.ts`: 매주·매월 정기 납입 예정일 생성(달력 기준, 말일 클램프)
  - `src/domain/simulation/simulationTimeline.ts`: ReplayDataset → SimulationDay 변환(체결가·평가가 분리, carried-forward, 상장 이전 null)
  - `src/domain/simulation/simulationEngine.ts`: 결정론적 시뮬레이션 엔진 — 일시투자·정기매수, 종가 체결, 수수료, 소수점 매수 허용/비허용, 휴장일 이월(예정 납입 보존·거래 기록 분리), PortfolioSnapshot·SimulatedTrade 산출
  - OQ-007 MDD 정의 확정(D-012): 가격 기준 MDD를 기본 지표로 제공하고 총자산 기준 MDD(기여금 유입 미조정)를 별도 표기. `PortfolioSnapshot.drawdownRate`는 총자산 기준
  - 비율(수익률·낙폭) 표기: 소수 10자리 ROUND_HALF_UP(`RATE_DECIMAL_PLACES`)
  - Golden Fixture 확장(docs/16 §6·§7): 일시투자, 일시투자+수수료 25%, 매주 DCA 3개 시나리오 독립 손 계산값을 `goldenFixture.ts`에 추가
  - `src/domain/simulation/goldenFixtureSimulation.test.ts`: 엔진 결과와 독립 기대값을 날짜별로 전사 대조(엔진으로 기대값을 생성하지 않음, docs/08 §3)
  - 단위 테스트 66개 추가 — docs/05 §9 필수 목록 전량 커버(일시투자 1캔들, 잔여 현금, 소수점 허용/비허용, 수수료 0/양수, 매주/매월 스케줄, 휴장일 이월, 상장 이전, 데이터 중간 누락, carried-forward 평가, 반올림 정책, 0원 원금, 음수 거부, 최종 수익률 독립 계산 일치, 재실행 결정론)
- M3 — 리플레이 엔진 (2026-07-14)
  - `src/domain/replay/replayDataset.ts`: 거래일 합집합 타임라인 데이터셋 빌더, gap 유지 캔들 조회 인덱스
  - `src/domain/replay/replayEngine.ts`: 결정론적 상태 머신 — initialize/play/pause/stepForward/seek(index·date)/setSpeed(0.25~10x)/restart/dispose, 이벤트 구독, 중복 타이머 방지, 리스너 예외 시 error 전이
  - `src/domain/replay/replayScheduler.ts`: 타이머 포트 (도메인은 실제 시간을 모름)
  - `src/infrastructure/timers/timeoutReplayScheduler.ts`: setTimeout 어댑터 (M5에서 주입)
  - `src/test/fakeReplayScheduler.ts`: 가상 시간 가짜 스케줄러
  - 상태 전이 테스트 34개 추가 (동일 명령 순서 → 동일 전이 로그 결정론 검증 포함)
- M2 — 암호화폐 Provider와 로컬 캐시 (2026-07-14)
  - `src/application/ports`: MarketDataProvider·CandleRepository·Clock 포트, 공급자 오류 분류(network/rate-limit/invalid-response/provider)
  - `src/domain/market-data/timeRange.ts`: UTC 반개구간, 커버리지 병합·차집합 순수 함수
  - `src/infrastructure/providers/binance`: BTC·ETH·SOL USDT 일봉 adapter (D-010) — 런타임 검증, 정규화, 페이지네이션 결합, 지수 백오프 재시도, 429 Retry-After 준수, 418 즉시 중단, 미완성 오늘 캔들 제외
  - `src/infrastructure/persistence`: TS 마이그레이션 러너 + SQLite 캔들 캐시 저장소(커버리지 병합 포함, D-011), tauri-plugin-sql 2.4 연결
  - `src/application/use-cases/ensureCandleRangeCached.ts`: 캐시 우선, 누락 구간만 조회
  - 계약·통합 테스트 62개 추가 (better-sqlite3 in-memory로 실제 SQLite 실행), 실 API 스모크는 `LIVE_API=1` opt-in으로 분리 (1회 수동 실행 PASS)
  - `docs/providers/BINANCE.md`: 데이터 의미·호출 제한·이용조건 기록
- M1 — 순수 도메인과 Golden Fixture (2026-07-14)
  - `src/domain/shared`: DecimalString 검증·파싱, decimal.js 10.6.0 캡슐화(D-009), Money, CurrencyCode, TradingDate·UTC ms 시간 표현, DomainValidationError
  - `src/domain/instrument`: Instrument 타입 (docs/02 §1)
  - `src/domain/market-data`: Candle·DataSourceRef 타입, OHLC 불변조건 검증(`validateCandle`), 중복 키
  - `src/domain/replay`: 거래일 합집합 타임라인 순수 함수(`unionTradingDates`)
  - `src/domain/fixtures`: 5일 Golden Fixture(종가 100→110→90→120→120)와 일시투자 독립 기대값
  - `docs/16_GOLDEN_FIXTURES.md`: 손 계산 근거 문서화
  - 단위 테스트 97개 (정상·경계·오류 경로)
- M0 — 저장소 기반과 기술 검증 (2026-07-14)
  - Git 저장소 초기화 (`main` + `feat/m0-bootstrap` 브랜치)
  - create-tauri-app 4.6.2로 Tauri 2 + React 19 + TypeScript 5.8 + Vite 7 스캐폴딩
  - Prettier + ESLint 10(flat config, typescript-eslint, react-hooks) + Vitest 4 + `cargo check` 구성
  - 최소 시작 화면 (앱 목적과 M0 상태 표시, `src/App.tsx` + `src/app/appInfo.ts`)
  - Windows 프로덕션 빌드 검증 (MSI + NSIS 설치 파일 생성 확인)

## 현재 구현된 기능

- 순수 도메인 계층 (내부 모듈): Decimal/Money/시간 값 객체, Candle 불변조건 검증, 타임라인 합집합, 시간 범위 연산, 가격 정규화, Golden Fixture
- 시장 데이터 계층: Binance BTC·ETH·SOL USDT 일봉 조회·정규화, SQLite 캐시(Tauri)/메모리 캐시(브라우저 프리뷰)
- 리플레이 엔진: 합집합 타임라인, 재생·일시정지·스텝·seek·속도·restart, 가짜 시계 완전 결정론
- 투자 시뮬레이션 엔진: 일시투자·정기 정액매수(매주·매월), 수수료, 소수점 매수 허용/비허용, 휴장일 이월, 기여 원금·현금·수량·평가액·손익·수익률, 가격/총자산 두 기준 MDD
- **UI 연결 완료(M5)**: 자산 1~2개 선택(서로 다른 투자 규칙 허용) → 데이터 조회 → 재생(재생/일시정지/한 단계/처음으로/속도, 키보드 지원) → 가격·투자금 차트 → 결과 요약까지 전체 흐름 동작. 로딩·오류·데이터 경고(상장 이전·중간 누락) 상태 포함
- **세션 저장·불러오기, CSV/JSON 내보내기(M6)**: 세션(자산·기간·표시 기준·시뮬레이션 설정·재생 속도·데이터 버전)을 SQLite(Tauri)/메모리(브라우저 프리뷰)에 저장·불러오기, 현재 세션을 JSON으로, 포트폴리오 시계열을 CSV(출처·가정 헤더 포함)로 내보내기(Tauri 네이티브 저장 대화상자)
- **미국 주식(M7, BYOK)**: Tiingo 대형주 5종(AAPL·MSFT·GOOGL·AMZN·NVDA) — 사용자가 자신의 무료 Tiingo API 키를 입력하면 암호화폐 자산과 함께(최대 2개 비교) 조회 가능. 키는 Windows 자격 증명 관리자에 저장. Tauri 데스크톱 런타임에서만 동작(브라우저 프리뷰는 크립토만)
- **한국 주식(M8, BYOK)**: 공공데이터포털 대형주 5종(삼성전자·SK하이닉스·NAVER·카카오·현대차) — 사용자가 자신의 무료 data.go.kr 서비스 키를 입력하면 암호화폐·미국 주식과 함께(최대 2개 비교) 조회 가능. 수정주가는 제공하지 않음(원시 시세만). Tauri 데스크톱 런타임에서만 동작
- **통합 투자 설정 + 표시 통화·환율 변환 + 설정 탭(D-020)**: 비교 자산 전체에 동일한 투자 규칙(모드·금액·주기·수수료) 하나만 적용. 표시 통화(KRW/USD(USDT)) 설정 탭에서 선택 — 결과 요약·투자금 변화 차트·투자 금액 입력이 이 통화 기준으로 환산됨(Frankfurter 현재 환율, USDT=USD 1:1 가정). BYOK API 키 입력은 설정 탭으로 이동
- **종목 검색(D-021)**: Tiingo·공공데이터포털 자산을 대형주 5종 큐레이션에서 실제 검색으로 확장(디바운스 콤보박스, 여러 provider 통합 검색). 암호화폐(Binance)는 BTC/ETH/SOL 고정 그대로 유지(GOAL.md 범위)

## 검증 상태

| 검증 | 상태 | 마지막 명령 | 비고 |
|---|---|---|---|
| Format | PASS | `npm run format:check` | 2026-07-21, Prettier 3.9 |
| Lint | PASS | `npm run lint` | 2026-07-21, ESLint 10 flat config |
| Typecheck | PASS | `npm run typecheck` | 2026-07-21, tsc strict |
| Unit test | PASS | `npm run test` | 2026-07-21, Vitest 4 + jsdom, 482개 통과 + live 1개 skip |
| Integration test | PASS | `npm run test` | Provider 계약(Binance+Tiingo+공공데이터포털, 검색 포함) + FX Provider 계약(Frankfurter) + SQLite(better-sqlite3, app_settings 포함) + use case(다중 provider 검색 포함) + React 컴포넌트 통합 + 세션 저장소 포함 |
| Live API smoke | PASS (opt-in, Binance만 자동화) | `$env:LIVE_API="1"; npm run test` | 기본 실행에서 제외, Binance 대상 2026-07-14 수동 1회 PASS 이후 재실행 안 함. 공공데이터포털 가격 조회는 사용자의 실 키로 `curl` 직접 호출 검증 완료(2026-07-19, D-019), 종목 검색은 활용신청 안 돼 있어 403만 확인(2026-07-21, D-021). Frankfurter는 curl과 Playwright 브라우저 양쪽에서 실 호출 확인(2026-07-21, D-020). Tiingo 가격 조회는 미검증(실 키 없음), Tiingo 검색은 curl로 확인(2026-07-21, D-021) |
| Cargo check | PASS | `npm run check:rust` | 2026-07-21, `dotenvy` 추가(D-018, `.env` 자동 적용). D-020·D-021은 신규 Rust 의존성 없음 |
| npm audit | PASS | `npm audit --production` | 2026-07-19(M6 시점), M7 신규 의존성(`@tauri-apps/plugin-http`) 이후 재실행 안 함. M8·D-020·D-021은 신규 npm 의존성 없음(Rust `dotenvy`만 추가, D-018) |
| Production build | PASS | `npm run build` | 2026-07-21, tsc + vite build (M8+D-018~D-021 변경 포함 재검증) |
| Desktop build | PASS (M6 시점) | `npm run tauri build` | 2026-07-19(M6), `CashOS_0.1.0_x64_en-US.msi` + `CashOS_0.1.0_x64-setup.exe` 생성. M7의 새 Rust 의존성(`keyring`, `tauri-plugin-http`)과 M8의 `dotenvy`를 포함한 재빌드는 아직 안 함 — `cargo check`+`npm run tauri dev`(기동 확인)만 확인 |
| 설치 테스트 | 부분 PASS (M6 시점) | NSIS `/S` 설치 → 실행 → `uninstall.exe /S` | 2026-07-19(M6), 이 머신에서 1회 확인. MSI는 비관리자 셸이라 all-users 설치 권한 부족(Error 1925)으로 미검증. M7 이후 재검증 안 함 |
| `npm run tauri dev` 기동 확인 | PASS | `npm run tauri dev` | 2026-07-21: Rust 빌드 성공, 패닉 없이 네이티브 창 기동 확인(D-018 도입 후). UI 내부 상호작용(BYOK 자동 적용 문구 렌더링 등)은 네이티브 창이라 자동 캡처 도구가 없어 사용자 육안 확인에 의존. D-020(창 높이 1280 등)·D-021 반영 후 재기동은 아직 안 함 |
| 브라우저 실사용 검증 | PASS | Playwright MCP, `npm run dev` | 2026-07-21: 통합 투자 설정 → 설정 탭 표시 통화 전환(KRW→USD, 라벨 즉시 반영) → 2자산 세션 제출 → 결과 요약 통화 환산·환산 가정 문구 정상 표시(D-020); 검색창 포커스 시 기본 추천 → 실시간 필터링("sol") → 선택 반영까지 확인(D-021). Frankfurter 실 환율 조회 성공, 콘솔 오류 없음(파비콘 404 제외). M7 Tiingo·M8 공공데이터포털 데이터 조회는 Tauri 데스크톱 런타임이 필요해 브라우저 프리뷰로 검증 불가 |

`npm run verify`가 format:check + lint + typecheck + test + cargo check를 일괄 실행한다.

## 현재 결정

- 제품 형태: Windows 데스크톱 앱
- 초기 스택: Tauri 2 + React + TypeScript
- 초기 데이터: BTC, ETH, SOL 일봉
- 핵심 계산: AI 미사용, 결정론적 계산
- 저장: 로컬 우선
- 패키지 매니저: npm (D-006)
- 제품 표시명: Chart Reminder (D-016, OQ-001 RESOLVED — D-014의 "CashOS" 결정을 대체). Tauri identifier `com.investmentreplay.dev`·npm/Cargo 패키지명·SQLite 캐시 파일명은 설치 경로 단절을 피하기 위해 그대로 유지. M7에서 도입된 keyring 저장 키 접두사가 표시명(`cashos.*`)에 결합돼 있던 버그를 함께 수정(`investment-replay.*`로 안정화)
- 품질 도구: Prettier + ESLint + Vitest + cargo check, CI는 GitHub 원격 생성 후 (D-008)
- Decimal 라이브러리: decimal.js 10.6.0, `src/domain/shared/decimal.ts`로 캡슐화 (D-009)
- 암호화폐 공급자: Binance 공개 klines API, USDT 거래쌍, base URL `data-api.binance.vision` (D-010, OQ-003 RESOLVED)
- SQLite: 연결은 tauri-plugin-sql, 스키마 마이그레이션은 TS 러너, 테스트는 better-sqlite3 (D-011)
- MDD 정의와 비율 반올림: 가격 기준 MDD를 기본 제공하고 총자산 기준 MDD를 별도 표기, 비율은 소수 10자리 ROUND_HALF_UP (D-012, OQ-007 RESOLVED)
- 차트 라이브러리: TradingView Lightweight Charts v5 (D-013). CORS 확인 완료(`data-api.binance.vision`이 `Access-Control-Allow-Origin: *` 응답), 공식 React 튜토리얼 패턴(`createChart` + `addSeries(LineSeries)` + `setData`) 채택
- 조합 루트 런타임 분기: `isTauri()`(`@tauri-apps/api/core`)로 Tauri에서는 SqliteCandleRepository, 브라우저 프리뷰(Playwright 검증용)에서는 InMemoryCandleRepository 주입 (D-013)
- 미국 주식 Provider: Tiingo, BYOK 모델 (D-015, OQ-004 RESOLVED). 키는 Rust `keyring` crate로 Windows 자격 증명 관리자에 저장. CORS 미지원이라 Tiingo 전용으로 `tauri-plugin-http` 도입(Binance는 기존 `fetchHttpClient` 유지)
- 다중 Provider 조합: `AppComposition.providers`가 providerId → Provider 맵을 보관하고, `prepareReplaySession`이 자산마다 알맞은 Provider를 조회 (D-015) — M8에서 실제로 3번째 Provider(공공데이터포털)를 같은 패턴으로 추가해 재사용성 검증됨
- 한국 주식 Provider: 공공데이터포털(data.go.kr) "금융위원회_주식시세정보", BYOK 모델 (D-017, OQ-005 RESOLVED). Tiingo와 동일한 `tauriHttpClient`·keyring 저장 경로 재사용. 이 API는 수정주가를 제공하지 않음(원시 시세만). `endBasDt`는 배타적(exclusive) 경계다 — 흔한 문서 서술과 다름, 실측으로 확인(D-019)
- BYOK 키 `.env` 자동 적용(개발 편의) (D-018): 저장소 루트 `.env`의 `TIINGO_API_KEY`/`OPEN_API_KEY`/`OPEN_API_ENDPOINT`가 있으면 Rust 런타임에서만 읽어 자동 적용하고, 없으면 기존 수동 입력(keyring 저장)으로 폴백. 프런트엔드 빌드에는 절대 포함되지 않아 배포 바이너리에 개인 키가 섞이지 않음
- 통합 투자 설정 + 표시 통화·환율 변환 (D-020, OQ-006 RESOLVED): 비교 자산 전체에 동일한 투자 규칙(모드·금액·주기·수수료) 하나만 적용(자산별 설정 기능 제거). 표시 통화(KRW/USD)는 설정 탭에서 선택, 값은 표시/입력 경계에서만 환산(엔진·캐시는 항상 자산 고유 통화). FX Provider는 Frankfurter(무료·키 불필요·CORS 열림), USD/USDT는 1:1 가정
- 종목 검색 (D-021, D-022): Tiingo·공공데이터포털은 큐레이션 5종 대신 각 Provider의 실제 검색 API를 쓴다(빈 질의만 큐레이션 기본값). 여러 Provider를 한 검색창에서 동시에 조회(`Promise.allSettled`로 부분 실패 허용). Tiingo는 쿼리당 최대 10건(Tiingo 서버 자체 제한, 회사명 없는 벌크 목록과의 트레이드오프로 현행 유지 선택), 공공데이터포털은 최대 50건(이 앱이 걸었던 제한을 상향, 사실상 전체 종목 커버). 암호화폐(Binance)는 BTC/ETH/SOL 고정 그대로 유지(GOAL.md 범위, 사용자 명시)

## 열린 문제

- `docs/OPEN_QUESTIONS.md` 참조 (OQ-001·OQ-002·OQ-004·OQ-005·OQ-006·OQ-007 RESOLVED)
- GitHub 원격 저장소 생성됨(`Yeon-sik/CashOS.git`), CI 워크플로 자체는 아직 없음 (D-008). D-016으로 표시명이 Chart Reminder로 바뀌어 원격 저장소명·draft GitHub Release(`v0.1.0-alpha`, `CashOS_0.1.0_x64...` 설치 파일 첨부)가 이제 표시명과 불일치 — 저장소 이름 변경·릴리스 자산 교체 여부는 외부 시스템 변경이라 사용자 판단 필요, Claude가 임의로 변경하지 않음
- 다크 모드 명암비는 토큰 값으로만 검토했고 OS 다크모드 전환으로 직접 스크린샷 검증하지는 못함(Playwright MCP에 media emulation 도구 없음, M5부터 이어지는 항목)
- M6 남은 위험: MSI(all-users) 설치는 관리자 권한 환경에서 미검증(이 세션은 비관리자 셸). 진짜 "신규 환경"(별도 물리·가상 머신) 설치 테스트는 아직 없음. GitHub Release는 draft 상태로 유지 중이며 게시(publish)는 사용자 판단 필요
- M7 남은 위험: (1) 실 Tiingo 키로 종단 검증 미실시 — 이 세션에 실 API 키가 없어 BYOK 키 입력→저장→암호화폐/미국 주식 혼합 세션→재생→수정주가 토글의 실제 데이터 흐름은 사용자가 `npm run tauri dev`로 1회 확인 필요. (2) Tiingo의 "HTTP 200 + 평문 할당량 초과 응답" 분류는 공식 문서가 아니라 관찰(GitHub 이슈)에 근거한 휴리스틱이라 문구가 바뀌면 갱신 필요. (3) M6 시점 `.msi`/`.exe`는 M7의 새 Rust 의존성(`keyring`, `tauri-plugin-http`)을 포함해 재빌드되지 않음 — 다음 릴리스 전 `npm run tauri build` 재실행 필요
- M8 남은 위험: (1) 성공 경로(엔드포인트·인증·응답 스키마·날짜 경계)는 실 서비스 키로 확인됨(D-019). 다만 크립토+한국 주식 혼합 세션→재생까지의 앱 UI 전체 흐름은 아직 사용자 확인이 안 됨(원시 HTTP 호출만 확인). (2) `resultCode` 00 외 오류 경로(잘못된 키·한도 초과 등)는 여전히 미검증. (3) M8 시점 `.msi`/`.exe`는 M7+M8의 새 Rust 의존성(`keyring`, `tauri-plugin-http`, `dotenvy`)을 포함해 재빌드되지 않음 — 다음 릴리스 전 `npm run tauri build` 재실행 필요
- D-020 남은 위험: (1) KRW 자산(KRX)을 포함한 실제 통화 환산은 브라우저 프리뷰로 확인 못함(KRX Provider가 Tauri 전용) — Tauri 데스크톱에서 크립토+한국 주식 혼합 세션으로 사용자 확인 필요. (2) `AppSettingsStore`의 SQLite 영속(앱 재시작 후에도 표시 통화 유지)은 단위 테스트로만 확인, 실제 Tauri 재시작 시나리오는 미확인. (3) 창 높이 1280 변경 후 `npm run tauri dev`로 실제 레이아웃 재확인 필요(브라우저 프리뷰는 창 크기 개념이 없음)
- D-021 남은 위험: (1) **공공데이터포털 종목 검색("금융위원회_KRX상장종목정보")은 이 세션의 키가 활용신청되어 있지 않아 403만 확인했다 — 사용자가 data.go.kr에서 별도 활용신청 후 실제 검색이 되는지, 그리고 `srtnCd`에 "A" 접두사가 실제로 붙는지 확인 필요**(코드는 두 형태 모두 방어적으로 처리해 뒀지만 실측은 아님). (2) Tiingo 검색은 curl로는 확인했지만 앱 UI를 통한 종단 확인은 Tauri 필요. (3) Tiingo Search API가 공식 문서상 "early beta"라 응답 스키마가 바뀔 수 있음

## 다음 작업

1. 실 Tiingo 무료 키로 `npm run tauri dev` 종단 확인(BYOK 입력 → 암호화폐+미국 주식 혼합 세션 → 수정주가 토글 → 재생 → 종목 검색)
2. `npm run tauri dev`에서 크립토+한국 주식 혼합 세션→재생까지 UI로 직접 확인(D-019로 HTTP 레벨은 확인됨, 남은 건 세션 준비·리플레이 화면) — 표시 통화 KRW/USD 전환 및 KRW 자산 환산도 이때 함께 확인
3. data.go.kr에서 "금융위원회_KRX상장종목정보" 활용신청 후 한국 주식 종목 검색 실사용 확인(D-021)
4. `npm run tauri build`로 재빌드 — M7의 새 Rust 의존성(`keyring`, `tauri-plugin-http`), M8의 `dotenvy`, D-016 표시명 변경(`Chart Reminder_0.1.0_x64...`), D-020 창 높이(1280) 반영
5. M9 — 통합 MVP Release(암호화폐·미국·한국 주식 지원 범위 정리, 설치 검증)
6. (선택) MSI 설치를 관리자 권한 환경 또는 별도 머신에서 재검증, GitHub 원격 저장소명·draft Release 이름 정리 여부 결정
