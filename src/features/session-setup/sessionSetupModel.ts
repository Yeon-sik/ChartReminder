import type {
  AssetSelection,
  PrepareReplaySessionRequest,
} from "../../application/use-cases/prepareReplaySession";
import type { Instrument } from "../../domain/instrument/instrument";
import { isDecimalString, parseDecimal, toDecimalString } from "../../domain/shared/decimal";
import { DomainValidationError } from "../../domain/shared/errors";
import {
  convertAmount,
  type DisplayCurrency,
  type UsdKrwRate,
} from "../../domain/shared/fxConversion";
import {
  addDaysToTradingDate,
  assertTradingDate,
  tradingDateParts,
  utcTradingDateFromUtcMs,
  type TradingDate,
} from "../../domain/shared/time";
import {
  validateSimulationConfig,
  type RecurringAnchor,
  type SimulationConfig,
} from "../../domain/simulation/simulationConfig";
import type { DisplayMode } from "../replay-workspace/viewModel";

const DAY_MS = 86_400_000;
const MAX_ASSETS = 2;
const DEFAULT_LOOKBACK_DAYS = 180;

export type InvestmentMode = "lump-sum" | "dca";
export type RecurringFrequency = "weekly" | "monthly";

/**
 * 통합 투자 설정. (D-020 — 자산별로 따로 설정하지 않고 비교 대상 전체에 동일하게 적용한다)
 *
 * 금액(`initialCash`, `recurringAmount`)은 사용자가 고른 표시 통화(`DisplayCurrency`)
 * 기준으로 입력받는다 — `buildPrepareReplaySessionRequest`가 자산마다 고유 통화로 환산한다.
 */
export interface InvestmentSettingsFormState {
  readonly mode: InvestmentMode;
  readonly initialCash: string;
  /** 퍼센트 표기 텍스트 (예: "0.1" = 0.1%). SimulationConfig.feeRate(비율)로 변환한다. */
  readonly feePercent: string;
  readonly allowFractionalQuantity: boolean;
  readonly recurringAmount: string;
  readonly recurringFrequency: RecurringFrequency;
  readonly recurringIsoDayOfWeek: number;
  readonly recurringDayOfMonth: number;
}

export interface SessionSetupFormState {
  readonly assets: readonly Instrument[];
  readonly startDate: TradingDate;
  readonly endDate: TradingDate;
  readonly displayMode: DisplayMode;
  readonly investment: InvestmentSettingsFormState;
}

export function defaultInvestmentSettings(): InvestmentSettingsFormState {
  return {
    mode: "lump-sum",
    initialCash: "1000",
    feePercent: "0",
    allowFractionalQuantity: true,
    recurringAmount: "100",
    recurringFrequency: "weekly",
    recurringIsoDayOfWeek: 1,
    recurringDayOfMonth: 1,
  };
}

/** 최초 진입 화면 기본값. (docs/06 §3: 자산 1개, 합리적 샘플 기간, 일시투자 기본) */
export function createDefaultFormState(
  nowUtcMs: number,
  defaultInstrument: Instrument,
): SessionSetupFormState {
  const endDate = utcTradingDateFromUtcMs(nowUtcMs);
  return {
    assets: [defaultInstrument],
    startDate: addDaysToTradingDate(endDate, -DEFAULT_LOOKBACK_DAYS),
    endDate,
    displayMode: "normalized-100",
    investment: defaultInvestmentSettings(),
  };
}

function tradingDateToUtcMs(date: TradingDate): number {
  const { year, month, day } = tradingDateParts(date);
  return Date.UTC(year, month - 1, day);
}

function toFeeRate(feePercent: string): string {
  if (!isDecimalString(feePercent)) {
    throw new DomainValidationError(`수수료율 입력이 올바른 숫자가 아니다: "${feePercent}"`);
  }
  return toDecimalString(parseDecimal(feePercent).dividedBy(100));
}

function buildAnchor(investment: InvestmentSettingsFormState): RecurringAnchor {
  return investment.recurringFrequency === "weekly"
    ? { kind: "day-of-week", isoDayOfWeek: investment.recurringIsoDayOfWeek }
    : { kind: "day-of-month", dayOfMonth: investment.recurringDayOfMonth };
}

/** 통합 투자 설정을 자산 하나의 `SimulationConfig`로 변환한다 — 금액만 그 자산 고유 통화로 환산한다. */
function buildSimulationConfig(
  investment: InvestmentSettingsFormState,
  instrument: Instrument,
  displayCurrency: DisplayCurrency,
  usdKrwRate: UsdKrwRate | null,
): SimulationConfig {
  const currency = instrument.quoteCurrency;
  const feeRate = toFeeRate(investment.feePercent);
  const toAssetCurrency = (amount: string): string =>
    convertAmount(amount, displayCurrency, currency, usdKrwRate);

  const config: SimulationConfig =
    investment.mode === "lump-sum"
      ? {
          mode: "lump-sum",
          initialCash: { amount: toAssetCurrency(investment.initialCash), currency },
          executionPrice: "close",
          feeRate,
          allowFractionalQuantity: investment.allowFractionalQuantity,
          dividendPolicy: "ignore",
        }
      : {
          mode: "dca",
          initialCash: { amount: "0", currency },
          recurring: {
            amount: { amount: toAssetCurrency(investment.recurringAmount), currency },
            frequency: investment.recurringFrequency,
            anchor: buildAnchor(investment),
          },
          executionPrice: "close",
          feeRate,
          allowFractionalQuantity: investment.allowFractionalQuantity,
          dividendPolicy: "ignore",
        };

  // 네트워크 조회 전에 즉시 실패시킨다 — validateSimulationConfig는 runSimulation
  // 내부에서도 호출되지만, 폼 제출 시점에 미리 걸러야 사용자가 빨리 피드백을 받는다.
  validateSimulationConfig(config);
  return config;
}

/**
 * 폼 상태를 유스케이스 요청으로 변환한다. (M5 view model 경계 1-2, D-020 통합 투자 설정)
 *
 * 자산 개수·기간 순서 등 폼 수준 검증만 여기서 하고, 금액·수수료 등 도메인 값
 * 검증은 `validateSimulationConfig`(prepareReplaySession 내부)에 위임한다.
 */
export function buildPrepareReplaySessionRequest(
  state: SessionSetupFormState,
  displayCurrency: DisplayCurrency,
  usdKrwRate: UsdKrwRate | null,
): PrepareReplaySessionRequest {
  if (state.assets.length === 0) {
    throw new DomainValidationError("최소 1개 자산을 선택해야 한다");
  }
  if (state.assets.length > MAX_ASSETS) {
    throw new DomainValidationError(`자산은 최대 ${MAX_ASSETS}개까지 비교할 수 있다`);
  }
  assertTradingDate(state.startDate, "startDate");
  assertTradingDate(state.endDate, "endDate");
  if (state.startDate >= state.endDate) {
    throw new DomainValidationError(
      `시작일은 종료일보다 앞서야 한다: ${state.startDate} >= ${state.endDate}`,
    );
  }

  const selections: AssetSelection[] = state.assets.map((instrument) => ({
    instrument,
    simulationConfig: buildSimulationConfig(
      state.investment,
      instrument,
      displayCurrency,
      usdKrwRate,
    ),
  }));

  return {
    selections,
    range: {
      startMs: tradingDateToUtcMs(state.startDate),
      endMs: tradingDateToUtcMs(state.endDate) + DAY_MS,
    },
  };
}
