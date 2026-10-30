# Chart Reminder | Project Detail

2026-10-30 (Asia/Seoul) 갱신. 최신 감사 revision은 [main@a5da933](https://github.com/Yeon-sik/ChartReminder/tree/a5da9338469a4c17c299254dec6abfe5344eab50), 구현 기준은 [main@078de18](https://github.com/Yeon-sik/ChartReminder/tree/078de188388fe9fdd8c75f4a2ad012fe8ea05ee8)이다. 두 revision 사이에는 제품 source 변경이 없고 project-docs/상태 문서만 변경됐다.

## 1. 문서 목적과 범위

Chart Reminder는 과거 기간에 투자 규칙을 적용했을 때 날짜별 자산 가치·현금·포지션이 어떻게 변하는지 재생하는 Tauri 2 Windows 데스크톱 앱이다. 실제 매매 실행이나 투자 추천은 범위 밖이다.

## 2. 시스템 아키텍처

```text
React UI / strategy form / timeline playback
  -> domain simulation
     -> normalized daily timeline
     -> cash / position / fee / valuation
  -> provider adapters
     -> Binance / configured market sources
  -> local session persistence / SQLite
  -> chart / table / JSON·CSV export
Tauri Rust -> desktop shell / filesystem / native boundary
```

## 3. 데이터 모델과 불변식

- 같은 입력과 가격 series에는 결정론적 결과를 내야 한다.
- 거래일이 다른 자산을 단순 index로 맞추지 않고 공통 날짜 timeline으로 정규화한다.
- 미래 데이터로 과거 날짜의 매수 결정을 보정하지 않는다.
- 가격 누락·provider 실패·통화 변환 상태를 0으로 조용히 대체하지 않는다.
- 저장 session과 export는 계산 입력·결과를 재현할 수 있는 경계를 유지한다.
- 실제 체결·세금·슬리피지·유동성을 시뮬레이션 수익률과 동일시하지 않는다.

## 4. 핵심 기술 의사결정

### 결정 1. 시뮬레이션 core와 provider 분리
시장 데이터 공급자를 바꿔도 투자 규칙·평가 계산의 의미가 바뀌지 않게 한다.

### 결정 2. 공통 날짜 timeline
서로 다른 시장 달력의 자산을 비교하기 위해 날짜 축을 명시적으로 정규화한다.

### 결정 3. local-first session
개인 시뮬레이션 입력·결과를 서버 계정 없이 저장·복원하고 export할 수 있게 한다.

## 5. 테스트와 검증 전략

| 검사 | 결과 | 근거와 한계 |
| --- | --- | --- |
| 최신 main diff | 저장소 검증 | `078de18..a5da933`은 project docs/sync/PROJECT_STATE 변경이며 제품 source 차이는 없다. |
| 2026-08-08 quality 기록 | 부분 통과 | lint·typecheck·Vitest 516개·Rust 검사·web build 통과. 당시 6개 파일 formatting 실패로 통합 verify는 미통과. |
| 실 provider/browser | 과거 실행 확인 | 2026-07-31 Binance 실 API·브라우저 흐름 확인 기록. 최신 provider 전체와 desktop installer는 미검증. |

## 6. 배포·운영·복구

- web build 성공과 Windows installer/runtime 성공을 구분한다.
- provider 오류 시 마지막 성공 데이터를 최신 실시간 값으로 가장하지 않는다.
- session persistence 오류가 계산 결과를 임의 재생성·덮어쓰기하지 않게 한다.
- 문서 발행은 Git Markdown canonical→Notion mirror 경계로 관리한다.

## 7. 한계, 기술 부채, 다음 단계

- 최신 desktop packaging과 실 provider 조합을 이번 작업에서 재실행하지 않았다.
- formatting gate가 전체 verify 통과를 막았던 기록이 있으므로 quality gate를 다시 닫아야 한다.
- 다음 우선 작업은 formatting 수정 후 Windows package에서 provider fetch→simulation→save/restore→export를 종단 검증하는 것이다.

## 8. 근거와 관련 문서

- [최신 감사 revision](https://github.com/Yeon-sik/ChartReminder/tree/a5da9338469a4c17c299254dec6abfe5344eab50)
- [구현 기준 revision](https://github.com/Yeon-sik/ChartReminder/tree/078de188388fe9fdd8c75f4a2ad012fe8ea05ee8)
- [Project Intro](./Project_Intro.md)
- [PROJECT_STATE](../PROJECT_STATE.md)
- [README](../README.md)
