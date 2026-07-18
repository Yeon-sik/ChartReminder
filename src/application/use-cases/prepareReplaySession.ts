import type { Instrument } from "../../domain/instrument/instrument";
import type { UtcTimeRange } from "../../domain/market-data/timeRange";
import {
  buildReplayDataset,
  type CandleSeries,
  type ReplayDataset,
} from "../../domain/replay/replayDataset";
import { DomainValidationError } from "../../domain/shared/errors";
import type { SimulationConfig } from "../../domain/simulation/simulationConfig";
import { runSimulation, type SimulationResult } from "../../domain/simulation/simulationEngine";
import { buildSimulationDays } from "../../domain/simulation/simulationTimeline";
import type { Clock } from "../ports/clock";
import type { CandleRepository } from "../ports/candleRepository";
import type { MarketDataProvider } from "../ports/marketDataProvider";
import { ensureCandleRangeCached } from "./ensureCandleRangeCached";

const MAX_SELECTIONS = 2;

export interface AssetSelection {
  readonly instrument: Instrument;
  /** 자산마다 다른 투자 규칙을 적용할 수 있다 (GOAL.md §1). */
  readonly simulationConfig: SimulationConfig;
}

export interface PrepareReplaySessionRequest {
  readonly selections: readonly AssetSelection[];
  readonly range: UtcTimeRange;
}

/** docs/00 §"필수 화면 상태"의 데이터 경고 판정. 시뮬레이션 엔진을 다시 계산하지 않고 파생한다. */
export interface AssetDataNotice {
  /** 요청 기간 전체에 관측된 가격이 하나도 없다. */
  readonly hasNoData: boolean;
  /** 요청 기간 시작 쪽에 상장 이전(관측 이전) 구간이 있다. */
  readonly hasPreListingGap: boolean;
  /** 구간 중간에 캔들이 없어 carried-forward로 이월된 평가일이 있다. */
  readonly hasInteriorGap: boolean;
}

export interface PrepareReplaySessionResult {
  readonly dataset: ReplayDataset;
  readonly resultsByInstrumentId: Readonly<Record<string, SimulationResult>>;
  readonly dataNoticesByInstrumentId: Readonly<Record<string, AssetDataNotice>>;
}

export interface PrepareReplaySessionDeps {
  /** providerId -> Provider. 자산마다 다른 Provider(암호화폐+주식 등)를 섞을 수 있다 (M7). */
  readonly providers: ReadonlyMap<string, MarketDataProvider>;
  readonly repository: CandleRepository;
  readonly clock?: Clock;
}

function assertValidSelections(selections: readonly AssetSelection[]): void {
  if (selections.length === 0) {
    throw new DomainValidationError("최소 1개 자산을 선택해야 한다");
  }
  if (selections.length > MAX_SELECTIONS) {
    throw new DomainValidationError(`자산은 최대 ${MAX_SELECTIONS}개까지 비교할 수 있다`);
  }
  const seenIds = new Set<string>();
  for (const selection of selections) {
    if (seenIds.has(selection.instrument.id)) {
      throw new DomainValidationError(`같은 자산을 중복 선택했다: ${selection.instrument.id}`);
    }
    seenIds.add(selection.instrument.id);
  }
}

function deriveDataNotice(days: ReturnType<typeof buildSimulationDays>): AssetDataNotice {
  return {
    hasNoData: days.every((day) => day.valuationPrice === null),
    hasPreListingGap: days.some((day) => day.valuationPrice === null),
    hasInteriorGap: days.some((day) => day.valuationPrice?.status === "carried-forward"),
  };
}

/**
 * 설정 → 데이터 준비 → 리플레이/시뮬레이션 입력 오케스트레이션. (docs/01 §5)
 *
 * 캐시 우선 조회(M2 `ensureCandleRangeCached`) → 합집합 타임라인(M3 `buildReplayDataset`) →
 * 자산별 결정론적 시뮬레이션(M4 `runSimulation`) 순으로 기존 엔진을 그대로 조합한다.
 * Provider·저장소 오류는 삼키지 않고 그대로 전파한다 — 사용자 메시지 변환은 UI 책임이다.
 */
export async function prepareReplaySession(
  deps: PrepareReplaySessionDeps,
  request: PrepareReplaySessionRequest,
): Promise<PrepareReplaySessionResult> {
  assertValidSelections(request.selections);

  const series: CandleSeries[] = [];
  for (const selection of request.selections) {
    const provider = deps.providers.get(selection.instrument.providerId);
    if (provider === undefined) {
      throw new DomainValidationError(
        `등록되지 않은 Provider다: ${selection.instrument.providerId} (${selection.instrument.id})`,
      );
    }
    const cached = await ensureCandleRangeCached(
      { provider, repository: deps.repository, clock: deps.clock },
      { instrument: selection.instrument, interval: "1d", range: request.range },
    );
    series.push({ instrumentId: selection.instrument.id, candles: cached.candles });
  }

  const dataset = buildReplayDataset(series, { interval: "1d" });

  const resultsByInstrumentId: Record<string, SimulationResult> = {};
  const dataNoticesByInstrumentId: Record<string, AssetDataNotice> = {};

  for (const selection of request.selections) {
    const days = buildSimulationDays(dataset, selection.instrument.id, {
      useAdjustedClose: selection.simulationConfig.dividendPolicy === "adjusted-price",
    });
    dataNoticesByInstrumentId[selection.instrument.id] = deriveDataNotice(days);
    resultsByInstrumentId[selection.instrument.id] = runSimulation(
      days,
      selection.simulationConfig,
    );
  }

  return { dataset, resultsByInstrumentId, dataNoticesByInstrumentId };
}
