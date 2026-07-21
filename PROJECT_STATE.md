# PROJECT STATE

Claude는 각 마일스톤 종료 시 이 파일을 갱신한다. 추측이나 예정사항을 완료로 표시하지 않는다.

## 현재 단계

- 현재 마일스톤: M7 — 미국 주식 Provider
- 상태: DONE
- 마지막 갱신: 2026-07-19

## 완료된 마일스톤

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

## 검증 상태

| 검증 | 상태 | 마지막 명령 | 비고 |
|---|---|---|---|
| Format | PASS | `npm run format:check` | 2026-07-19, Prettier 3.9 |
| Lint | PASS | `npm run lint` | 2026-07-19, ESLint 10 flat config |
| Typecheck | PASS | `npm run typecheck` | 2026-07-19, tsc strict |
| Unit test | PASS | `npm run test` | 2026-07-19, Vitest 4 + jsdom, 404개 통과 + live 1개 skip |
| Integration test | PASS | `npm run test` | Provider 계약(Binance+Tiingo) + SQLite(better-sqlite3) + use case + React 컴포넌트 통합 + 세션 저장소 포함 |
| Live API smoke | PASS (opt-in) | `$env:LIVE_API="1"; npm run test` | 기본 실행에서 제외, Binance 대상 2026-07-14 수동 1회 PASS 이후 재실행 안 함. Tiingo용 live smoke는 아직 없음(실 키 필요) |
| Cargo check | PASS | `npm run check:rust` | 2026-07-19, `tauri-plugin-dialog`+`tauri-plugin-http`+`keyring` 추가 반영 |
| npm audit | PASS | `npm audit --production` | 2026-07-19(M6 시점), M7 신규 의존성(`@tauri-apps/plugin-http`) 이후 재실행 안 함 |
| Production build | PASS | `npm run build` | 2026-07-19, tsc + vite build (M7 변경 포함 재검증) |
| Desktop build | PASS (M6 시점) | `npm run tauri build` | 2026-07-19(M6), `CashOS_0.1.0_x64_en-US.msi` + `CashOS_0.1.0_x64-setup.exe` 생성. M7의 새 Rust 의존성(`keyring`, `tauri-plugin-http`) 포함한 재빌드는 아직 안 함 — `cargo check`만 확인 |
| 설치 테스트 | 부분 PASS (M6 시점) | NSIS `/S` 설치 → 실행 → `uninstall.exe /S` | 2026-07-19(M6), 이 머신에서 1회 확인. MSI는 비관리자 셸이라 all-users 설치 권한 부족(Error 1925)으로 미검증. M7 이후 재검증 안 함 |
| 브라우저 실사용 검증 | PASS | Playwright MCP, `npm run dev` | 2026-07-19: 설정 화면 로드, 크립토 카탈로그만 노출(Tiingo 미등록 설계대로), 콘솔 오류 없음(파비콘 404 제외) 확인. M6 세션 저장·내보내기, M7 Tiingo 데이터 조회(BYOK 키 입력→실 데이터→재생)는 Tauri 데스크톱 런타임이 필요해 브라우저 프리뷰로 검증 불가 — `npm run tauri dev` + 실 Tiingo 키로 사용자 확인 필요 |

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
- 다중 Provider 조합: `AppComposition.providers`가 providerId → Provider 맵을 보관하고, `prepareReplaySession`이 자산마다 알맞은 Provider를 조회 (D-015) — 향후 한국 주식(M8) 추가도 같은 패턴 재사용 가능

## 열린 문제

- `docs/OPEN_QUESTIONS.md` 참조 (OQ-001·OQ-002·OQ-004·OQ-007 RESOLVED)
- GitHub 원격 저장소 생성됨(`Yeon-sik/CashOS.git`), CI 워크플로 자체는 아직 없음 (D-008). D-016으로 표시명이 Chart Reminder로 바뀌어 원격 저장소명·draft GitHub Release(`v0.1.0-alpha`, `CashOS_0.1.0_x64...` 설치 파일 첨부)가 이제 표시명과 불일치 — 저장소 이름 변경·릴리스 자산 교체 여부는 외부 시스템 변경이라 사용자 판단 필요, Claude가 임의로 변경하지 않음
- 다크 모드 명암비는 토큰 값으로만 검토했고 OS 다크모드 전환으로 직접 스크린샷 검증하지는 못함(Playwright MCP에 media emulation 도구 없음, M5부터 이어지는 항목)
- M6 남은 위험: MSI(all-users) 설치는 관리자 권한 환경에서 미검증(이 세션은 비관리자 셸). 진짜 "신규 환경"(별도 물리·가상 머신) 설치 테스트는 아직 없음. GitHub Release는 draft 상태로 유지 중이며 게시(publish)는 사용자 판단 필요
- M7 남은 위험: (1) 실 Tiingo 키로 종단 검증 미실시 — 이 세션에 실 API 키가 없어 BYOK 키 입력→저장→암호화폐/미국 주식 혼합 세션→재생→수정주가 토글의 실제 데이터 흐름은 사용자가 `npm run tauri dev`로 1회 확인 필요. (2) Tiingo의 "HTTP 200 + 평문 할당량 초과 응답" 분류는 공식 문서가 아니라 관찰(GitHub 이슈)에 근거한 휴리스틱이라 문구가 바뀌면 갱신 필요. (3) M6 시점 `.msi`/`.exe`는 M7의 새 Rust 의존성(`keyring`, `tauri-plugin-http`)을 포함해 재빌드되지 않음 — 다음 릴리스 전 `npm run tauri build` 재실행 필요

## 다음 작업

1. 실 Tiingo 무료 키로 `npm run tauri dev` 종단 확인(BYOK 입력 → 암호화폐+미국 주식 혼합 세션 → 수정주가 토글 → 재생) — 사용자 진행 중
2. `npm run tauri build`로 재빌드 — M7의 새 Rust 의존성(`keyring`, `tauri-plugin-http`)과 D-016 표시명 변경(`Chart Reminder_0.1.0_x64...`) 반영
3. M8 — 한국 주식 Provider(OQ-005)
4. (선택) MSI 설치를 관리자 권한 환경 또는 별도 머신에서 재검증, GitHub 원격 저장소명·draft Release 이름 정리 여부 결정
