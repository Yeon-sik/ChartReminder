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
