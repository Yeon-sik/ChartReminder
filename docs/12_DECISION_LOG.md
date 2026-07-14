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
