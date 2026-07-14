# 아키텍처 명세

## 1. 기본 선택

- Desktop shell: Tauri 2
- UI: React + TypeScript + Vite
- Local storage: SQLite
- Chart: Lightweight Charts 우선 검토
- State: 작은 로컬 UI 상태와 서버/비동기 상태를 구분
- Test: 단위 테스트 + Provider 계약 테스트 + 통합 테스트 + 후속 E2E

라이브러리의 구체 버전과 API는 구현 시점의 공식 문서를 확인한다.

## 2. 구조적 원칙

의존성은 바깥에서 안쪽으로 향한다.

```text
UI / Tauri / SQLite / HTTP Provider
                ↓
Application use cases and ports
                ↓
Pure domain model and rules
```

도메인은 다음을 몰라야 한다.

- React
- Tauri
- SQLite
- Binance 또는 특정 공급자
- 네트워크
- 파일 시스템
- 차트 라이브러리

## 3. 권장 모듈

```text
src/
├─ app/                  앱 부트스트랩, 라우팅 또는 최상위 조합
├─ domain/
│  ├─ instrument/
│  ├─ market-data/
│  ├─ replay/
│  ├─ simulation/
│  └─ shared/
├─ application/
│  ├─ ports/
│  └─ use-cases/
├─ infrastructure/
│  ├─ providers/
│  ├─ persistence/
│  ├─ tauri/
│  └─ export/
├─ features/
│  ├─ session-setup/
│  ├─ replay-workspace/
│  └─ result-summary/
├─ components/
└─ test/
```

구조는 목적이며 폴더 이름 자체가 목적은 아니다. 기존 스캐폴딩과 충돌하면 의미 있는 경계를 우선한다.

## 4. 핵심 포트

```typescript
interface MarketDataProvider {
  readonly id: string;
  searchInstruments(query: string): Promise<Instrument[]>;
  getCandles(request: CandleQuery): Promise<ProviderCandleBatch>;
}

interface CandleRepository {
  findRange(query: CandleQuery): Promise<CandleRangeResult>;
  upsertBatch(batch: CandleBatch): Promise<void>;
}

interface SessionRepository {
  save(session: SavedReplaySession): Promise<void>;
  get(id: string): Promise<SavedReplaySession | null>;
  list(): Promise<SavedReplaySessionSummary[]>;
}
```

정확한 타입은 도메인 명세를 따른다.

## 5. 데이터 흐름

```text
사용자 설정
  ↓
PrepareReplaySession use case
  ↓
로컬 캐시 범위 확인
  ↓ 부족한 구간만 요청
MarketDataProvider
  ↓
정규화 + 검증
  ↓
CandleRepository 저장
  ↓
ReplayDataset 생성
  ↓
ReplayEngine + SimulationEngine
  ↓
View model
  ↓
Chart adapter
```

## 6. 단일 저장소를 유지하는 이유

현재는 데스크톱 앱 하나다. 미리 모노레포를 만들면 설정·빌드·경로·패키지 배포 복잡도만 증가한다.

웹 뷰어 개발이 실제로 승인되면 순수 도메인·애플리케이션 계층을 공유 패키지로 추출한다.

## 7. Tauri 경계

Tauri는 다음 역할에만 사용한다.

- 데스크톱 창과 패키징
- 로컬 파일 또는 DB 접근
- 필요 시 네이티브 HTTP·보안 저장소
- 내보내기 파일 저장

단순 계산을 이유 없이 Rust로 옮기지 않는다. 성능 측정으로 병목이 확인되기 전에는 TypeScript 도메인 엔진을 유지한다.
