# Chart Reminder | 과거 투자 경로를 날짜별로 재생·비교하는 Windows 앱

> 과거의 특정 기간으로 돌아가 최대 3개 자산에 같은 투자 규칙을 적용하고, 가격 변화와 내 자산가치가 날짜별로 어떻게 달라졌는지 재생하는 로컬 우선 투자 학습 도구다.

| 항목 | 내용 |
| --- | --- |
| 개발 기간 | 2026-07 ~ 진행 중 |
| 프로젝트 형태 | 개인 Windows 데스크톱 앱 |
| 담당 범위 | 제품 범위, 아키텍처, 도메인 계산, UI, 로컬 저장, Provider 연동, 검증 |
| 현재 상태 | Alpha. 핵심 사용자 흐름은 구현됐지만 최신 데스크톱 패키징과 실 Provider 종단 검증이 남아 있음 |
| 문서 기준 | `main` merge commit `2df37d6` (feature PR #1) |
| 주요 기술 | Tauri 2, React 19, TypeScript, Vite, Rust, SQLite, decimal.js, Lightweight Charts |
| Repository | [Yeon-sik/ChartReminder](https://github.com/Yeon-sik/ChartReminder) |
| 상세 문서 | [Project_Detail.md](./Project_Detail.md) |

이 문서는 Git 저장소의 Markdown을 진실 원천으로 사용한다. Notion 페이지는 승인된 문서를 보여 주는 전용 미러이며 직접 편집하는 두 번째 원본이 아니다.

---

## 1. 30초 요약

- **문제**: 최종 수익률 한 숫자만으로는 투자 과정의 변동, 낙폭, 현금 흐름과 서로 다른 시장 달력의 영향을 이해하기 어렵다.
- **해결**: 사용자가 기간·자산·투자 규칙을 정하면 일봉 데이터를 공통 타임라인으로 정규화하고, 결정론적 시뮬레이션 결과를 날짜별로 재생한다.
- **핵심 결과**: 자산 1~3개 비교, 일시투자·정기 정액매수, 수수료·소수점 매수, KRW/USD 표시 통화, 세션 저장·복원, JSON/CSV 내보내기까지 하나의 흐름으로 연결했다.
- **검증 경계**: 2026-07-28 로컬 품질 게이트는 통과했다. 브라우저 프리뷰의 핵심 흐름도 확인했지만, 최신 코드의 Windows 설치 패키지와 실 Tiingo·한국 주식 혼합 세션은 아직 검증되지 않았다.
- **기술적 차별점**: 계산을 AI 출력에 맡기지 않고 Decimal 기반 도메인 엔진, Golden Fixture, 미래 데이터 비노출 규칙으로 재현성과 설명 가능성을 우선했다.

## 2. 문제와 해결

| 사용자 문제 | 해결 방식 | 사용자 가치 |
| --- | --- | --- |
| 최종 결과만 보면 중간 변동과 손실 구간을 놓친다 | ReplayEngine이 합집합 타임라인을 한 날짜씩 전진시키고 차트·요약을 같은 cursor로 갱신한다 | 결과가 아니라 투자 경로를 이해할 수 있다 |
| 자산마다 거래일과 통화가 달라 단순 비교가 어렵다 | 관측일 합집합, 이월 가격 상태, 표시 통화 변환을 명시적으로 모델링한다 | 빈 날짜와 환율 가정을 숨기지 않고 비교할 수 있다 |
| 반복매수와 수수료를 수작업으로 계산하기 어렵다 | 일시투자와 매주·매월 정기매수, 초기 투자 비용, 수수료, 소수점 매수 규칙을 결정론적으로 계산한다 | 같은 규칙을 여러 자산에 일관되게 적용할 수 있다 |
| 외부 데이터 키와 로컬 기록이 섞이면 보안·복구가 복잡해진다 | 시장 데이터와 세션은 SQLite, API 키는 Windows 자격 증명 관리자에 분리한다 | 비밀정보를 일반 데이터베이스에 평문 저장하지 않는다 |

이 앱은 실제 주문, 매수·매도 신호, 투자 추천을 제공하지 않는다. 과거 데이터와 명시된 가정으로 학습·비교하는 도구다.

## 3. 핵심 기능과 결과

| 영역 | 구현 결과 | 저장소 근거 |
| --- | --- | --- |
| 세션 설정 | 최대 3개 자산, 기간, 표시 기준, 표시 통화, 공통 투자 규칙을 설정한다 | [SessionSetupForm.tsx](../src/features/session-setup/SessionSetupForm.tsx), [sessionSetupModel.ts](../src/features/session-setup/sessionSetupModel.ts) |
| 자산 검색 | Binance·Tiingo·공공데이터포털 결과를 하나의 모달에서 검색하고 시장별로 필터링한다 | [InstrumentSearchModal.tsx](../src/features/session-setup/InstrumentSearchModal.tsx), [searchInstruments.ts](../src/application/use-cases/searchInstruments.ts) |
| 데이터 준비 | 캐시 범위를 확인해 누락 구간만 Provider에서 받아 정규화·저장한다 | [ensureCandleRangeCached.ts](../src/application/use-cases/ensureCandleRangeCached.ts), [prepareReplaySession.ts](../src/application/use-cases/prepareReplaySession.ts) |
| 투자 계산 | 일시투자·정기매수·수수료·소수점 수량·휴장일 이월과 수익률·낙폭을 계산한다 | [simulationEngine.ts](../src/domain/simulation/simulationEngine.ts), [contributionSchedule.ts](../src/domain/simulation/contributionSchedule.ts) |
| 리플레이 | 재생·일시정지·한 단계·seek·속도 변경·처음부터를 지원한다 | [replayEngine.ts](../src/domain/replay/replayEngine.ts), [PlaybackControls.tsx](../src/features/replay-workspace/PlaybackControls.tsx) |
| 결과 해석 | 가격 변화, 투자금 변화, 현재 가격, 현금·평가액·손익·수익률과 데이터 상태를 같은 시점으로 보여 준다 | [viewModel.ts](../src/features/replay-workspace/viewModel.ts), [ReplayWorkspace.tsx](../src/features/replay-workspace/ReplayWorkspace.tsx) |
| 저장과 내보내기 | 세션을 로컬에 저장·복원하고 JSON·CSV 파일로 내보낸다 | [saveReplaySession.ts](../src/application/use-cases/saveReplaySession.ts), [SessionActions.tsx](../src/features/replay-workspace/SessionActions.tsx) |

## 4. 사용자 흐름

```text
기간·표시 통화·투자 규칙 설정
  → 암호화폐·미국 주식·한국 주식 중 1~3개 자산 선택
  → 로컬 캐시 확인과 부족한 일봉 데이터 조회
  → 공통 타임라인과 자산별 시뮬레이션 결과 생성
  → 날짜별 재생, seek, 차트와 결과 요약 확인
  → 세션 저장·복원 또는 JSON·CSV 내보내기
```

데이터 준비가 실패하면 기존 설정을 버리지 않고 같은 요청으로 다시 시도할 수 있다. 검색 모달은 키보드 포커스 순환, Esc·배경 닫기, 닫은 뒤 원래 트리거로 포커스 복원을 지원한다.

## 5. 구조와 기술 선택

의존성은 UI와 외부 시스템에서 순수 도메인 쪽으로 향한다.

```text
React features / Tauri commands
  → application use cases + ports
  → domain replay + simulation rules

infrastructure providers / SQLite / keyring
  → application ports 구현
```

- React 컴포넌트는 Provider나 SQLite를 직접 생성하지 않는다. [composition.ts](../src/app/composition.ts)가 런타임별 구현을 조립한다.
- 도메인 계산은 React·Tauri·네트워크·차트 라이브러리를 모른다.
- 브라우저 프리뷰는 메모리 저장소를, Tauri는 SQLite와 네이티브 HTTP·보안 저장소를 사용한다.
- 2026-07-26 codebase MCP 전체 그래프는 1,571 nodes / 4,305 edges였으며, 핵심 호출 경로는 `App → SessionSetupForm → prepareReplaySession → ReplayEngine/SimulationEngine → ReplayWorkspace`로 확인됐다. 2026-07-28에는 기능 PR #1이 병합된 `main`의 실제 소스 경계를 다시 대조했다.

상세한 책임과 데이터 흐름은 [Project_Detail.md](./Project_Detail.md)에 기록한다.

## 6. 검증 현황

| 검증 항목 | 상태 | 확인일 | 근거와 범위 |
| --- | --- | --- | --- |
| 포맷·정적 분석·타입·테스트·Rust 검사 | 통과 | 2026-07-28 | `npm run verify`; Vitest 514개 통과, live API 테스트 1개 기본 제외, `cargo check` 통과 |
| 프로덕션 웹 빌드 | 통과 | 2026-07-28 | `npm run build`; TypeScript 컴파일과 Vite 번들 생성 |
| 브라우저 핵심 흐름 | 통과 | 2026-07-26 | 자산 모달 키보드 순환·포커스 복원, BTC 리플레이 요약·진행도·차트 확인, 최종 새 탭 콘솔 오류·경고 0건 |
| 현재 코드의 Tauri 패키지 빌드 | 미검증 | 2026-07-27 | M7 이후 추가된 네이티브 의존성을 포함한 `npm run tauri build` 재실행 필요 |
| 실 Tiingo 종단 흐름 | 미검증 | 2026-07-27 | 실제 사용자 키가 없어 미국 주식 혼합 세션 전체 흐름은 계약 테스트까지만 확인 |
| 실 한국 주식 혼합 세션 | 부분 검증 | 2026-07-27 | HTTP 가격 조회 성공 기록은 있으나, 현재 UI에서 검색·혼합 재생까지는 미확인 |

로컬 통과는 설치·배포·실 Provider 동작의 증거로 확대 해석하지 않는다.

## 7. 현재 한계와 다음 단계

- **P0 출시 게이트**: 실제 Tiingo 키와 공공데이터포털 키로 Tauri에서 암호화폐·미국·한국 주식 혼합 세션을 종단 확인한다.
- **P0 출시 게이트**: 최신 소스와 Rust 의존성으로 Windows 설치 파일을 다시 만들고 NSIS·MSI 설치와 제거를 검증한다.
- **P1 운영 정리**: 현재 원격 저장소는 ChartReminder로 정리됐지만, 과거 draft Release와 설치 자산에는 CashOS 이름이 남아 있다. 새 릴리스 전 자산·태그·링크를 다시 검토해야 한다.
- **P1 데이터 정책**: 각 Provider의 상업적 사용, 화면 표시, 캐시, 재배포 조건이 불명확하면 공개 릴리스에서 비활성화한다.
- **범위 밖**: 실제 주문, 투자 추천, 실시간 호가, 모바일 앱, 백엔드 계정 시스템은 현재 구현하지 않는다.

지금 해야 할 단 하나는 실제 키가 있는 Tauri 환경에서 3시장 혼합 리플레이를 검증하는 것이다.

## 8. 관련 문서

- [Project Detail](./Project_Detail.md): 아키텍처, 데이터 경계, 의사결정, 검증과 운영
- [제품 범위](./00_PRODUCT_SCOPE.md): 사용자와 포함·제외 범위
- [아키텍처 명세](./01_ARCHITECTURE.md): 계층과 포트
- [테스트 전략](./08_TEST_STRATEGY.md): 테스트 피라미드와 완료 게이트
- [보안과 데이터 이용조건](./09_SECURITY_AND_DATA_LICENSING.md): 비밀정보·권한·출시 게이트
- [문서 게시 운영](./PROJECT_DOCS_OPERATIONS.md): GitHub Environment와 Notion 미러 사용법
