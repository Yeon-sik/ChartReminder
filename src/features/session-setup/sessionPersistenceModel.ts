import type { MarketDataProvider } from "../../application/ports/marketDataProvider";
import type {
  AssetSelection,
  PrepareReplaySessionRequest,
} from "../../application/use-cases/prepareReplaySession";
import type { Instrument } from "../../domain/instrument/instrument";
import type { ReplaySpeed } from "../../domain/replay/replayEngine";
import type {
  ReplaySessionRecord,
  SavedSessionConfiguration,
} from "../../domain/session/replaySession";
import { DomainValidationError } from "../../domain/shared/errors";
import type { DisplayMode } from "../replay-workspace/viewModel";

/** 현재 진행 중인 재생 설정을 저장/내보내기용 구조로 직렬화한다. (docs/07 §4) */
export function buildSavedSessionConfiguration(
  request: PrepareReplaySessionRequest,
  displayMode: DisplayMode,
  replaySpeed: ReplaySpeed,
): SavedSessionConfiguration {
  return {
    assets: request.selections.map((selection) => ({
      instrumentId: selection.instrument.id,
      providerId: selection.instrument.providerId,
      providerSymbol: selection.instrument.providerSymbol,
      simulationConfig: selection.simulationConfig,
    })),
    interval: "1d",
    range: request.range,
    displayMode,
    replaySpeed,
  };
}

export interface RestoredSession {
  readonly request: PrepareReplaySessionRequest;
  readonly instrumentsById: Record<string, Instrument>;
  readonly displayMode: DisplayMode;
  readonly replaySpeed: ReplaySpeed;
}

/**
 * 저장된 세션이 참조하는 자산 중 기본 카탈로그(큐레이션된 소수 기본값)에 없는 항목을
 * 실제 검색으로 보충한다. (D-021 — 검색으로 고른 종목도 세션에 저장·재로드할 수 있어야 함)
 *
 * `restoreSessionFromRecord`를 호출하기 전에 사용한다. 검색으로도 못 찾으면 그대로 두고
 * `restoreSessionFromRecord`가 표준 오류로 실패하게 한다 — 여기서 오류를 삼키지 않는다.
 */
export async function buildCatalogForRecord(
  record: ReplaySessionRecord,
  baseCatalog: Readonly<Record<string, Instrument>>,
  providers: ReadonlyMap<string, MarketDataProvider>,
): Promise<Record<string, Instrument>> {
  const catalog = { ...baseCatalog };

  for (const asset of record.configuration.assets) {
    if (catalog[asset.instrumentId] !== undefined) {
      continue;
    }
    const provider = providers.get(asset.providerId);
    if (provider === undefined) {
      continue;
    }
    const matches = await provider.searchInstruments(asset.providerSymbol);
    const found = matches.find(
      (instrument) =>
        instrument.id === asset.instrumentId || instrument.providerSymbol === asset.providerSymbol,
    );
    if (found !== undefined) {
      catalog[found.id] = found;
    }
  }

  return catalog;
}

/**
 * 저장된 세션 레코드를 현재 자산 카탈로그로 재구성한다.
 *
 * 카탈로그에 없는 자산이면(예: 검색 결과였는데 그 사이 상장 폐지되는 등) 사용자 오류로
 * 알린다 — 호출 전 `buildCatalogForRecord`로 검색 가능한 자산은 미리 보충해 둔다.
 */
export function restoreSessionFromRecord(
  record: ReplaySessionRecord,
  instrumentCatalogById: Readonly<Record<string, Instrument>>,
): RestoredSession {
  const selections: AssetSelection[] = record.configuration.assets.map((asset) => {
    const instrument = instrumentCatalogById[asset.instrumentId];
    if (instrument === undefined) {
      throw new DomainValidationError(
        `세션에 저장된 자산을 현재 목록에서 찾을 수 없습니다: ${asset.instrumentId}`,
      );
    }
    return { instrument, simulationConfig: asset.simulationConfig };
  });

  const instrumentsById = Object.fromEntries(
    selections.map((selection) => [selection.instrument.id, selection.instrument]),
  );

  return {
    request: { selections, range: record.configuration.range },
    instrumentsById,
    displayMode: record.configuration.displayMode,
    replaySpeed: record.configuration.replaySpeed,
  };
}
