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
