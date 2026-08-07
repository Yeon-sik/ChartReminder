# Chart Reminder | Project Detail

> 이 문서는 Chart Reminder의 구현 근거, 아키텍처, 데이터·보안 경계, 핵심 기술 의사결정과 검증 결과를 설명한다. 빠른 소개는 [Project_Intro.md](./Project_Intro.md)를 참고한다.

| 항목 | 내용 |
| --- | --- |
| 문서 상태 | Active |
| 적용 범위 | `main` merge commit [`078de18`](https://github.com/Yeon-sik/ChartReminder/commit/078de188388fe9fdd8c75f4a2ad012fe8ea05ee8) (feature PR #3) |
| 최종 갱신 | 2026-08-08T02:40:10+09:00 |
| 문서 진실 원천 | Git 저장소의 `docs/Project_Detail.md` |
| 제품 형태 | Tauri 기반 Windows 데스크톱 앱 |
| 공개 저장소 | [Yeon-sik/ChartReminder](https://github.com/Yeon-sik/ChartReminder) |

이 문서의 “구현”은 저장소에서 확인된 사실을, “실행 확인”은 명시된 환경에서 직접 관찰한 사실을 뜻한다. 코드 존재나 로컬 빌드를 배포·실사용 증거로 간주하지 않는다.

---

## 1. 문서 목적과 범위

### 포함

- 사용자가 투자 세션을 설정하고 결과를 날짜별로 재생하는 핵심 흐름
- 시장 데이터 조회·정규화·캐시와 다중 Provider 경계
- 일시투자·정기매수 계산과 미래 데이터 비노출 규칙
- SQLite 세션 저장, 파일 내보내기, BYOK 비밀정보 분리
- 자동화된 테스트와 현재 런타임 검증 상태
- Git Markdown을 Notion 전용 페이지에 게시하는 문서 운영 경계

### 제외

- 실제 주문·브로커 연결·투자 추천
- 실시간 호가와 초단위 데이터
- 서버 계정, 클라우드 동기화, 협업 기능
- 검증되지 않은 수익성·사용자 수·성능 수치
- 현재 저장소에서 확인할 수 없는 상용 배포 상태

## 2. 문제 맥락과 제약

### 문제

정적인 과거 차트와 최종 수익률은 투자자가 실제로 겪었을 날짜별 변동, 중간 낙폭, 반복 납입과 현금 잔액을 충분히 보여 주지 못한다. 암호화폐와 주식은 거래일·통화·수정주가 제공 여부가 달라 단순 배열 결합으로는 공정한 비교가 어렵다.

### 핵심 제약

- 서로 다른 거래 달력은 관측일 합집합과 명시적인 이월 상태로 처리해야 한다.
- 금융 계산은 이진 부동소수점 누적 오차를 피해야 한다.
- UI는 현재 replay cursor 이후의 미래 결과를 노출하면 안 된다.
- Tiingo와 공공데이터포털은 사용자 키가 필요하며 브라우저 CORS 제약 때문에 Tauri 네이티브 HTTP 경계가 필요하다.
- API 키는 SQLite나 Git에 평문 저장하지 않는다.
- 시장 데이터 이용조건이 불명확하면 공개 릴리스 범위에서 제외한다.

### 성공 기준

| 기준 | 판정 방법 |
| --- | --- |
| 같은 입력의 결정론적 결과 | Golden Fixture와 도메인 단위 테스트 |
| 미래 데이터 비노출 | cursor 이전 slice를 만드는 view model 테스트와 UI 확인 |
| 자산 1~3개 비교 | 설정·use case·차트 통합 테스트 |
| 오류 복구 | Provider 준비 실패 후 같은 설정 재시도 테스트 |
| 데이터 출처와 가정 노출 | 결과 UI와 JSON·CSV 내보내기 검증 |
| 비밀정보 분리 | Rust keyring 명령과 capability·로그 경계 검토 |

## 3. 사용자와 핵심 여정

| 사용자 | 목표 | 핵심 여정 |
| --- | --- | --- |
| 과거 투자 방식을 학습하려는 개인 | 동일한 투자 규칙을 여러 자산에 적용했을 때의 경로 비교 | 기간·통화·규칙 설정 → 자산 검색·선택 → 데이터 준비 → 날짜별 재생 → 결과 저장·내보내기 |
| 로컬 도구를 선호하는 사용자 | 계정 생성 없이 세션과 키를 자신의 PC에 보관 | SQLite 세션 저장 → Windows 자격 증명 관리자에 Provider 키 저장 |

```text
사용자 입력
  → SessionSetupForm 검증
  → PrepareReplaySessionRequest
  → 캐시 범위 확인과 Provider 누락 구간 조회
  → ReplayDataset + 자산별 SimulationResult
  → ReplayEngine cursor
  → view model
  → 가격변화 차트 + 투자금 변화 차트 + 결과 요약
```

## 4. 범위와 구현 현황

| 기능 | 구현 상태 | 검증 수준 | 근거 | 남은 위험 |
| --- | --- | --- | --- | --- |
| 암호화폐 종목 탐색·일봉 조회 | 구현 완료 | 계약 테스트, 2026-07-31 live smoke·브라우저 확인 | [binanceProvider.ts](../src/infrastructure/providers/binance/binanceProvider.ts), [binanceCatalog.ts](../src/infrastructure/providers/binance/binanceCatalog.ts), Provider 테스트 | 활성 SPOT·USDT 거래쌍 수는 Binance 상장 상태에 따라 변동 |
| 미국 주식 Tiingo | 구현 완료 | 계약 테스트 | [tiingoProvider.ts](../src/infrastructure/providers/tiingo/tiingoProvider.ts) | 실제 사용자 키를 사용한 앱 종단 흐름 미검증 |
| 한국 주식 공공데이터포털 | 구현 완료 | 계약 테스트, 가격 API HTTP 기록 | [krxPublicDataProvider.ts](../src/infrastructure/providers/krxPublicData/krxPublicDataProvider.ts) | 종목 검색 활용신청과 혼합 UI 흐름 미검증 |
| 투자 시뮬레이션 | 구현 완료 | Golden Fixture·단위 테스트 | [simulationEngine.ts](../src/domain/simulation/simulationEngine.ts), [goldenFixtureSimulation.test.ts](../src/domain/simulation/goldenFixtureSimulation.test.ts) | 배당·세금·TWR·MWR는 현재 범위 밖 |
| 리플레이·seek | 구현 완료 | 단위·컴포넌트·브라우저 확인 | [replayEngine.ts](../src/domain/replay/replayEngine.ts), [PlaybackControls.test.tsx](../src/features/replay-workspace/PlaybackControls.test.tsx) | 장기간·저사양 환경 성능 수치는 측정하지 않음 |
| 세션 저장·내보내기 | 구현 완료 | 저장소·통합 테스트 | [sqliteSessionRepository.ts](../src/infrastructure/persistence/sqliteSessionRepository.ts), [exportFormat.test.ts](../src/domain/session/exportFormat.test.ts) | 실제 Tauri 재시작 복원은 최신 코드에서 미확인 |
| Windows 배포 | 부분 구현 | 과거 M6 패키지·NSIS 설치 기록 | [tauri.conf.json](../src-tauri/tauri.conf.json), [PROJECT_STATE.md](../PROJECT_STATE.md) | M7 이후 의존성을 포함한 최신 패키지 재검증 필요 |

## 5. 시스템 아키텍처

2026-07-26 codebase MCP 전체 인덱스는 1,571 nodes / 4,305 edges였다. 그래프의 핵심 경로와 2026-07-31 PR #3 병합본의 Binance 동적 카탈로그·통합 검색 경계를 다시 대조한 결과는 다음과 같다.

```text
main.tsx
  → App.tsx
  → app/composition.ts
      ├─ browser-preview: memory repositories + fetch
      └─ tauri: SQLite + native HTTP + keyring + native file export
  → features/session-setup
  → application/prepareReplaySession
      ├─ ensureCandleRangeCached
      ├─ ReplayDataset
      └─ SimulationEngine
  → features/replay-workspace/useReplaySession
  → ReplayEngine
  → viewModel
  → charts / result summary / session actions
```

### 컴포넌트 책임

| 컴포넌트 | 책임 | 의존성 방향 | 실패 시 사용자 영향 |
| --- | --- | --- | --- |
| `features/session-setup` | 입력, 자산 검색, 클라이언트 검증, 저장 세션 선택 | application 계약과 app composition | 세션을 시작할 수 없거나 잘못된 입력을 조기에 차단 |
| `application/use-cases` | 캐시·Provider·도메인 엔진 오케스트레이션 | ports와 pure domain | 데이터 준비 실패로 전환하며 같은 설정 재시도 제공 |
| `domain/market-data` | Candle·시간 범위·가격 상태 불변조건 | 외부 시스템 없음 | 잘못된 시장 데이터 거부 |
| `domain/simulation` | 투자 규칙, 납입 일정, 스냅샷·수익률·낙폭 | Decimal·시간 값 객체 | 계산 불변조건 위반을 명시적 오류로 반환 |
| `domain/replay` | cursor, 상태, 속도, seek와 타임라인 | scheduler 포트 | 재생 제어 불가, 계산 결과 자체는 유지 |
| `infrastructure/providers` | 외부 응답 조회·정규화·오류 분류 | HTTP client와 Provider API | 해당 시장 조회만 실패; 검색은 부분 성공 허용 |
| `infrastructure/persistence` | Candle 캐시, 세션, 앱 설정과 마이그레이션 | SQLite 또는 memory 구현 | 캐시·세션 영속 실패 |
| `src-tauri` | 창·패키징·파일 쓰기·keyring·환경변수·HTTP plugin | 최소 capability | 데스크톱 전용 기능 사용 불가 |

### 데이터 흐름

1. UI가 `PrepareReplaySessionRequest`를 만든다.
2. `prepareReplaySession`은 자산별 `providerId`로 Provider를 찾는다.
3. `ensureCandleRangeCached`가 로컬 보유 범위를 확인하고 부족한 구간만 조회한다.
4. Provider 응답은 Candle 불변조건에 맞게 정규화한 뒤 저장한다.
5. 선택 자산의 관측일 합집합으로 `ReplayDataset`을 만든다.
6. 자산마다 같은 UI 규칙을 고유 통화로 변환해 `SimulationResult`를 만든다.
7. `ReplayEngine` cursor가 움직일 때 view model은 현재 날짜까지만 잘라 차트와 요약을 생성한다.

## 6. 도메인 모델과 불변조건

### 핵심 데이터

| 데이터 | 생명주기 | 진실 원천 | 변경 가능성 |
| --- | --- | --- | --- |
| Instrument | Provider catalog·검색 → 세션 선택 | Provider ID와 symbol | Provider 정책에 따라 갱신 |
| Candle | Provider 조회 → 정규화 → SQLite 캐시 | 외부 시장 데이터와 provenance | 동일 키 upsert 가능 |
| ReplayDataset | 현재 요청의 Candle 집합에서 생성 | application use case | 요청마다 재생성 |
| SimulationConfig | 사용자 입력에서 자산 통화로 변환 | 저장 세션 configuration | 새 세션·재계산 시 변경 |
| PortfolioSnapshot | SimulationConfig와 날짜별 가격으로 계산 | pure simulation engine | 동일 입력이면 결정론적 |
| SavedReplaySession | 설정·속도·데이터 버전 저장 | SQLite replay_sessions | 사용자가 저장·갱신 |

### 불변조건

1. 금액·가격·수량·수수료 계산은 검증된 Decimal 경계를 사용한다.
2. Candle은 시간 순서와 OHLC 관계를 만족해야 하며 중복 키를 정규화한다.
3. 타임라인은 자산 관측일의 합집합이고, 없는 날에 가짜 Candle을 만들지 않는다.
4. 이월 평가 가격은 `fresh`와 `carried-forward` 상태를 구분한다.
5. view model은 현재 cursor 이후 데이터를 반환하지 않는다.
6. API 키는 일반 SQLite와 내보내기 파일에 포함하지 않는다.

## 7. 핵심 기술 의사결정

### 결정 1. 계산 엔진을 TypeScript 순수 도메인으로 유지

- **상황**: 데스크톱 앱이지만 핵심 병목이 입증되지 않았고 계산 규칙의 테스트 가능성이 우선이었다.
- **선택**: Tauri는 데스크톱 경계만 담당하고 replay·simulation 계산은 순수 TypeScript로 유지했다.
- **근거**: React·SQLite·HTTP 없이 Golden Fixture와 가짜 scheduler로 계산을 검증할 수 있다.
- **비용과 위험**: 대용량 구간 성능 문제가 관찰되면 Worker나 Rust 이동을 재검토해야 한다.

### 결정 2. 포트·어댑터와 단일 composition root

- **상황**: 브라우저 프리뷰와 Tauri가 저장소·HTTP·파일·보안 구현을 다르게 사용한다.
- **선택**: application port를 정의하고 [composition.ts](../src/app/composition.ts)가 런타임별 구현을 한 번 조립한다.
- **결과**: UI와 도메인을 바꾸지 않고 Binance·Tiingo·공공데이터포털과 memory·SQLite 구현을 교체할 수 있다.
- **비용과 위험**: composition root가 커질 수 있으므로 책임이 늘면 Provider·persistence factory 분리를 검토한다.

### 결정 3. Decimal과 독립 Golden Fixture

- **상황**: 일반 JavaScript `number` 누적은 금융 계산의 설명 가능성과 재현성을 약화한다.
- **선택**: decimal.js를 내부 adapter로 캡슐화하고 사람이 계산 가능한 5일 fixture로 기대값을 고정했다.
- **결과**: 수수료·수량·현금·평가액·수익률·MDD의 회귀를 독립 기대값으로 탐지한다.
- **비용과 위험**: UI·차트 경계에서 `number`로 바꿀 때 유한성·안전 범위를 계속 검사해야 한다.

### 결정 4. 캐시 우선 누락 구간 조회와 Provider별 오류 분류

- **상황**: 무료 API 호출 제한과 시장별 응답 차이가 크다.
- **선택**: SQLite 범위를 먼저 확인하고 부족한 구간만 호출하며, 응답 정규화와 오류 분류를 Provider adapter가 소유한다.
- **결과**: application·domain은 특정 API 형식을 모르고 호출량을 줄일 수 있다.
- **비용과 위험**: 공급자 정책과 오류 문구 변화는 계약 테스트와 운영 문서 갱신이 필요하다.

### 결정 5. 로컬 우선 저장과 BYOK 분리

- **상황**: 서버 계정 없이 세션을 보존하면서 외부 Provider 키를 안전하게 다뤄야 한다.
- **선택**: Candle·세션·UI 설정은 SQLite, 비밀 키는 Windows 자격 증명 관리자, 개발 편의 값은 Git 제외 `.env`로 분리했다.
- **결과**: 일반 데이터 백업과 비밀정보 수명주기를 분리한다.
- **비용과 위험**: 다른 OS 배포와 자격 증명 마이그레이션 정책은 아직 정의하지 않았다.

### 결정 6. Git Markdown을 문서 진실 원천으로 사용

- **상황**: 저장소 문서와 Notion 문서를 각각 수정하면 근거와 최신성이 갈라진다.
- **선택**: `Project_Intro.md`와 `Project_Detail.md`를 검토·커밋하고, protected GitHub Environment를 통과한 revision만 전용 Notion 페이지에 replace 방식으로 게시한다.
- **결과**: 문서도 코드와 같은 review·history·source fingerprint를 갖는다.
- **비용과 위험**: Notion 미러 페이지에 수동 메모나 child database를 두면 안 된다.

## 8. 외부 연동과 실패 경계

| 연동 대상 | 목적 | 인증·비밀정보 | 실패 처리 | 재시도·제한 | 마지막 실환경 확인 |
| --- | --- | --- | --- | --- | --- |
| Binance | 활성 USDT 현물 탐색·일봉 | 공개 API | Provider 오류를 사용자 메시지로 변환 | 종목 목록 15분 캐시·캔들 누락 구간만 조회 | 2026-07-31 live smoke |
| Tiingo | 미국 주식 검색·일봉 | 사용자 API 키, keyring | 인증·할당량·서버 오류 분류 | 제한된 재시도와 캐시 | 검색 curl 기록, 가격 앱 종단 미검증 |
| data.go.kr | 한국 주식 검색·일봉 | 사용자 서비스 키, keyring | resultCode·HTTP 오류 분류 | pagination·캐시 | 가격 HTTP 성공 기록, 검색 403 기록 |
| Frankfurter | USD/KRW 표시 환율 | 키 없음 | 마지막 성공값 또는 오류 상태 | UI 새로고침 | 2026-07-21 브라우저 실 호출 기록 |
| Notion | 승인된 Git Markdown 미러 | GitHub Environment의 `NOTION_TOKEN` | 모든 페이지 preflight 후 쓰기, 부분 실패 가시화 | 동일 revision 재실행으로 수렴 | 2026-07-28 [Actions run 30327719825](https://github.com/Yeon-sik/ChartReminder/actions/runs/30327719825)에서 source `95eeb445` Intro·Detail 게시 성공. 최신 revision은 재게시 필요 |

외부 검색형·생성형 AI는 가격 계산과 투자 결론을 만들지 않는다.

## 9. 데이터 보호와 보안

| 경계 | 정책 | 저장소 근거 |
| --- | --- | --- |
| Provider 키 | Git·SQLite·내보내기 제외, Windows keyring 저장 | [lib.rs](../src-tauri/src/lib.rs), [tauriApiKeyStore.ts](../src/infrastructure/security/tauriApiKeyStore.ts) |
| 개발 `.env` | 로컬 개발 편의만 제공, 프런트엔드 번들에 포함하지 않음 | [tauriEnvProviderConfig.ts](../src/infrastructure/security/tauriEnvProviderConfig.ts), [.gitignore](../.gitignore) |
| 파일 쓰기 | 사용자가 네이티브 저장 대화상자로 선택한 경로만 기록 | [lib.rs](../src-tauri/src/lib.rs), [tauriFileExporter.ts](../src/infrastructure/export/tauriFileExporter.ts) |
| HTTP 권한 | Tiingo·data.go.kr 도메인만 Tauri HTTP capability에 허용 | [default.json](../src-tauri/capabilities/default.json) |
| Notion 비밀 | `NOTION_TOKEN`과 page map은 protected GitHub Environment에만 저장 | [project-docs-notion.yml](../.github/workflows/project-docs-notion.yml) |

현재 `tauri.conf.json`의 CSP는 `null`이다. 허용된 capability가 제한돼 있어도 공개 릴리스 전에 CSP 정책을 별도로 검토해야 한다.

## 10. 테스트와 검증 전략

### 테스트 층

| 층 | 도구 | 검증 대상 | 현재 상태 |
| --- | --- | --- | --- |
| 포맷 검사 | Prettier | 형식 | 실패: PR #3 관련 파일 6개 |
| 정적 분석·타입 | ESLint, TypeScript | 규칙, 타입 경계 | 통과 |
| 도메인 단위 | Vitest | Decimal, Candle, timeline, replay, simulation, fixture | 통과 |
| Provider 계약 | Vitest | 정규화, 범위, 오류, 인증, pagination | 통과 |
| 저장소 통합 | Vitest + better-sqlite3 | migration, Candle·세션·설정 저장소 | 통과 |
| React 통합 | Testing Library + jsdom | 폼, 모달, 재생, 오류 복구, 접근성 상태 | 통과 |
| 브라우저 확인 | 인앱 Browser | 핵심 사용자 흐름과 콘솔 | 2026-07-26 통과 |
| Tauri 종단 | 실제 Windows 창 | native HTTP, keyring, SQLite 재시작, 패키징 | 부분 검증 |

### 검증 이력

| 일시 | 기준 | 명령·환경 | 결과 | 미검증 항목 |
| --- | --- | --- | --- | --- |
| 2026-07-28 | `2df37d6` 기반 문서 작업 트리 | `npm run verify` | PASS. Vitest 514개 통과, live 1개 skip, cargo check 통과 | 외부 API live, Tauri UI |
| 2026-07-28 | 같은 작업 트리 | `npm run build` | PASS. TypeScript + Vite production bundle | Windows 패키지 |
| 2026-07-26 | 같은 base commit의 UX 작업 트리 | 인앱 Browser | 모달 포커스 순환·복원, BTC 리플레이 요약·진행도·차트, 새 탭 콘솔 오류·경고 0건 | Tauri 전용 Provider |
| 2026-07-19 | M6 revision | `npm run tauri build`, NSIS 설치·실행·제거 | 당시 PASS | 현재 M7 이후 의존성, MSI 관리자 설치 |
| 2026-08-08 | `078de18` + docs/runtime 작업 트리 | `npm run format:check` | FAIL. `InstrumentSearchModal` 2개와 Binance Provider·catalog 관련 4개 파일이 Prettier 검사 실패 | 해당 6개 소스 포맷 정리 |
| 2026-08-08 | 같은 작업 트리 | `npm run lint`, `npm run typecheck`, `npm run test`, `npm run check:rust` | PASS. Vitest 516개 통과, live 2개 skip, cargo check 통과 | opt-in live API, Tauri UI |
| 2026-08-08 | 같은 작업 트리 | `npm run build` | PASS. TypeScript + Vite production bundle | Windows 패키지 |
| 2026-07-31 | `078de18`의 기능 commit `f55dc55` | Binance live smoke + 인앱 Browser | 활성 SPOT 1,380개 중 USDT 현물 480개, BTC 외 479개 표시, DOGE 검색·선택·캔들 차트 확인 | 상장 수 변동, 다른 Provider 혼합 |
| 2026-07-28 | source `95eeb445` | [GitHub Actions manual publish](https://github.com/Yeon-sik/ChartReminder/actions/runs/30327719825) | PASS. Intro·Detail Notion 게시 | 최신 canonical revision 재게시 |

실패하거나 건너뛴 검증은 성공으로 합치지 않는다. `LIVE_API=1`이 필요한 테스트는 기본 품질 게이트에서 제외된다.

## 11. 배포·운영·복구

```text
코드·문서 변경
  → 로컬 verify
  → 기능 브랜치 review
  → main 병합
  → 프로젝트 문서 validation
  → 수동 PUBLISH + protected environment 승인
  → Notion 전용 미러 페이지 preflight·replace
```

- **앱 배포 조건**: 현재 revision의 `npm run verify`, `npm run tauri build`, 설치·실행·제거, 실제 Provider 종단 흐름과 데이터 이용조건 확인.
- **관찰 항목**: Provider 인증·할당량·스키마 오류, 마이그레이션 실패, 내보내기 실패, Notion workflow summary.
- **백업**: 세션 JSON과 포트폴리오 CSV 내보내기를 제공한다. SQLite 전체 백업·복구 UX는 아직 제공하지 않는다.
- **복구**: DB 마이그레이션 실패 시 DB를 자동 삭제하지 않는다. Notion 부분 게시 실패는 동일 revision을 다시 실행해 이미 일치하는 페이지를 건너뛰고 수렴한다.
- **문서 게시**: [PROJECT_DOCS_OPERATIONS.md](./PROJECT_DOCS_OPERATIONS.md)의 `notion-production` Environment 설정을 따른다.

## 12. 문제 해결 사례

### 미래 데이터가 결과에 섞일 수 있는 경계

- **증상**: 전체 시뮬레이션 결과를 한 번에 계산하면 UI가 미래 날짜 값을 실수로 표시할 수 있다.
- **원인**: 계산 완료 범위와 사용자에게 공개할 replay cursor 범위가 다르다.
- **해결**: view model이 가격·투자금·요약을 cursor까지 slice하고 최종 지표는 마지막 날짜에서만 노출한다.
- **회귀 방지**: [viewModel.test.ts](../src/features/replay-workspace/viewModel.test.ts)와 ReplayWorkspace 테스트가 미래 값 비노출을 확인한다.

### 서로 다른 시장 달력 결합

- **증상**: 주말·휴장일이 다른 자산을 같은 배열 index로 비교하면 날짜가 어긋난다.
- **원인**: 자산별 Candle 날짜 집합이 서로 다르다.
- **해결**: 합집합 타임라인을 만들고 없는 날짜는 Candle을 생성하지 않으며 평가가 필요할 때만 마지막 관측 가격을 `carried-forward`로 표시한다.
- **회귀 방지**: timeline·simulation timeline·data notice 테스트.

### 표시명 변경과 저장된 API 키

- **증상**: 과거 CashOS 표시명에 keyring service key를 결합하면 제품명 변경 후 저장 키를 찾지 못한다.
- **원인**: 사용자에게 보이는 브랜드와 내부 영속 식별자를 같은 값으로 사용했다.
- **해결**: keyring 접두사를 안정적인 `investment-replay` 내부 식별자로 분리했다.
- **회귀 방지**: Rust 명령과 application key store 경계를 분리하고 문서에 마이그레이션 조건을 기록한다.

## 13. 한계, 기술 부채, 다음 단계

| 우선순위 | 항목 | 사용자·운영 영향 | 다음 행동 |
| --- | --- | --- | --- |
| P0 | 실 Tiingo·한국 주식 키를 사용한 Tauri 혼합 세션 미검증 | 계약 테스트와 실제 서비스·OS 경계 차이를 놓칠 수 있음 | 3시장 자산을 선택해 검색→준비→재생→저장까지 종단 확인 |
| P0 | 최신 Windows 패키지 미검증 | 현재 코드와 배포 파일이 일치하지 않음 | `npm run tauri build` 후 NSIS·MSI 설치·제거 재검증 |
| P0 | Provider 이용조건 출시 판정 미완료 | 공개 배포 시 데이터 라이선스 위험 | 상업 사용·표시·캐시·재배포 권한 확정 |
| P1 | 과거 CashOS draft Release·설치 자산 이름 잔존 | 현재 저장소·제품명과 릴리스 자산이 달라 사용자 혼동 가능 | 새 릴리스 전 자산·태그·링크 정리 |
| P1 | `main`의 포맷 drift 6개 | 통합 `npm run verify`가 첫 단계에서 중단 | PR #3 관련 파일만 별도 포맷하고 전체 verify 재실행 |
| P1 | CSP 미설정 | 데스크톱 WebView 보안 방어가 약함 | 필요한 도메인·리소스만 허용하는 CSP 설계·검증 |
| P1 | SQLite 전체 백업·복구 UX 없음 | 로컬 DB 손상·이동 시 복구 경로 제한 | schema version을 포함한 백업·복원 설계 |
| P2 | 성능 목표 미측정 | 장기·다자산 구간에서 체감 저하 가능 | 3자산 10년 fixture benchmark 후에만 최적화 결정 |

다음 단일 작업은 PR #3 관련 파일 6개의 포맷 drift를 별도 범위에서 정리해 `npm run verify` 전체를 복구하는 것이다. 이후 실제 키가 있는 Windows Tauri 환경에서 3시장 혼합 리플레이를 검증하고 결과를 runtime evidence로 갱신한다.

## 14. 배운 점과 재설계 방향

- **유지할 결정**: pure domain, Decimal 경계, cursor 기반 미래 데이터 차단, Provider adapter, local-first와 keyring 분리.
- **바꿀 결정**: 초기 브랜드 식별자와 공개 저장소 이름을 먼저 분리했어야 했다. 현재 저장소는 ChartReminder로 정리했으며, 다음 프로젝트에서는 내부 ID·제품명·저장소명·패키지명을 시작 단계에서 구분한다.
- **추가 검증이 필요한 가정**: Tiingo 할당량 오류 문구, 공공데이터포털 검색 응답의 symbol 형식, 실제 혼합 통화 UX, 현재 native dependency의 installer 동작.

## 15. 관련 문서

- [Project Intro](./Project_Intro.md)
- [제품 범위](./00_PRODUCT_SCOPE.md)
- [아키텍처 명세](./01_ARCHITECTURE.md)
- [도메인 모델](./02_DOMAIN_MODEL.md)
- [시뮬레이션 명세](./05_SIMULATION_ENGINE_SPEC.md)
- [테스트 전략](./08_TEST_STRATEGY.md)
- [보안과 데이터 이용조건](./09_SECURITY_AND_DATA_LICENSING.md)
- [위험 등록부](./13_RISK_REGISTER.md)
- [프로젝트 상태](../PROJECT_STATE.md)
- [문서 게시 운영](./PROJECT_DOCS_OPERATIONS.md)
