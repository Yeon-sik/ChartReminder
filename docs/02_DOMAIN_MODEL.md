# 도메인 모델 명세

## 1. Instrument

가격 시계열의 비교 대상을 `Instrument`로 부른다.

```typescript
interface Instrument {
  id: string;
  symbol: string;
  displayName: string;
  assetClass: 'crypto' | 'stock';
  market: string;
  quoteCurrency: CurrencyCode;
  exchangeTimezone: string;
  providerId: string;
  providerSymbol: string;
  status: 'active' | 'inactive' | 'unknown';
}
```

`id`는 공급자 변경에도 가능한 한 안정적으로 유지되는 내부 식별자다.

## 2. Candle

```typescript
interface Candle {
  instrumentId: string;
  interval: '1d';
  openTimeUtcMs: number;
  closeTimeUtcMs: number;
  tradingDate: string;
  open: DecimalString;
  high: DecimalString;
  low: DecimalString;
  close: DecimalString;
  adjustedClose?: DecimalString;
  volume?: DecimalString;
  quoteCurrency: CurrencyCode;
  source: DataSourceRef;
}
```

### 불변조건

- `openTimeUtcMs < closeTimeUtcMs`
- OHLC 값은 유한하고 파싱 가능해야 한다.
- 일반 현물·주식 캔들은 `high >= max(open, close)`와 `low <= min(open, close)`를 만족해야 한다.
- 중복 키는 `(instrumentId, interval, openTimeUtcMs, source.provider)`다.
- 데이터 순서는 저장 전 오름차순으로 정규화한다.
- 음수 가격 가능성을 도메인 전체에서 무조건 금지하지 않는다. 향후 원자재 확장을 막기 때문이다. 현재 Provider별 정책으로 검증한다.

## 3. 정밀 수치

`DecimalString`은 직렬화 가능한 10진 문자열이다.

```typescript
type DecimalString = string;
```

도메인 계산에서는 검증된 Decimal 구현을 사용한다. 금액, 가격, 수량, 수수료를 일반 `number`로 누적 계산하지 않는다.

차트 라이브러리 입력 직전에는 안전 범위와 유한성 검사를 거쳐 `number`로 변환할 수 있다.

## 4. ReplayDataset

```typescript
interface ReplayDataset {
  timeline: TradingDate[];
  seriesByInstrument: Record<string, CandleSeries>;
  metadata: ReplayDatasetMetadata;
}
```

타임라인은 선택한 자산들의 날짜 합집합이다. 각 자산에 없는 날짜는 캔들을 생성하지 않는다.

평가금액 계산이 필요한 경우 마지막 관측 가격을 전달할 수 있으나, 상태를 명시한다.

```typescript
interface ValuationPrice {
  value: DecimalString;
  status: 'fresh' | 'carried-forward';
  observedAt: string;
}
```

## 5. SimulationConfig

```typescript
interface SimulationConfig {
  mode: 'lump-sum' | 'dca';
  initialCash: Money;
  recurring?: {
    amount: Money;
    frequency: 'weekly' | 'monthly';
    anchor: RecurringAnchor;
  };
  executionPrice: 'close';
  feeRate: DecimalString;
  allowFractionalQuantity: boolean;
  dividendPolicy: 'adjusted-price' | 'ignore';
}
```

## 6. PortfolioSnapshot

```typescript
interface PortfolioSnapshot {
  date: TradingDate;
  contributedCapital: Money;
  cash: Money;
  positionQuantity: DecimalString;
  marketValue: Money;
  totalValue: Money;
  profitLoss: Money;
  returnRate: DecimalString;
  drawdownRate: DecimalString;
  priceStatus: 'fresh' | 'carried-forward';
}
```

## 7. 데이터 출처

각 데이터 포인트 또는 배치에는 다음이 추적돼야 한다.

- 공급자
- 공급자 심볼
- 조회 시각
- 원시/수정 가격 구분
- 통화
- 데이터 버전 또는 캐시 생성 시각
