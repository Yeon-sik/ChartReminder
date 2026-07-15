import {
  parseDecimal,
  roundHalfUp,
  toDecimalString,
  DomainDecimal,
  type Decimal,
  type DecimalString,
} from "../shared/decimal";
import { DomainValidationError } from "../shared/errors";
import type { Money } from "../shared/money";
import type { TradingDate } from "../shared/time";
import { generateContributionDates } from "./contributionSchedule";
import { validateSimulationConfig, type SimulationConfig } from "./simulationConfig";
import type { SimulationDay } from "./simulationTimeline";

/** 비율(수익률·낙폭) 표기 자릿수. ROUND_HALF_UP. (D-012, docs/16 §4) */
export const RATE_DECIMAL_PLACES = 10;

/** UI에 표시할 지표 명칭. (D-012) 결과와 함께 가정을 표시해야 한다 (docs/05 §2). */
export const METRIC_LABELS = {
  returnRate: "단순 수익률 (누적 기여 원금 대비)",
  maxDrawdownPrice: "가격 최대 낙폭(MDD)",
  maxDrawdownTotalValue: "총자산 최대 낙폭(MDD) · 기여금 유입 미조정",
} as const;

/** 날짜별 포트폴리오 스냅샷. (docs/02 §6) drawdownRate는 총자산 기준이다 (D-012). */
export interface PortfolioSnapshot {
  readonly date: TradingDate;
  readonly contributedCapital: Money;
  readonly cash: Money;
  readonly positionQuantity: DecimalString;
  readonly marketValue: Money;
  readonly totalValue: Money;
  readonly profitLoss: Money;
  readonly returnRate: DecimalString;
  readonly drawdownRate: DecimalString;
  readonly priceStatus: "fresh" | "carried-forward";
}

/** 체결 기록. (docs/05 §8) 같은 날 여러 예정 납입이 실행되면 기록을 분리한다. */
export interface SimulatedTrade {
  readonly id: string;
  readonly date: TradingDate;
  readonly type: "buy";
  readonly executionPrice: DecimalString;
  readonly grossAmount: Money;
  readonly fee: Money;
  readonly quantity: DecimalString;
  readonly reason: "initial" | "scheduled";
}

export interface SimulationMetrics {
  readonly finalReturnRate: DecimalString;
  /** 가격 기준 MDD (D-012 기본 지표) */
  readonly maxDrawdownPrice: DecimalString;
  /** 총자산 기준 MDD (기여금 유입 미조정, 별도 표기) */
  readonly maxDrawdownTotalValue: DecimalString;
}

/** 결과 화면에 함께 표시할 계산 가정. (docs/05 §2) */
export interface SimulationAssumptions {
  readonly executionPrice: "close";
  readonly feeRate: DecimalString;
  readonly allowFractionalQuantity: boolean;
  readonly dividendPolicy: "adjusted-price" | "ignore";
  readonly taxIncluded: false;
  readonly slippageIncluded: false;
  readonly returnRateLabel: string;
  readonly maxDrawdownPriceLabel: string;
  readonly maxDrawdownTotalValueLabel: string;
}

export interface SimulationResult {
  readonly snapshots: readonly PortfolioSnapshot[];
  readonly trades: readonly SimulatedTrade[];
  readonly metrics: SimulationMetrics;
  readonly assumptions: SimulationAssumptions;
}

/** 실행 대기 중인 납입. 예정일에 유입되고 이후 첫 유효 거래일에 개별 체결된다. */
interface PendingContribution {
  readonly amount: Decimal;
  readonly reason: "initial" | "scheduled";
}

interface BuyOutcome {
  readonly gross: Decimal;
  readonly fee: Decimal;
  readonly quantity: Decimal;
}

const ZERO = new DomainDecimal(0);
const ONE = new DomainDecimal(1);

/**
 * 납입액으로 매수를 계산한다. 총지출(gross + fee)이 납입액을 넘지 않는다.
 *
 * - 소수점 허용: gross = amount ÷ (1 + feeRate), fee = amount − gross (현금 전액 소진)
 * - 소수점 비허용: quantity = floor(amount ÷ (price × (1 + feeRate))),
 *   gross = quantity × price, fee = gross × feeRate. 잔액은 현금으로 남고
 *   이후 납입과 합쳐 재투자하지 않는다 (문서화된 정책).
 */
function computeBuy(
  amount: Decimal,
  price: Decimal,
  feeRate: Decimal,
  allowFractional: boolean,
): BuyOutcome | null {
  if (price.lessThanOrEqualTo(ZERO)) {
    throw new DomainValidationError(`0 이하의 체결 가격으로는 매수할 수 없다: ${price.toFixed()}`);
  }
  if (amount.lessThanOrEqualTo(ZERO)) {
    return null;
  }
  const feeMultiplier = ONE.plus(feeRate);
  if (allowFractional) {
    const gross = amount.dividedBy(feeMultiplier);
    return { gross, fee: amount.minus(gross), quantity: gross.dividedBy(price) };
  }
  const quantity = amount.dividedBy(price.times(feeMultiplier)).floor();
  if (quantity.isZero()) {
    return null;
  }
  const gross = quantity.times(price);
  return { gross, fee: gross.times(feeRate), quantity };
}

function toRate(numerator: Decimal, denominator: Decimal): DecimalString {
  if (denominator.lessThanOrEqualTo(ZERO)) {
    return "0";
  }
  return toDecimalString(roundHalfUp(numerator.dividedBy(denominator), RATE_DECIMAL_PLACES));
}

/**
 * 결정론적 투자 시뮬레이션. (docs/05)
 *
 * 같은 days·config 입력은 항상 같은 결과를 만든다. AI·주문·세금·슬리피지 없음.
 * 납입은 예정일에 기여 원금·현금으로 유입되고, 예정일 이후 첫 유효 거래일에
 * 종가로 체결된다. 여러 예정 납입이 한 거래일에 몰리면 거래 기록을 분리한다.
 */
export function runSimulation(
  days: readonly SimulationDay[],
  config: SimulationConfig,
): SimulationResult {
  validateSimulationConfig(config);
  if (days.length === 0) {
    throw new DomainValidationError("시뮬레이션 기간이 비어 있다");
  }

  const currency = config.initialCash.currency;
  const feeRate = parseDecimal(config.feeRate);
  const initialCash = parseDecimal(config.initialCash.amount);

  // 예정일은 달력일이라 타임라인에 없을 수 있다(주말·휴장).
  // 예정일 이후 첫 타임라인 날짜에 유입된 것으로 관측한다 — 납입은 유실되지 않는다.
  const scheduledDates: readonly TradingDate[] =
    config.mode === "dca" && config.recurring !== undefined
      ? generateContributionDates(config.recurring, days[0].date, days[days.length - 1].date)
      : [];
  const recurringAmount =
    config.recurring !== undefined ? parseDecimal(config.recurring.amount.amount) : ZERO;
  let nextScheduledIndex = 0;

  let cash = ZERO;
  let contributed = ZERO;
  let quantity = ZERO;
  let totalPeak: Decimal | null = null;
  let pricePeak: Decimal | null = null;
  let maxDrawdownTotal = ZERO;
  let maxDrawdownPrice = ZERO;
  const pending: PendingContribution[] = [];
  const trades: SimulatedTrade[] = [];
  const snapshots: PortfolioSnapshot[] = [];

  for (const [index, day] of days.entries()) {
    // 1) 납입 유입 (기여 원금과 현금을 구분해 함께 증가시킨다, docs/05 §5)
    if (index === 0 && initialCash.greaterThan(ZERO)) {
      cash = cash.plus(initialCash);
      contributed = contributed.plus(initialCash);
      pending.push({ amount: initialCash, reason: "initial" });
    }
    while (
      nextScheduledIndex < scheduledDates.length &&
      scheduledDates[nextScheduledIndex] <= day.date
    ) {
      cash = cash.plus(recurringAmount);
      contributed = contributed.plus(recurringAmount);
      pending.push({ amount: recurringAmount, reason: "scheduled" });
      nextScheduledIndex += 1;
    }

    // 2) 체결: 유효 거래일이면 대기 납입을 개별 실행한다 (휴장일 이월)
    if (day.executionPrice !== null && pending.length > 0) {
      const price = parseDecimal(day.executionPrice);
      for (const contribution of pending) {
        const buy = computeBuy(contribution.amount, price, feeRate, config.allowFractionalQuantity);
        if (buy === null) {
          continue; // 정수 수량 1개도 못 사는 납입은 현금으로 남긴다
        }
        cash = cash.minus(buy.gross).minus(buy.fee);
        quantity = quantity.plus(buy.quantity);
        trades.push({
          id: `trade-${trades.length + 1}`,
          date: day.date,
          type: "buy",
          executionPrice: day.executionPrice,
          grossAmount: { amount: toDecimalString(buy.gross), currency },
          fee: { amount: toDecimalString(buy.fee), currency },
          quantity: toDecimalString(buy.quantity),
          reason: contribution.reason,
        });
      }
      pending.length = 0;
    }

    // 3) 평가
    const valuation = day.valuationPrice;
    if (valuation === null && quantity.greaterThan(ZERO)) {
      throw new DomainValidationError(
        `보유 수량이 있는데 평가 가격이 없다: ${day.date} (어댑터 입력 오류)`,
      );
    }
    const marketValue =
      valuation === null || quantity.isZero()
        ? ZERO
        : quantity.times(parseDecimal(valuation.value));
    const totalValue = cash.plus(marketValue);
    const profitLoss = totalValue.minus(contributed);

    // 4) 낙폭 — 총자산 기준 (최고점은 첫 스냅샷 총자산으로 초기화, D-012)
    totalPeak = totalPeak === null || totalValue.greaterThan(totalPeak) ? totalValue : totalPeak;
    const drawdownRate = toRate(totalPeak.minus(totalValue), totalPeak);
    if (parseDecimal(drawdownRate).greaterThan(maxDrawdownTotal)) {
      maxDrawdownTotal = parseDecimal(drawdownRate);
    }

    // 5) 가격 기준 낙폭 (관측·이월 평가 가격 경로, D-012 기본 지표)
    if (valuation !== null) {
      const price = parseDecimal(valuation.value);
      pricePeak = pricePeak === null || price.greaterThan(pricePeak) ? price : pricePeak;
      const priceDrawdown = parseDecimal(toRate(pricePeak.minus(price), pricePeak));
      if (priceDrawdown.greaterThan(maxDrawdownPrice)) {
        maxDrawdownPrice = priceDrawdown;
      }
    }

    snapshots.push({
      date: day.date,
      contributedCapital: { amount: toDecimalString(contributed), currency },
      cash: { amount: toDecimalString(cash), currency },
      positionQuantity: toDecimalString(quantity),
      marketValue: { amount: toDecimalString(marketValue), currency },
      totalValue: { amount: toDecimalString(totalValue), currency },
      profitLoss: { amount: toDecimalString(profitLoss), currency },
      returnRate: toRate(profitLoss, contributed),
      drawdownRate,
      priceStatus: valuation?.status ?? "fresh",
    });
  }

  return {
    snapshots,
    trades,
    metrics: {
      finalReturnRate: snapshots[snapshots.length - 1].returnRate,
      maxDrawdownPrice: toDecimalString(maxDrawdownPrice),
      maxDrawdownTotalValue: toDecimalString(maxDrawdownTotal),
    },
    assumptions: {
      executionPrice: config.executionPrice,
      feeRate: config.feeRate,
      allowFractionalQuantity: config.allowFractionalQuantity,
      dividendPolicy: config.dividendPolicy,
      taxIncluded: false,
      slippageIncluded: false,
      returnRateLabel: METRIC_LABELS.returnRate,
      maxDrawdownPriceLabel: METRIC_LABELS.maxDrawdownPrice,
      maxDrawdownTotalValueLabel: METRIC_LABELS.maxDrawdownTotalValue,
    },
  };
}
