# Decision Log

장기적 영향을 주는 선택을 기록한다. 이미 결정된 항목도 새로운 근거가 생기면 업데이트할 수 있다.

## D-001: 데스크톱 우선

- 상태: Accepted
- 선택: Windows Tauri 앱 우선
- 이유: 로컬 캐시, 설치형 포트폴리오, 중앙 서버 없이 MVP 가능
- 재검토 조건: 웹 공유가 핵심 제품 가치로 검증될 때

## D-002: 암호화폐 수직 슬라이스 우선

- 상태: Accepted
- 선택: BTC·ETH·SOL로 전체 파이프라인을 먼저 완성
- 이유: 시장별 데이터 문제를 분리하고 엔진 설계를 먼저 검증
- 주의: 최종 MVP에서 미국·한국 주식을 삭제한다는 의미가 아님

## D-003: AI 제외

- 상태: Accepted
- 선택: 핵심 MVP에 AI 미사용
- 이유: 계산 신뢰성, 결정론성, 범위 통제
- 재검토 조건: 자연어 설정 또는 결과 설명 요구가 실제 사용자에게 검증될 때

## D-004: 모듈형 단일 저장소

- 상태: Accepted
- 선택: 초기에는 모노레포를 만들지 않음
- 이유: 현재 배포 대상이 데스크톱 하나
- 재검토 조건: 웹 앱 개발이 승인될 때

## D-005: 정밀 10진 계산

- 상태: Accepted
- 선택: 금액·수량 누적 계산에 일반 JS number 사용 금지
- 이유: 금융 계산의 부동소수점 오차 방지

## D-006: 패키지 매니저 npm

- 상태: Accepted
- 맥락: OQ-002. 환경에 npm 10.9.3과 pnpm 10.34.1이 모두 설치되어 있음
- 선택: npm
- 대안: pnpm
- 이유: 단일 앱 저장소에서는 npm으로 충분하고(OQ-002의 기본 판단), Tauri 공식 스캐폴딩·문서의 기본 경로와 일치해 마찰이 적음
- 결과: `package-lock.json` 커밋, 모든 스크립트는 `npm run` 기준
- 재검토 조건: 모노레포 전환 또는 설치 속도가 실제 문제로 확인될 때

## D-007: M0 임시 식별자와 제품명

- 상태: Accepted
- 맥락: OQ-001(제품명)이 미결정. Tauri identifier는 배포 후 변경 비용이 큼
- 선택: identifier `com.investmentreplay.dev`, 표시명 "Investment Replay", 패키지명 `investment-replay`
- 이유: `.dev` 접미사로 임시 식별자임을 드러내고, 최종 제품명 확정 시 첫 공개 배포(M6) 전에 일괄 변경
- 결과: `tauri.conf.json`, `package.json`, `Cargo.toml`에 반영
- 재검토 조건: OQ-001 확정 시. 늦어도 M6 첫 공개 배포 전

## D-008: 품질 도구 구성

- 상태: Accepted
- 맥락: M0은 반복 가능한 검증 명령을 요구함. GitHub 원격 저장소가 아직 없음
- 선택: Prettier(포맷) + ESLint 10 flat config(typescript-eslint, react-hooks) + Vitest(단위 테스트) + `cargo check`, 이를 `npm run verify`로 일괄 실행
- 대안: Biome(단일 도구), GitHub Actions CI
- 이유: 각 영역의 사실상 표준이며 Tauri/Vite 생태계 문서와 호환. CI는 원격 저장소가 생기기 전에는 검증 불가능하므로 로컬 `verify` 명령으로 대체
- 결과: `eslint.config.mjs`, `.prettierrc.json`, `vitest.config.ts`, package.json scripts
- 재검토 조건: GitHub 원격 생성 시 CI(GitHub Actions) 추가, 도구 성능이 문제되면 Biome 평가

## D-009: Decimal 라이브러리 decimal.js

- 상태: Accepted
- 맥락: M1. 금융 값(금액·가격·수량·수수료) 누적 계산에 JS number 사용 금지(D-005). 현재 유지보수되는 10진 정밀 라이브러리가 필요함
- 선택: decimal.js 10.6.0 (MikeMcl)
- 대안:
  - big.js 7.0.1 — 가장 가볍지만 반올림 모드 4종뿐이고 지수·유효자릿수 제어가 제한적
  - bignumber.js 11.1.5 — 기능은 충분하나 소수 자릿수 기반 연산 모델이며, decimal.js 대비 반올림 모드·문서화 이점이 없음
- 이유(2026-07-14 npm registry·공식 문서 확인 기준):
  - 세 후보 모두 MIT, 활발히 유지보수 중(각 2025-07, 2025-06, 2026-07 갱신)
  - decimal.js는 TypeScript 선언 파일과 ESM export를 패키지에 내장(`types: decimal.d.ts`)
  - 불변(immutable) 인스턴스, 9종 반올림 모드, `Decimal.clone()`으로 전역 오염 없는 도메인 전용 설정 가능
  - 잘못된 입력 문자열에 예외를 던져 조용한 오염을 방지
- 결과: `src/domain/shared/decimal.ts`가 라이브러리를 캡슐화한다. 도메인 코드는 이 모듈만 import하고 decimal.js를 직접 import하지 않는다. 도메인 경계 직렬화는 `DecimalString`을 사용한다
- 재검토 조건: 성능이 측정으로 문제되거나 유지보수가 중단될 때. 캡슐화 계층 덕분에 교체 비용은 낮음

## D-010: 암호화폐 공급자 Binance, 기준 거래쌍 USDT

- 상태: Accepted
- 맥락: M2. BTC·ETH·SOL 일봉의 첫 공급자와 기준 거래쌍(OQ-003)이 필요함. API 키가 필요 없는 공개 데이터 수직 슬라이스 우선
- 선택: Binance 공개 REST API `GET /api/v3/klines`, 거래쌍 BTCUSDT·ETHUSDT·SOLUSDT, 기본 base URL은 공개 시장 데이터 전용 `https://data-api.binance.vision`
- 대안: Coinbase Exchange(USD 쌍이나 SOL 커버리지·과거 범위 확인 필요), Kraken(1회 720캔들 제한), CoinGecko(무료 티어 호출 제한 빡빡함)
- 이유(2026-07-14 공식 문서 확인):
  - 인증 불필요, 일봉 1회 최대 1000개, 요청 weight 2로 과거 10년 조회가 수 페이지로 충분
  - Rate limit 규약이 명확함: 429(Retry-After 헤더) → 지수 백오프, 418(IP ban) → 재시도 금지
  - USD 현물 쌍이 없어 USDT가 사실상 기준. UI에 "Binance BTC/USDT 시장 가격"임을 명시(docs/03 §2)
- 결과: OQ-003 RESOLVED. `src/infrastructure/providers/binance/`, 이용조건은 `docs/providers/BINANCE.md`
- 재검토 조건: Binance 접근성·이용조건 변화, 또는 USD 기준 표시 요구가 실제 사용자에게 검증될 때

## D-011: SQLite 접근은 tauri-plugin-sql, 마이그레이션은 TS 러너

- 상태: Accepted
- 맥락: M2. 캔들 캐시를 SQLite에 저장해야 하고, 통합 테스트는 Tauri 런타임 없이 결정론적으로 실행돼야 함
- 선택:
  - 연결: 공식 `tauri-plugin-sql`(sqlite feature) — JS `Database.load` / `execute` / `select`, `$N` 바인딩
  - 스키마 마이그레이션: 플러그인의 Rust 마이그레이션 대신 TS 마이그레이션 러너(`schema_migrations` 테이블, 버전 순 적용)
  - 테스트: `SqlDatabase` 경계 인터페이스를 두고 테스트에서는 better-sqlite3(12.x, devDependency)로 실제 SQLite 실행
- 대안: 플러그인 Rust 마이그레이션(스키마가 Rust와 TS 테스트에 이중 정의됨), rusqlite 직접 명령(보일러플레이트 증가)
- 이유: 스키마·마이그레이션·저장소 로직을 단일 TS 소스로 유지하면 Vitest에서 실제 SQLite로 검증 가능. Tauri는 연결 제공만 담당
- 결과: `src/infrastructure/persistence/`, 테스트 어댑터는 `src/test/`
- 제약: 마이그레이션은 문장 단위 실행(플러그인 연결 풀에서 다중 호출 트랜잭션이 보장되지 않음). DDL은 가능한 한 멱등적으로 작성하고, 실패 시 DB를 삭제하지 않고 다음 시작에서 재시도한다
- 재검토 조건: 대량 쓰기 성능이 측정으로 문제되거나 플러그인 유지보수가 중단될 때

## D-012: MDD 정의와 수치 표기 정책

- 상태: Accepted
- 맥락: M4. OQ-007 — 가격 기준, 단위가치 기준, 기여금 포함 총자산 기준 MDD를 구분해야 함. docs/05 §7은 "초기 MVP는 자산 가격 또는 단위가치 기준 MDD를 제공하고, 총자산 MDD는 별도 표기"를 권장
- 선택:
  - 엔진은 두 가지 MDD를 모두 계산한다:
    1. **가격 기준 MDD** — 자산 평가 가격 경로(carried-forward 포함)의 이전 최고점 대비 최대 하락률. UI 명칭: "가격 최대 낙폭(MDD)"
    2. **총자산 기준 MDD** — 총자산(현금+평가액) 시계열 기준. 기여금 유입이 낙폭을 왜곡할 수 있음을 함께 표시. UI 명칭: "총자산 최대 낙폭(MDD) · 기여금 유입 미조정"
  - `PortfolioSnapshot.drawdownRate`는 총자산 기준 일별 낙폭이다 (docs/02 §6 필드 유지)
  - 낙폭 최고점 초기화: 첫 스냅샷의 총자산(가격 MDD는 첫 관측 가격). 최고점이 0이면 낙폭은 0
  - 단위가치(시간가중) MDD는 MVP 이후 지표 인터페이스 확장으로 추가한다
- 수치 표기: 비율(수익률·낙폭)은 소수 10자리 ROUND_HALF_UP(`RATE_DECIMAL_PLACES = 10`), 금액·수량은 34유효자리 중간 정밀도를 그대로 직렬화. 수익률 명칭은 "단순 수익률(누적 기여 원금 대비)" — TWR/MWR과 다름을 명시
- 이유: 일시투자에서는 두 MDD가 일치해 직관적이고, DCA에서는 가격 기준이 왜곡 없는 기본 지표가 되면서 총자산 기준도 투명하게 제공됨
- 결과: OQ-007 RESOLVED. `src/domain/simulation/`, docs/16 §4
- 재검토 조건: 사용자 피드백으로 단위가치 MDD 수요가 확인될 때

## D-013: 차트 라이브러리와 조합 루트 런타임 분기

- 상태: Accepted
- 맥락: M5. docs/01 §1이 "Lightweight Charts 우선 검토"를 권장했으나 확정은 아니었음. UI를 처음으로 실제 데이터·SQLite·네트워크에 연결하며, Playwright 검증은 `npm run tauri dev`가 아니라 `npm run dev`(순수 브라우저)로 이루어져 Tauri IPC(`@tauri-apps/plugin-sql`)를 쓸 수 없다는 제약이 드러남
- 선택:
  - 차트: **TradingView Lightweight Charts v5** (`npm install lightweight-charts`). 공식 React 튜토리얼 확인 후 `createChart` + `chart.addSeries(LineSeries, options)` + `series.setData()` 패턴 채택. `TradingDate`("YYYY-MM-DD") 문자열을 `Time` 타입에 그대로 사용 가능함을 타입 선언에서 확인
  - HTTP: 실제로 `data-api.binance.vision`에 curl로 요청해 `Access-Control-Allow-Origin: *` 응답을 확인 — 브라우저/webview `fetch` 그대로 사용 가능해 Tauri HTTP 플러그인 도입은 불필요. 기존 `fetchHttpClient`(M2) 유지
  - 캐시 저장소: 조합 루트(`src/app/composition.ts`)가 `isTauri()`(`@tauri-apps/api/core`)로 분기 — Tauri 런타임은 `SqliteCandleRepository`(M2, 영속), 브라우저 프리뷰는 신규 `InMemoryCandleRepository`(영속성 없음, Playwright 검증 전용 경로)
- 대안: 차트 — Recharts/visx(SVG 기반, 대량 시계열에서 캔버스보다 불리); HTTP — `@tauri-apps/plugin-http` 상시 도입(CORS가 실제로 열려 있어 불필요한 복잡도); 캐시 — 브라우저에서도 IndexedDB 등 영속 저장(M5 스코프 밖, Playwright 검증만 필요하므로 과설계)
- 이유: 세 선택 모두 실측(curl, 공식 문서, 타입 선언) 후 결정했고, 브라우저 프리뷰 경로는 실제 데스크톱 사용 경로가 아니므로 영속성을 갖추지 않아도 됨을 UI에 명시(`ReplayWorkspace`의 안내 문구)
- 결과: `src/app/composition.ts`, `src/infrastructure/persistence/inMemoryCandleRepository.ts`, `src/features/replay-workspace/LineSeriesChart.tsx`
- 재검토 조건: Binance가 CORS 정책을 변경하거나, 브라우저 프리뷰에도 세션 간 캐시 영속이 필요하다는 요구가 생길 때

## D-014: 최종 제품 표시명 CashOS, identifier·패키지명 유지

- 상태: Superseded by D-016 (표시명 부분만. identifier·패키지명·DB 파일명 유지 결정 자체는 D-016에서도 그대로 유효)
- 맥락: M6. OQ-001(제품명)이 D-007 이후 계속 OPEN이었고, D-007은 늦어도 M6 첫 공개 배포 전 확정을 요구함. GitHub 원격 저장소가 `Yeon-sik/CashOS.git`으로 생성되어 있어 사용자에게 확인한 결과 "CashOS"가 최종 제품명으로 확정됨
- 선택:
  - 표시명(사용자에게 보이는 이름)을 "CashOS"로 확정 — `tauri.conf.json`의 `productName`·창 제목, `index.html` `<title>`, `src/app/appInfo.ts`의 `name`, 세션 설정 화면 제목, 세션 CSV 내보내기 헤더 주석, `README.md`·`GOAL.md` 제목에 반영
  - Tauri `identifier`(`com.investmentreplay.dev`), npm 패키지명(`investment-replay`), Cargo 패키지명(`investment-replay` / `investment_replay_lib`), SQLite 캐시 DB 파일명(`investment-replay.db`)은 **변경하지 않음**
- 이유: identifier·DB 파일명은 Tauri에서 사용자 로컬 앱 데이터 경로와 직결되고 한 번 배포되면 되돌리기 어렵다(D-007의 임시 identifier 도입 취지와 동일). 아직 공개 배포 전이라 위험은 낮지만, 표시명만 바꿔도 OQ-001의 실질 목적(사용자에게 보이는 제품명 확정)은 충족되므로 불필요한 재설치·경로 단절 위험을 감수하지 않음
- 결과: OQ-001 RESOLVED. 위 파일 목록에 반영, `docs/OPEN_QUESTIONS.md` 갱신
- 재검토 조건: identifier 자체를 바꿔야 할 필요(예: 배포 채널 변경, 패키지명 충돌)가 생길 때

## D-015: 미국 주식 Provider — Tiingo, BYOK, keyring, tauri-plugin-http

- 상태: Accepted
- 맥락: M7. OQ-004(미국 주식 데이터 공급자)를 확정해야 함. 공식 문서·ToS를 직접 확인한 결과(2026-07-19, WebSearch/WebFetch), 검토한 모든 공급자가 "본인 자신의 이용"과 "앱이 불특정 최종사용자에게 데이터를 재배포"를 구분하고 후자에는 유료·별도 계약을 요구해, 하나의 공용 키로 모든 사용자에게 데이터를 서빙하는 기존 방식(Binance, D-010)을 그대로 재사용할 수 없음이 드러남
- 선택:
  - **Provider**: Tiingo 공개 REST API(`GET /tiingo/daily/<ticker>/prices`). 무료 "Starter" 티어가 원시 OHLC와 수정주가(`adjOpen/High/Low/Close`, `splitFactor`, `divCash`)를 같은 응답에 포함 — 조사한 대안(Alpha Vantage: 수정주가 엔드포인트가 프리미엄 전용으로 전환됨; Twelve Data·Financial Modeling Prep: 재배포 시 유료 애드온 필요; Alpaca: 브로커리지 계정 개설 전제, 재배포 조건 불명확) 중 유일하게 무료 티어로 수정주가를 확인함
  - **BYOK(Bring-Your-Own-Key)**: 앱은 Tiingo 데이터를 재배포하지 않는다 — 각 사용자가 Tiingo에 직접 가입해 발급받은 자신의 무료 키를 앱에 입력한다. Provider·Repository 등은 이 키를 저장·전송하지 않고, `ApiKeyStore` 포트로 로컬에만 보관한다
  - **키 저장**: Rust `keyring` crate(v4, `windows-native-keyring-store` feature) → Windows 자격 증명 관리자. `docs/09 §2`가 요구하는 "OS 보안 저장소"의 실제 구현. `tauri-plugin-stronghold`(자체 볼트, 별도 비밀번호·salt 필요)보다 단일 문자열 저장에는 과함
  - **HTTP 전송**: Tiingo는 CORS를 지원하지 않음(curl로 `Origin` 헤더를 보내도 `Access-Control-Allow-Origin` 미응답 확인) — 기존 webview `fetch`(`fetchHttpClient`, D-013)로는 호출 불가. 공식 `tauri-plugin-http`/`@tauri-apps/plugin-http`를 Tiingo 전용으로 추가하고, capability를 `https://api.tiingo.com/*`로만 스코프. Binance는 CORS가 열려 있어(D-013) 기존 `fetchHttpClient`를 그대로 유지
  - **다중 Provider 조합**: `AppComposition.provider`(단일) → `providers: ReadonlyMap<providerId, MarketDataProvider>`로 확장하고, `prepareReplaySession`이 자산마다 `instrument.providerId`로 알맞은 Provider를 조회하도록 변경 — 암호화폐 자산과 미국 주식 자산을 한 세션(최대 2개 비교)에 함께 선택할 수 있게 됨. 브라우저 프리뷰(`isTauri() === false`)에는 Tiingo Provider를 등록하지 않음(CORS·플러그인 모두 브라우저 프리뷰에서 동작 불가 — SQLite 영속성이 없는 것과 같은 종류의 문서화된 제약, M5 §2)
  - **오류 처리**: Tiingo는 계정 할당량 초과 시 문서화되지 않은 동작으로 HTTP 200과 평문(비-JSON) 본문을 반환하는 사례가 관찰됨(GitHub 이슈로 확인, Tiingo 공식 문서에는 명시 안 됨) — JSON 파싱 실패 시 본문에 할당량 관련 문구가 있으면 `ProviderRateLimitError`로, 아니면 `ProviderResponseError`로 분류. 키 미설정·403(잘못된 키)은 신규 `ProviderAuthError`로 구분해 UI가 docs/06 §6 "라이선스 또는 인증 설정 필요" 문구를 보여줌
  - **자산 카탈로그**: 전체 Tiingo 종목이 아니라 대형주 5종(AAPL·MSFT·GOOGL·AMZN·NVDA)만 큐레이션 — 수천 종목 검색 UI는 M7 범위 밖
- 대안: Alpha Vantage/Twelve Data/Financial Modeling Prep(위 사유로 기각), 유료 재배포 라이선스 계약(비용 발생, 사용자가 보류), `tauri-plugin-stronghold`(과설계)
- 이유: BYOK는 이 앱의 재배포 없이 무료 티어를 합법적으로 쓸 수 있는 유일한 방법이며, `docs/09_SECURITY_AND_DATA_LICENSING.md` §2("향후 주식 공급자 연결 시 API 키·OAuth 토큰을 다룰 수 있다")와 `docs/06_UI_UX_SPEC.md` §6("라이선스 또는 인증 설정 필요")가 이미 이 상황을 예견하고 있었음
- 결과: OQ-004 RESOLVED. `src/infrastructure/providers/tiingo/`, `src/infrastructure/security/`, `src/infrastructure/http/tauriHttpClient.ts`, `src/application/ports/apiKeyStore.ts`, `src/app/composition.ts`(다중 Provider), `src/features/session-setup/ProviderApiKeyField.tsx`, `docs/providers/TIINGO.md`
- 재검토 조건: Tiingo 이용조건·요금제가 바뀌거나, 재배포 라이선스를 구매하기로 결정할 때, macOS/Linux 지원이 추가되어 `keyring` crate의 다른 백엔드 검증이 필요할 때

## D-016: 제품 표시명을 Chart Reminder로 되돌림

- 상태: Accepted
- 맥락: M7 종료 후 사용자가 실제 제품명은 "Chart Reminder"였음을 확인 — D-014의 "CashOS" 확정은 잘못된 전제(로컬 폴더명·GitHub 원격 저장소명만 보고 판단)에 근거한 결정이었음
- 선택:
  - 표시명을 "Chart Reminder"로 변경 — `tauri.conf.json`(`productName`, 창 제목), `index.html` `<title>`, `src/app/appInfo.ts`의 `name`, 세션 설정 화면 제목, 세션 CSV 내보내기 헤더 주석, `src-tauri/Cargo.toml`의 `description`, `README.md`·`GOAL.md` 제목에 반영
  - D-014와 동일하게 Tauri `identifier`(`com.investmentreplay.dev`), npm 패키지명(`investment-replay`), Cargo 패키지명, SQLite 캐시 DB 파일명(`investment-replay.db`)은 변경하지 않음 — 재설치·데이터 경로 단절 방지
  - **버그 수정**: M7(D-015)에서 추가된 keyring(Windows 자격 증명 관리자) 저장 키 접두사가 `cashos.provider-api-key.*`로 표시명을 그대로 사용하고 있었음 — D-014의 "내부 식별자는 표시명과 분리해 안정적으로 유지" 원칙을 M7이 위반한 것. 표시명이 바뀔 때마다 저장된 BYOK 키가 유실되는 문제를 막기 위해 `investment-replay.provider-api-key.*`(다른 내부 식별자와 동일한 안정적 접두사)로 수정. 이 세션엔 아직 실 키로 저장한 사용자가 없어 마이그레이션 없이 안전하게 변경 가능
- 이유: 표시명은 언제든 바뀔 수 있는 정보이므로 애초에 내부 저장 키·경로에 섞여서는 안 됨. 이번 수정으로 향후 표시명이 다시 바뀌어도 저장된 데이터가 끊기지 않는다
- 결과: OQ-001 재확정. 위 파일 목록에 반영
- 재검토 조건: 표시명을 다시 바꿔야 할 필요가 생길 때 (이번엔 내부 식별자에 영향 없음을 먼저 확인)

## D-017: 한국 주식 Provider — 공공데이터포털(data.go.kr), BYOK

- 상태: Accepted
- 맥락: M8. OQ-005(한국 주식 데이터 공급자와 공개 범위)를 확정해야 함. 공식 문서·커뮤니티 자료를 직접 확인한 결과(2026-07-21, WebSearch/WebFetch), 두 후보를 비교함
  - 한국투자증권(KIS) Open API: 무료지만 실제 증권 계좌 개설이 전제 조건 — Tiingo처럼 이메일만으로 즉시 발급되는 개인 무료 키와 성격이 다르고, BYOK치고는 진입장벽이 지나치게 높음
  - 공공데이터포털(data.go.kr) "금융위원회_주식시세정보"(`GetStockSecuritiesInfoService`): data.go.kr 개인 계정만으로 자동승인 발급, 원데이터 소유자는 한국거래소(KRX). "이용허락범위 제한없음"으로 명시되어 있고 상업/재배포 제약이 별도로 언급되지 않음
- 선택:
  - **Provider**: 공공데이터포털 "금융위원회_주식시세정보"(`GET https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo`). 무료, 자동승인, 개발계정 일 10,000회(운영계정은 활용사례 등록 시 증량 가능)
  - **BYOK(Bring-Your-Own-Key)**: D-015와 동일 원칙 — 앱은 데이터를 재배포하지 않고, 각 사용자가 data.go.kr에 직접 가입해 발급받은 자신의 무료 서비스 키를 앱에 입력한다. 저장은 기존 `ApiKeyStore`/keyring 경로를 그대로 재사용(신규 Rust 코드 불필요 — D-016에서 저장 키 접두사를 표시명과 분리해 둔 덕에 Provider가 늘어나도 `investment-replay.provider-api-key.<providerId>` 패턴만 따르면 됨)
  - **HTTP 전송**: 이 API도 CORS를 지원하지 않는다(공공데이터포털 API 일반적으로 프록시 없이 브라우저 직접 호출이 불가하다는 점이 다수 자료로 확인됨) — 기존 `tauriHttpClient`(D-015에서 도입)를 재사용하고, capability를 `https://apis.data.go.kr/*`로 추가 스코프. 브라우저 프리뷰에는 등록하지 않음(Tiingo와 동일 제약)
  - **서비스 키 형식**: data.go.kr은 "Encoding"/"Decoding" 두 종류의 키를 발급한다 — 이미 URL 인코딩된 값을 그대로 쓰거나(Encoding), 원문 값에 앱이 직접 인코딩을 적용하거나(Decoding) 둘 중 하나만 써야 하며 섞으면 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`가 난다. 이 앱은 `encodeURIComponent`를 항상 적용하므로 사용자가 "Decoding"(일반 인증키, 평문) 값을 입력해야 한다 — `docs/providers/KRX_PUBLIC_DATA.md`에 명시
  - **오류 매핑**: data.go.kr 표준 OpenAPI 응답 봉투(`response.header.resultCode`)를 사용한다. `03`(NODATA)은 오류가 아니라 빈 결과, `22`는 `ProviderRateLimitError`(일일 한도 초과, 비재시도), `20/21/30/31/32/33`(키 미등록·서비스 거부 등)은 `ProviderAuthError`, `04/05`(HTTP_ERROR/SERVICETIME_OUT)는 `ProviderNetworkError`(재시도 대상), 그 외는 `ProviderResponseError`로 분류
  - **수정주가 없음**: 이 API는 원시 시세만 제공하고 분할·배당 조정가를 제공하지 않는다 — `Candle.adjustedClose`는 항상 undefined, `priceBasis: "raw"`. 시뮬레이션 엔진은 이미 `adjustedClose` 부재 시 원시 종가로 폴백하므로(M4) 엔진 변경 없이 안전
  - **KST 거래일**: 별도 휴장일 캘린더를 두지 않는다 — Binance·Tiingo와 동일하게 "공급자가 그 날짜의 행을 반환하지 않으면 비거래일"로 취급한다(응답에 없는 날은 상장 이전·중간 누락 판정 로직이 이미 처리, M5)
  - **페이지네이션**: 이 API는 `numOfRows`/`pageNo`로 명시적으로 페이지네이션한다 — Binance(D-010)와 동일하게 Provider 내부에서 페이지를 모두 모아 결합하고, `totalCount`에 못 미치면 무한루프 대신 `ProviderResponseError`로 실패한다(부분 성공을 전체 성공으로 위장하지 않음, docs/03 §3)
  - **자산 카탈로그**: 전체 KRX 상장 종목이 아니라 대형주 5종(삼성전자 005930·SK하이닉스 000660·NAVER 035420·카카오 035720·현대차 005380)만 큐레이션 — Tiingo와 동일한 범위 원칙
- 대안: 한국투자증권 KIS Open API(계좌 개설 전제라 기각), KRX 자체 Data Marketplace(유료 라이선스 전제로 보여 기각), 네이버/다음 금융 비공식 스크래핑(라이선스 근거 없음이라 기각)
- 이유: 공공데이터포털 계정은 Tiingo 가입만큼 가볍고(이메일 인증 후 즉시), "이용허락범위 제한없음"이 명시돼 있어 D-015와 같은 BYOK 논리(재배포 관계 자체가 생기지 않음)를 그대로 적용할 수 있음
- 결과: OQ-005 RESOLVED. `src/infrastructure/providers/krxPublicData/`, `src/app/composition.ts`(3번째 Provider 등록), `src/features/session-setup`(두 번째 `ProviderApiKeyField`), `src-tauri/capabilities/default.json`, `docs/providers/KRX_PUBLIC_DATA.md`
- 재검토 조건: data.go.kr 이용약관이 바뀌거나, `resultCode` 표(D-017 근거)가 실제 키로 검증한 결과와 다르게 확인될 때, 더 많은 종목이나 수정주가가 필요해질 때

## D-018: BYOK 키 .env 자동 적용(개발 편의), keyring 폴백 유지

- 상태: Accepted
- 맥락: M7·M8에서 Tiingo·공공데이터포털 키를 매번 앱 화면에서 수동 입력해야 해 개발 중 반복 작업이 됨. 사용자가 저장소 루트 `.env`에 `TIINGO_API_KEY`·`OPEN_API_KEY`·`OPEN_API_ENDPOINT`를 이미 넣어두고, 값이 있으면 자동 적용하고 없을 때만 기존 수동 입력을 쓰도록 요청함
- 선택:
  - **읽는 위치는 Rust(Tauri 백엔드)**: `dotenvy` crate로 `.env`를 로드하고(`dotenv()`는 현재 디렉토리 또는 상위에서 탐색하므로 `src-tauri`가 cwd여도 저장소 루트 `.env`를 찾음), 새 Tauri 커맨드 `get_env_provider_key`/`get_env_provider_endpoint`가 provider_id를 고정된 변수명(`tiingo`→`TIINGO_API_KEY`, `krx-public-data`→`OPEN_API_KEY`/`OPEN_API_ENDPOINT`)에만 매핑하는 허용 목록으로 값을 반환한다. **프런트엔드 Vite 빌드(`import.meta.env`)로는 절대 읽지 않는다** — Vite의 `VITE_` 프리픽스 값은 클라이언트 번들에 그대로 박히고, 이 번들이 `npm run tauri build` 산출물(GitHub Releases로 배포)에 포함되므로 그렇게 하면 개인 키가 배포 바이너리에 새어나간다(docs/09 §2 "배포 바이너리에 개발자 공용 비밀키를 내장하지 않음"). Rust에서 런타임에 `std::env::var`로 읽으면, 배포된 실행 파일 곁에는 `.env`가 없어 다른 사용자에게는 항상 `None`이라 이 위험이 원천적으로 없음
  - **우선순위**: `.env` 값이 있으면 keyring에 저장된 값보다 우선 적용하고, `AppComposition.envManagedProviderIds`에 표시해 `ProviderApiKeyField`가 수동 입력 UI 대신 "환경변수(.env)에서 자동으로 적용되었습니다" 안내만 보여준다. `.env` 값이 없으면 기존 BYOK 흐름(수동 입력 → keyring 저장)이 100% 그대로 동작한다
  - **`.env`는 여전히 비밀 저장소가 아니다**: keyring 기반 `ApiKeyStore`(D-015)를 대체하지 않는다 — `.env`는 이 저장소를 체크아웃한 개발자 로컬에서만 읽히는 값 소스일 뿐이고, `setApiKey`/`clearApiKey`·keyring 저장 경로는 변경 없이 그대로 유지. `.env`는 `.gitignore`에 이미 포함되어 있어 Git에 커밋되지 않음(기존 상태 확인됨)
- 대안: 프런트엔드 `import.meta.env`(VITE_ 프리픽스)로 직접 읽기 — 배포 바이너리에 키가 박혀 기각. `.env` 값을 keyring에 자동으로 써넣기 — 저장 시점 로직이 이중화되고 "env가 사라지면 keyring에 남은 옛 값을 계속 쓰는" 혼란스러운 상태가 생겨 기각(대신 매 실행 시 env를 읽어 우선 적용하는 방식 채택)
- 이유: 데스크톱 앱을 매번 재실행할 때마다 개발자 본인 키를 화면에서 다시 입력하는 것은 순수한 개발 마찰이고, Rust 런타임 경계에서만 읽으면 D-015의 BYOK·보안 원칙(재배포 없음, 배포 바이너리에 비밀 없음)을 조금도 훼손하지 않음
- 결과: `src-tauri/src/lib.rs`(`dotenvy` 의존성, `get_env_provider_key`/`get_env_provider_endpoint` 커맨드), `src/infrastructure/security/tauriEnvProviderConfig.ts`, `src/app/composition.ts`(`envManagedProviderIds`), `src/features/session-setup/ProviderApiKeyField.tsx`(`envManaged` prop), `README.md`(`.env` 사용법)
- 재검토 조건: macOS/Linux 등 다른 배포 방식에서 `.env`가 실수로 번들에 포함될 여지가 생기는 빌드 변경이 있을 때 재검토

## D-019: 공공데이터포털 Provider 실 키 검증 — endBasDt 배타적 경계, 엔드포인트 보정

- 상태: Accepted
- 맥락: D-018로 `.env` 자동 적용을 붙인 뒤 사용자가 실제로 한국 주식 조회에서 오류를 겪음. 사용자의 `.env`(`OPEN_API_ENDPOINT=https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService`, 오퍼레이션 경로 `/getStockPriceInfo` 없음)와 실 서비스 키로 `curl`을 통해 직접 원인을 재현·격리함(이 세션에서 처음으로 실 키 확보, M8 종료 시점의 "미검증" 위험을 실제로 검증)
- 발견:
  1. **엔드포인트 경로 누락**: 사용자가 `.env`에 서비스 루트만 넣고 오퍼레이션 경로(`/getStockPriceInfo`)를 빠뜨림 — 이 API는 그 경로가 없으면 요청 자체가 성립하지 않는다(이전 D-017 조사 때는 이 경로를 항상 하드코딩해서 넘어갔던 부분이라 `baseUrl` 오버라이드 도입 시점에 놓쳤던 사각지대)
  2. **`endBasDt`가 배타적(exclusive)이다**: `beginBasDt=20260714&endBasDt=20260716`으로 curl 직접 호출한 결과 07-14·07-15만 반환되고 07-16은 제외됨. `beginBasDt=20260720&endBasDt=20260720`(같은 날)과 `beginBasDt=20260718&endBasDt=20260720`도 07-20 데이터를 반환하지 않았고, `beginBasDt=20260720&endBasDt=20260721`이어야 07-20이 포함됨 — 즉 `[beginBasDt, endBasDt)` 반개구간이다. 기존 구현(D-017)은 "포함 범위"라는 흔한 문서·커뮤니티 서술을 그대로 따라 `endBasDt`에서 하루를 빼고 있었는데, 이게 정확히 반대 방향 오류였다 — 요청 범위의 **마지막 날짜가 항상 누락**되고 있었음(계약 테스트는 fixture 응답을 그대로 썼기 때문에 이 버그를 잡지 못함 — 실 API 호출로만 드러남)
  3. 부수적으로 확인됨: `resultCode: "00"`/`resultMsg: "NORMAL SERVICE."`, 가격 필드(`clpr` 등)는 JSON 숫자가 아니라 숫자 문자열로 옴, `totalCount=1`이어도 `items.item`은 배열로 옴 — 기존 코드는 이미 이 형태들을 방어적으로 처리하고 있어 수정 불필요
- 선택:
  - `KrxPublicDataProvider`에 `normalizeBaseUrl()` 추가 — `baseUrl` 오버라이드가 `/getStockPriceInfo`로 끝나지 않으면 자동으로 붙인다(끝 슬래시 정리 포함)
  - `endBasDt` 계산에서 하루를 빼던 로직 제거 — `range.endMs`(반개구간의 끝)의 날짜를 그대로 전달한다. 우리 도메인의 `UtcTimeRange`도 반개구간이라, 이 API의 실제 동작과 우연히 정확히 일치한다
  - 계약 테스트(`endBasDt=20240103`로 갱신)와 `baseUrl` 정규화 테스트(서비스 루트만 준 경우·끝 슬래시·이미 완전한 경로 3가지) 추가. Fixture 기반 테스트의 한계(서버가 실제로 어떤 날짜에 응답하는지는 검증 못 함)를 인지하고 이번 실 키 확인 결과를 테스트 기대값에 반영
- 이유: BYOK Provider는 문서·커뮤니티 자료만으로 구현하고 실 키 없이 넘어갔던 부분(D-017 "재검토 조건")이 실제로 문서와 다르게 동작했다 — 최초로 실 키를 확보한 지금 검증하고 즉시 수정하는 것이 다음 사용자가 같은 오류를 겪게 두는 것보다 낫다
- 결과: `src/infrastructure/providers/krxPublicData/krxPublicDataProvider.ts`(엔드포인트 정규화, endBasDt 수정), 계약 테스트 3개 추가·1개 기대값 수정, `docs/providers/KRX_PUBLIC_DATA.md`(실측 결과 반영)
- 재검토 조건: data.go.kr이 이 서비스의 날짜 범위 파라미터 의미를 문서화하거나 바꿀 때. `resultCode` 00 외 오류 경로(잘못된 키·한도 초과 등)는 여전히 미검증 — 재현되면 이 결정에 추가 기록

## D-020: 통합 투자 설정 + 표시 통화·환율 변환(Frankfurter) + 설정 탭

- 상태: Accepted
- 맥락: 사용자가 다섯 가지를 함께 요청함 — (1) 투자 방식을 자산별로 따로 설정하지 않고 한 곳에서 통합 설정, (2) 현재 환율을 반영한 환율 변환기 추가(USDT는 USD와 1:1 가정), (3) 설정 탭 신설과 표시 통화(KRW/USD(USDT)) 지정, (4) BYOK API 키 입력 UI를 설정 탭으로 이동, (5) 앱 초기 창 높이 2배(640→1280). AskUserQuestion으로 (1)의 범위를 확인한 결과 "완전 통합"(자산 전체에 동일한 투자 규칙 하나만 적용, 자산별 값 유지 기능 제거)으로 확정됨. 이 작업은 OQ-006(교차 통화 비교, 기존 DEFERRED)을 실제로 해결한다
- 선택:
  - **통합 투자 설정**: `SessionSetupForm`/`sessionSetupModel.ts`에서 자산별 `AssetFormState`(모드·금액·주기·수수료)를 제거하고, 화면 전체에 하나뿐인 `InvestmentSettingsFormState`를 자산 목록과 분리해 둔다. `AssetSelection.simulationConfig`가 자산마다 다를 수 있다는 애플리케이션 계층(`prepareReplaySession.ts`) 자체는 바꾸지 않았다 — 통합은 순수히 폼(UI) 책임이며, `buildPrepareReplaySessionRequest`가 자산마다 동일한 설정을 각 자산 고유 통화로 환산해 개별 `SimulationConfig`를 만든다
  - **환율 변환은 표시/입력 경계 전용**: 시뮬레이션 엔진·캔들 캐시는 항상 자산 고유 통화(quoteCurrency)를 그대로 쓴다(`domain-finance.md` 규칙 유지) — `src/domain/shared/fxConversion.ts`의 `convertAmount`/`convertMoney`가 유일한 변환 지점이며, (a) 통합 투자 금액 입력(표시 통화 → 자산 고유 통화), (b) 결과 화면(자산 고유 통화 → 표시 통화, `buildResultSummary`·`buildPortfolioSeries`·`buildPriceSeries`의 `"raw"` 모드)에서만 호출된다
  - **USD/USDT 1:1 가정**(사용자 명시): `fxConversion.ts`의 `USD_PEGGED_CURRENCIES`가 USD·USDT를 환율 없이 동일하게 취급한다. `convertAmount`는 KRW ↔ USD-pegged 사이에서만 실제 환율을 요구하고, 필요한데 환율이 없으면 조용히 넘어가지 않고 `DomainValidationError`로 실패한다
  - **FX Provider**: Frankfurter(`GET https://api.frankfurter.dev/v2/rate/USD/KRW`) — 무료, 키 불필요, CORS 열림(curl·브라우저 양쪽에서 직접 확인, `access-control-allow-origin: *`), 84개 중앙은행 데이터를 취합한 blended rate. Tiingo·공공데이터포털과 달리 CORS가 열려 있어 `tauri-plugin-http`가 필요 없고 기존 `fetchHttpClient`로 Tauri·브라우저 프리뷰 모두에서 동작한다 — Playwright로 브라우저 프리뷰에서 실제 환율 조회 성공을 확인함(`1 USD = 1482.6 KRW`). `FrankfurterFxRateProvider`가 1시간 in-memory 캐시를 둔다. 상세는 `docs/providers/FRANKFURTER.md`
  - **설정 탭**: `App.tsx`에 `view: "setup" | "settings"` 상태와 간단한 탭 네비게이션 추가. 새 화면 `src/features/app-settings/SettingsScreen.tsx`가 표시 통화 라디오, 현재 환율 표시(+새로고침 버튼), 그리고 기존에 메인 설정 화면에 있던 `ProviderApiKeyField`(Tiingo·공공데이터포털) 두 개를 옮겨받는다
  - **표시 통화 영속화**: 새 포트 `AppSettingsStore`(`getDisplayCurrency`/`setDisplayCurrency`, 기본값 KRW) — BYOK 비밀정보를 다루는 `ApiKeyStore`와 책임을 분리한다. Tauri는 SQLite 마이그레이션 버전 3(`app_settings` key/value 테이블, `replay_sessions`와 같은 패턴), 브라우저 프리뷰는 `InMemoryAppSettingsStore`
  - **창 높이**: `src-tauri/tauri.conf.json`의 `app.windows[0].height`를 640 → 1280으로 변경
- 대안: 자산별 투자 규칙 유지 + UI만 통합 배치 — AskUserQuestion에서 기각(완전 통합 선택). 과거 날짜별 환율 정합(historical FX matching) — 사용자가 "현재 환율"만 요구해 범위 밖으로 판단, 필요해지면 별도 재검토
- 이유: 서로 다른 통화 자산을 비교할 때 투자 규칙까지 자산마다 다르면 "같은 조건에서 비교"라는 전제가 흔들린다 — 통합 설정 + 표시 통화 변환을 함께 두어야 "이 금액을 넣었다면"이라는 질문에 실제로 답이 된다. 표시 경계에서만 변환해 리플레이·시뮬레이션 엔진의 Provider·통화 독립성(GOAL.md §8)을 훼손하지 않는다
- 결과: `src/domain/shared/fxConversion.ts`, `src/application/ports/fxRateProvider.ts`(+`FxRateError`), `src/application/ports/appSettingsStore.ts`, `src/infrastructure/fx/frankfurterFxRateProvider.ts`, `src/infrastructure/persistence/{sqlite,inMemory}AppSettingsStore.ts`(+migrations.ts v3), `src/features/app-settings/SettingsScreen.tsx`, `src/features/session-setup/sessionSetupModel.ts`·`SessionSetupForm.tsx`(통합), `src/features/replay-workspace/viewModel.ts`·`ReplayWorkspace.tsx`(통화 환산 표시), `src/App.tsx`(탭 네비게이션), `src-tauri/tauri.conf.json`(창 높이)
- 재검토 조건: KRW·USD·USDT 외 통화(예: 다른 주식 시장) 자산이 추가되면 `fxConversion.ts`의 지원 통화 목록·환율 소스를 확장해야 함. 과거 날짜별 환율이 필요해지는 요구가 생기면(예: 특정 리플레이 시점 기준 손익 재현) 별도 결정 필요

## D-021: 종목 검색 지원(큐레이션 5종 한정 해제) — 암호화폐는 기존 유지

- 상태: Accepted
- 맥락: 사용자가 "비교 종목을 특정 종목으로 한정하지 않고 검색하는 기능"을 요청하되 "암호화폐는 기존 유지"를 명시함. M7/M8은 각각 Tiingo·공공데이터포털을 대형주 5종으로 큐레이션하고 "전체 종목 검색 UI는 범위 밖"이라 명시적으로 미뤄뒀었다(D-015, D-017) — 이번이 그 범위를 여는 작업이다. `MarketDataProvider.searchInstruments(query)` 포트는 M2부터 이미 존재했지만, 지금까지 모든 구현체가 작은 고정 배열을 필터링하는 자리표시자였다
- 조사 결과(실 키로 확인, 2026-07-21):
  - **Tiingo Search API**(`GET /tiingo/utilities/search?query=`)는 정상 동작 확인(curl). 공식 문서가 "early beta"라고 표시하지만 실제 응답은 안정적으로 옴. 같은 티커가 여러 국가로 중복 노출되어(`countryCode`) 필터링이 필요했음
  - **공공데이터포털 종목 검색**("금융위원회_KRX상장종목정보", `GetKrxListedInfoService`)은 가격 조회("금융위원회_주식시세정보")와 **완전히 별개 서비스**다 — 같은 `serviceKey`라도 이 서비스를 data.go.kr에서 추가로 활용신청하지 않으면 `403 Forbidden`(JSON도 아닌 평문)이 온다. 이 세션에서 사용 중인 실 키는 가격 서비스만 신청돼 있어 이 발견을 했을 뿐 실제 검색 성공 응답은 확인하지 못했다 — **사용자가 별도로 활용신청해야 한다**
  - 이 검색 API는 `basDt`(기준일)가 필수이고, 종목명 부분검색 파라미터는 `likeItmsNm`(가격 API의 `likeSrtnCd`와 이름은 다르지만 같은 LIKE 검색 패턴)이다
- 선택:
  - **크립토(Binance)는 그대로 둔다**(사용자 명시) — `BinanceProvider.searchInstruments`는 여전히 고정 3종(BTC/ETH/SOL)을 필터링만 한다. GOAL.md §4가 애초에 "암호화폐: BTC, ETH, SOL"로 못 박아 둔 제품 범위와 일치한다
  - **Tiingo·공공데이터포털**: `searchInstruments`가 빈 질의면 기존 큐레이션 5종(기본 추천)을 그대로 반환하고, 실제 입력이 있으면 각 Provider의 실제 검색 엔드포인트를 호출한다. BYOK 키가 없으면 빈 질의는 여전히 동작(defaults만), 실제 검색은 `ProviderAuthError`
  - **다중 Provider 통합 검색**: 새 유스케이스 `searchInstrumentsAcrossProviders`(`src/application/use-cases/searchInstruments.ts`)가 등록된 모든 Provider에 동시에 검색을 요청하고 `Promise.allSettled`로 결과를 합친다 — 한 Provider(예: 검색 서비스 미활용신청 상태의 공공데이터포털)가 실패해도 크립토·Tiingo 결과까지 막지 않는다. "먼저 시장을 고르고 검색"이 아니라 하나의 검색창에서 모든 provider를 한 번에 찾는 방식을 택했다(더 간단한 UX, provider 선택 단계 불필요)
  - **UI**: `SessionSetupForm`의 자산별 `<select>` 드롭다운을 `InstrumentSearchField`(디바운스 300ms 콤보박스, `src/features/session-setup/`)로 교체. 결과를 `<button>` 목록으로 렌더링해 별도 ARIA combobox 구현 없이도 Tab/Enter 키보드 조작이 되게 했다(ui.md "키보드 접근")
  - **세션 저장·불러오기 보정**: 검색으로 고른(큐레이션 밖) 자산을 저장한 세션은 기존 방식대로면 재로드 시 "카탈로그에서 찾을 수 없음" 오류가 났다 — `sessionPersistenceModel.ts`에 `buildCatalogForRecord`를 추가해, 저장된 자산이 기본 카탈로그에 없으면 해당 provider에 `providerSymbol`로 재검색해 보충한 뒤 기존 `restoreSessionFromRecord`를 호출한다
- 대안: "시장 선택 후 검색"(provider별 탭/드롭다운 먼저 선택) — 통합 검색 하나가 더 간단하고 자연스러워 기각. 공공데이터포털 검색 미활용신청 상태를 자동 감지해 검색 UI 자체를 숨기는 방안 — 활용신청은 사용자가 아무 때나 할 수 있고 앱이 그 상태를 미리 알 방법이 없어(호출해봐야 안다) 기각, 대신 오류 메시지로 안내
- 이유: 큐레이션 5종은 M7/M8 범위 축소를 위한 임시 조치였고(D-015/D-017에 이미 "전체 종목 검색 UI는 범위 밖"이라고 재검토 여지를 남겨둠), 실제 Provider들이 검색 API를 제공하는 이상 계속 5종으로 막아둘 이유가 없다. 크립토는 GOAL.md가 정한 제품 범위 자체라 이번 요청과 무관하게 유지
- 결과: `src/application/use-cases/searchInstruments.ts`, `src/features/session-setup/InstrumentSearchField.{tsx,css}`, `src/infrastructure/providers/tiingo/tiingoProvider.ts`·`krxPublicData/krxPublicDataProvider.ts`(`searchInstruments` 재구현), `src/features/session-setup/sessionSetupModel.ts`·`SessionSetupForm.tsx`·`sessionPersistenceModel.ts`·`SavedSessionsPanel.tsx`, `docs/providers/TIINGO.md`·`KRX_PUBLIC_DATA.md`
- 재검토 조건: 사용자가 공공데이터포털에서 "금융위원회_KRX상장종목정보"를 활용신청한 뒤 실제 검색 응답(특히 `srtnCd`의 "A" 접두사 여부)을 1회 확인 필요 — 가정과 다르면 `normalizeSearchResults` 수정. Tiingo Search API가 beta를 벗어나며 응답 스키마가 바뀌면 함께 갱신

## D-022: 검색 결과 수 — KRX 상한 상향, Tiingo는 서버 제한으로 현행 유지

- 상태: Accepted
- 맥락: D-021 배포 후 사용자가 "검색되는 주식 목록 수가 한정적"이라며 "전체 주식" 중에서 검색하게 해 달라고 요청. 실 키로 두 Provider를 각각 조사한 결과 원인이 서로 다름이 드러남
- 조사 결과(실측, 2026-07-21):
  - **Tiingo** `/utilities/search`는 쿼리 폭과 무관하게 서버 측에서 쿼리당 최대 10건만 반환한다 — curl로 "tech"·"bank"·"a" 등 매우 넓은 질의를 시도해도 항상 10건이었다. 이 앱의 `MAX_SEARCH_RESULTS`(20)는 애초에 이 한도보다 커서 아무 영향이 없었다 — 병목은 Tiingo 서버였다. 전체 커버리지를 원하면 Tiingo가 별도 제공하는 벌크 티커 목록(`supported_tickers.zip`, 약 10.7만 행·미국 Stock만 약 4.9만 건)을 함께 써야 하지만, 이 목록에는 `ticker`/`exchange`/`assetType`/`priceCurrency`/`startDate`/`endDate`만 있고 **회사명이 없다** — 실제로 내려받아 확인함(curl + unzip)
  - **공공데이터포털 검색**(`GetKrxListedInfoService`)은 반대로 이 앱이 스스로 `numOfRows=20`을 걸어 뒀을 뿐이다 — API 자체의 제한이 아니다(가격 조회 서비스가 이미 `numOfRows=500`으로 페이지네이션하는 것과 같은 API 계열)
- 선택:
  - **Tiingo는 현재 방식 유지**(AskUserQuestion으로 확정) — 벌크 목록을 추가하면 새 의존성(zip 해제 라이브러리)과 "회사명 없는 검색 결과"라는 품질 저하 트레이드오프가 있어, 사용자가 기존 10건 제한을 그대로 받아들이기로 함
  - **공공데이터포털은 `MAX_SEARCH_RESULTS`(=요청 `numOfRows`)를 20 → 50으로 상향** — KRX 전체 상장 종목이 약 2,600개뿐이라 이름 검색 결과가 50건을 넘는 경우는 드물어, 사실상 "전체 종목 중 검색"에 해당한다. 트레이드오프 없는 단순 상수 변경
- 대안: Tiingo 벌크 티커 목록 추가 — 사용자가 명시적으로 기각(회사명 손실 트레이드오프)
- 이유: 같은 증상("검색 목록이 한정적")이라도 원인이 Provider마다 다를 수 있어 실측으로 각각 확인하고 근거 없이 동일한 처방(상수 상향)을 두 곳에 다 적용하지 않았다 — Tiingo에 상수를 더 올려봤자 서버 한도 때문에 효과가 없었을 것이다
- 결과: `src/infrastructure/providers/krxPublicData/krxPublicDataProvider.ts`(`MAX_SEARCH_RESULTS` 20→50 + 근거 주석), `src/infrastructure/providers/tiingo/tiingoProvider.ts`(현행 유지 근거를 주석으로 명시)
- 재검토 조건: Tiingo가 향후 검색 결과 상한을 공식 문서화하거나 늘리면 재검토. 공공데이터포털도 활용신청 후 실제 검색 결과 건수를 확인하면(D-021 미검증 항목) 50이 충분한지 재확인 필요

## 새 결정 템플릿

```text
## D-XXX: 제목
- 상태: Proposed | Accepted | Superseded | Rejected
- 맥락:
- 선택:
- 대안:
- 이유:
- 결과:
- 재검토 조건:
```
