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
 * 저장된 세션 레코드를 현재 자산 카탈로그로 재구성한다.
 *
 * MVP(M6, 암호화폐 알파)는 Binance 카탈로그만 대상이다 — 카탈로그에 없는 자산이면
 * (예: 이후 종목이 상장 폐지되거나 카탈로그가 바뀐 경우) 사용자 오류로 알린다.
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
