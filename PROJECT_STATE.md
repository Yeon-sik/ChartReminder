# PROJECT STATE

Claude는 각 마일스톤 종료 시 이 파일을 갱신한다. 추측이나 예정사항을 완료로 표시하지 않는다.

## 현재 단계

- 현재 마일스톤: M1 — 순수 도메인과 Golden Fixture
- 상태: DONE
- 마지막 갱신: 2026-07-14

## 완료된 마일스톤

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
- 순수 도메인 계층 (내부 모듈, 사용자 노출 기능 아님): Decimal/Money/시간 값 객체, Candle 불변조건 검증, 타임라인 합집합, Golden Fixture
- 시장 데이터 조회, 차트, 리플레이, 시뮬레이션: 미구현

## 검증 상태

| 검증 | 상태 | 마지막 명령 | 비고 |
|---|---|---|---|
| Format | PASS | `npm run format:check` | Prettier 3.9, Markdown 문서는 제외 |
| Lint | PASS | `npm run lint` | ESLint 10 flat config |
| Typecheck | PASS | `npm run typecheck` | tsc strict |
| Unit test | PASS | `npm run test` | Vitest 4, 97개 테스트 (도메인 + appInfo) |
| Integration test | NOT_CONFIGURED | - | M2 Provider 계약 테스트에서 도입 예정 |
| Cargo check | PASS | `npm run check:rust` | 9s (M1, 2026-07-14) |
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

## 열린 문제

- `docs/OPEN_QUESTIONS.md` 참조 (OQ-002는 RESOLVED)
- GitHub 원격 저장소가 아직 없어 CI 미구성 (D-008)

## 다음 작업

1. `prompts/03_M2_CRYPTO_PROVIDER.md` 수행 (암호화폐 Provider와 로컬 캐시)
   - 선행 결정 필요: OQ-003 (암호화폐 기준 거래쌍 USDT vs USD)
