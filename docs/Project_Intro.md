# Chart Reminder | 과거 투자 경로를 날짜별로 재생·비교하는 Windows 앱

과거의 특정 기간으로 돌아가 최대 3개 자산에 같은 투자 규칙을 적용하고, 가격 변화와 자산가치가 날짜별로 어떻게 달라졌는지 재생하는 Tauri 기반 로컬 우선 투자 학습 도구다.

| 항목 | 내용 |
| --- | --- |
| 문서 갱신 | 2026-10-30 (Asia/Seoul) |
| 최신 감사 revision | [main@a5da933](https://github.com/Yeon-sik/ChartReminder/tree/a5da9338469a4c17c299254dec6abfe5344eab50) |
| 구현 기준 | [main@078de18](https://github.com/Yeon-sik/ChartReminder/tree/078de188388fe9fdd8c75f4a2ad012fe8ea05ee8) — 이후 변경은 project-docs/상태 문서 갱신 |
| 주요 기술 | Tauri 2 · React 19 · TypeScript · Vite · Rust · SQLite · decimal.js · Lightweight Charts |
| 저장소 | [Yeon-sik/ChartReminder](https://github.com/Yeon-sik/ChartReminder) |

## 1. 30초 요약

- 기간·자산·투자 규칙을 정하면 서로 다른 시장 달력을 공통 타임라인으로 정규화하고 날짜별 포트폴리오 경로를 재생한다.
- Binance 활성 SPOT·USDT 거래쌍 탐색, 1~3개 자산 비교, 일시투자·정기 정액매수, 수수료·소수점 매수, KRW/USD 표시, session 저장·복원과 JSON/CSV export가 구현돼 있다.
- `078de18..a5da933` 비교에서 제품 source 변경은 없고 project docs/sync/PROJECT_STATE만 변경됐다. 따라서 구현 기준은 `078de18`을 유지한다.

## 2. 문제와 해결

**문제**: 최종 수익률 한 숫자만으로는 투자 과정의 현금흐름, 낙폭, 시장별 거래일 차이와 날짜별 경로를 이해하기 어렵다.

**해결**: provider의 일봉을 공통 날짜 타임라인으로 정규화하고, 같은 전략 규칙으로 cash·position·fee·valuation을 결정론적으로 계산해 날짜별로 재생한다.

## 3. 핵심 기능과 결과

| 영역 | 현재 source에서 확인한 범위 |
| --- | --- |
| 시뮬레이션 | 결정론적 날짜별 cash/position/value 계산과 일시투자·DCA 전략. |
| 데이터 공급 | Binance 등 provider adapter와 공통 daily price timeline. |
| 비교 | 최대 3개 자산, 공통 타임라인·표시통화·수수료·소수점 처리. |
| 로컬 상태 | SQLite/session 저장·복원과 export. |
| UI | Tauri desktop + React, 차트/날짜 재생과 전략 입력. |

## 4. 검증 현황

| 항목 | 상태 | 근거와 한계 |
| --- | --- | --- |
| 최신 main diff | 저장소 검증 | `078de18..a5da933`은 제품 source 변경 없이 project-docs/상태 문서만 갱신됐다. |
| 2026-08-08 quality 기록 | 부분 통과 | lint·typecheck·Vitest 516개·Rust 검사·웹 build 통과 기록이 있으나 당시 Binance PR 파일 6개의 Prettier 실패로 통합 `npm run verify`는 미통과였다. |
| Provider/browser 기록 | 과거 실행 확인 | 2026-07-31 Binance 실 API·브라우저 흐름 확인 기록이 있다. 최신 Windows 패키지와 Tiingo·한국 주식 혼합 session은 미검증이다. |

## 5. 현재 한계와 다음 단계

- 투자 시뮬레이션은 교육·비교 도구이며 실제 체결·세금·슬리피지·투자 조언을 의미하지 않는다.
- 최신 Windows installer와 모든 provider의 현재 운영 가용성은 별도 검증이 필요하다.
- 다음 우선 작업은 formatting gate를 정리하고 최신 desktop package에서 저장·복원·실 provider session을 종단 확인하는 것이다.

## 6. 관련 문서

- [프로젝트 상세](./Project_Detail.md)
- [PROJECT_STATE](../PROJECT_STATE.md)
- [README](../README.md)

Git Markdown이 원본이며 Notion은 생성 미러다.
