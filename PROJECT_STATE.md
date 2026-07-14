# PROJECT STATE

Claude는 각 마일스톤 종료 시 이 파일을 갱신한다. 추측이나 예정사항을 완료로 표시하지 않는다.

## 현재 단계

- 현재 마일스톤: M3 — 리플레이 엔진
- 상태: DONE
- 마지막 갱신: 2026-07-14

## 완료된 마일스톤

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

- 최소 시작 화면 (앱 목적·현재 마일스톤 상태 표시만, 기능 없음)
- 순수 도메인 계층 (내부 모듈): Decimal/Money/시간 값 객체, Candle 불변조건 검증, 타임라인 합집합, 시간 범위 연산, Golden Fixture
- 시장 데이터 계층 (내부 모듈, UI 미연결): Binance BTC·ETH·SOL USDT 일봉 조회·정규화, SQLite 캐시(누락 구간만 재조회)
- 리플레이 엔진 (내부 모듈, UI 미연결): 합집합 타임라인, 재생·일시정지·스텝·seek·속도·restart, 가짜 시계 완전 결정론
- 차트, 시뮬레이션, UI 연결: 미구현

## 검증 상태

| 검증 | 상태 | 마지막 명령 | 비고 |
|---|---|---|---|
| Format | PASS | `npm run format:check` | Prettier 3.9, Markdown 문서는 제외 |
| Lint | PASS | `npm run lint` | ESLint 10 flat config |
| Typecheck | PASS | `npm run typecheck` | tsc strict |
| Unit test | PASS | `npm run test` | Vitest 4, 193개 테스트 + live 1개 skip |
| Integration test | PASS | `npm run test` | Provider 계약 + SQLite(better-sqlite3) + use case 통합 포함 |
| Live API smoke | PASS (opt-in) | `$env:LIVE_API="1"; npm run test` | 기본 실행에서 제외, 2026-07-14 수동 1회 PASS |
| Cargo check | PASS | `npm run check:rust` | 35s (M2, tauri-plugin-sql 포함) |
| Desktop build | PASS | `npm run tauri build` | MSI + NSIS 번들 생성 (M0, 2026-07-14) |

`npm run verify`가 format:check + lint + typecheck + test + cargo check를 일괄 실행한다.

## 현재 결정

- 제품 형태: Windows 데스크톱 앱
- 초기 스택: Tauri 2 + React + TypeScript
- 초기 데이터: BTC, ETH, SOL 일봉
- 핵심 계산: AI 미사용, 결정론적 계산
- 저장: 로컬 우선
- 패키지 매니저: npm (D-006)
- 임시 identifier: `com.investmentreplay.dev` (D-007, OQ-001 확정 전까지)
- 품질 도구: Prettier + ESLint + Vitest + cargo check, CI는 GitHub 원격 생성 후 (D-008)
- Decimal 라이브러리: decimal.js 10.6.0, `src/domain/shared/decimal.ts`로 캡슐화 (D-009)
- 암호화폐 공급자: Binance 공개 klines API, USDT 거래쌍, base URL `data-api.binance.vision` (D-010, OQ-003 RESOLVED)
- SQLite: 연결은 tauri-plugin-sql, 스키마 마이그레이션은 TS 러너, 테스트는 better-sqlite3 (D-011)

## 열린 문제

- `docs/OPEN_QUESTIONS.md` 참조 (OQ-002는 RESOLVED)
- GitHub 원격 저장소가 아직 없어 CI 미구성 (D-008)

## 다음 작업

1. `prompts/05_M4_SIMULATION_ENGINE.md` 수행 (투자 시뮬레이션 엔진)
   - 선행 결정 필요: OQ-007 (MDD 정의 — 테스트·UI 명칭으로 확정)
