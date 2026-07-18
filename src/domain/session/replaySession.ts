import type { DisplayMode } from "../market-data/priceNormalization";
import type { CandleInterval } from "../market-data/candle";
import type { UtcTimeRange } from "../market-data/timeRange";
import type { ReplayDataset } from "../replay/replayDataset";
import type { ReplaySpeed } from "../replay/replayEngine";
import { DomainValidationError } from "../shared/errors";
import type { SimulationConfig } from "../simulation/simulationConfig";

/** 세션 저장 스키마 버전. 호환되지 않는 변경 시 올린다. (docs/07 §3) */
export const REPLAY_SESSION_SCHEMA_VERSION = 1;

const MAX_SESSION_NAME_LENGTH = 100;

/** 세션에 포함된 자산 1개 선택. Instrument 전체가 아니라 참조만 저장한다 (docs/07 §4). */
export interface SavedAssetSelection {
  readonly instrumentId: string;
  readonly providerId: string;
  readonly providerSymbol: string;
  readonly simulationConfig: SimulationConfig;
}

/** 재현에 필요한 세션 설정 전체. (docs/07 §4 필수 항목) */
export interface SavedSessionConfiguration {
  readonly assets: readonly SavedAssetSelection[];
  readonly interval: CandleInterval;
  readonly range: UtcTimeRange;
  readonly displayMode: DisplayMode;
  readonly replaySpeed: ReplaySpeed;
}

/** instrumentId별 저장 당시 데이터 버전. 공급자가 버전을 제공하지 않으면 null. */
export type SavedSessionDataVersions = Readonly<Record<string, string | null>>;

export interface ReplaySessionRecord {
  readonly id: string;
  readonly name: string;
  readonly schemaVersion: number;
  readonly configuration: SavedSessionConfiguration;
  readonly dataVersions: SavedSessionDataVersions;
  readonly createdAtUtcMs: number;
  readonly updatedAtUtcMs: number;
}

/**
 * 자산별 저장 당시 데이터 버전을 데이터셋에서 뽑아낸다 (docs/07 §4).
 * 각 자산의 가장 최근(마지막) 캔들 출처를 대표값으로 쓴다 — 공급자가 버전을
 * 제공하지 않으면 null이며, 이는 오류가 아니라 "버전 정보 없음"으로 취급한다.
 */
export function extractDataVersions(dataset: ReplayDataset): SavedSessionDataVersions {
  const result: Record<string, string | null> = {};
  for (const series of Object.values(dataset.seriesByInstrument)) {
    const lastCandle = series.candles[series.candles.length - 1];
    result[series.instrumentId] = lastCandle?.source.dataVersion ?? null;
  }
  return result;
}

export function assertValidSessionName(name: string): void {
  if (name.trim().length === 0) {
    throw new DomainValidationError("세션 이름을 입력해야 한다");
  }
  if (name.length > MAX_SESSION_NAME_LENGTH) {
    throw new DomainValidationError(`세션 이름은 ${MAX_SESSION_NAME_LENGTH}자를 넘을 수 없다`);
  }
}
