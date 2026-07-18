import { useState } from "react";

import type { AppComposition } from "../../app/composition";
import type { PrepareReplaySessionRequest } from "../../application/use-cases/prepareReplaySession";
import { saveReplaySession } from "../../application/use-cases/saveReplaySession";
import type { Instrument } from "../../domain/instrument/instrument";
import type { ReplayDataset } from "../../domain/replay/replayDataset";
import type { ReplaySpeed } from "../../domain/replay/replayEngine";
import {
  buildPortfolioCsv,
  buildSessionExportPayload,
  serializeSessionExportPayload,
  type PortfolioCsvAssetInput,
} from "../../domain/session/exportFormat";
import {
  REPLAY_SESSION_SCHEMA_VERSION,
  extractDataVersions,
} from "../../domain/session/replaySession";
import { DomainValidationError } from "../../domain/shared/errors";
import type { SimulationResult } from "../../domain/simulation/simulationEngine";
import { buildSavedSessionConfiguration } from "../session-setup/sessionPersistenceModel";
import { formatProviderError } from "./format";
import type { DisplayMode } from "./viewModel";
import "./SessionActions.css";

export interface SessionActionsProps {
  readonly composition: AppComposition;
  readonly request: PrepareReplaySessionRequest;
  readonly instrumentsById: Readonly<Record<string, Instrument>>;
  readonly displayMode: DisplayMode;
  readonly speed: ReplaySpeed;
  readonly dataset: ReplayDataset;
  readonly resultsByInstrumentId: Readonly<Record<string, SimulationResult>>;
  readonly cursor: number;
}

type ActionStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "success"; readonly message: string }
  | { readonly kind: "error"; readonly message: string };

/**
 * 세션 저장(SQLite)과 JSON/CSV 내보내기. (docs/07 §4·§5)
 *
 * 재생 커서까지만 잘라 전달된 스냅샷만 내보낸다 — 아직 재생하지 않은 미래 구간은
 * 저장·내보내기에도 노출하지 않는다(R6과 동일한 경계).
 */
export function SessionActions({
  composition,
  request,
  instrumentsById,
  displayMode,
  speed,
  dataset,
  resultsByInstrumentId,
  cursor,
}: SessionActionsProps) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<ActionStatus>({ kind: "idle" });
  const [busy, setBusy] = useState(false);

  function reportError(error: unknown): void {
    setStatus({
      kind: "error",
      message: error instanceof DomainValidationError ? error.message : formatProviderError(error),
    });
  }

  async function handleSave(): Promise<void> {
    setBusy(true);
    try {
      const configuration = buildSavedSessionConfiguration(request, displayMode, speed);
      const dataVersions = extractDataVersions(dataset);
      await saveReplaySession(
        { sessionRepository: composition.sessionRepository },
        { name, configuration, dataVersions },
      );
      setStatus({ kind: "success", message: `"${name.trim()}" 이름으로 세션을 저장했습니다.` });
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }

  async function handleExportJson(): Promise<void> {
    setBusy(true);
    try {
      const configuration = buildSavedSessionConfiguration(request, displayMode, speed);
      const dataVersions = extractDataVersions(dataset);
      const payload = buildSessionExportPayload(Date.now(), {
        schemaVersion: REPLAY_SESSION_SCHEMA_VERSION,
        name: name.trim().length > 0 ? name.trim() : "investment-replay-session",
        configuration,
        dataVersions,
      });
      const result = await composition.fileExporter.exportTextFile({
        suggestedFileName: `investment-replay-session-${dataset.timeline[cursor]}.json`,
        content: serializeSessionExportPayload(payload),
        mimeType: "application/json",
        filterName: "JSON",
        extension: "json",
      });
      setStatus(
        result.status === "saved"
          ? { kind: "success", message: "세션 JSON을 내보냈습니다." }
          : { kind: "idle" },
      );
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }

  async function handleExportCsv(): Promise<void> {
    setBusy(true);
    try {
      const assets: PortfolioCsvAssetInput[] = Object.entries(resultsByInstrumentId).map(
        ([instrumentId, result]) => {
          const instrument = instrumentsById[instrumentId];
          return {
            header: {
              instrumentId,
              label: `${instrument.displayName} (${instrument.symbol})`,
              providerId: instrument.providerId,
              providerSymbol: instrument.providerSymbol,
              quoteCurrency: instrument.quoteCurrency,
              assumptions: result.assumptions,
            },
            snapshots: result.snapshots.slice(0, cursor + 1),
          };
        },
      );
      const result = await composition.fileExporter.exportTextFile({
        suggestedFileName: `investment-replay-portfolio-${dataset.timeline[cursor]}.csv`,
        content: buildPortfolioCsv(Date.now(), assets),
        mimeType: "text/csv",
        filterName: "CSV",
        extension: "csv",
      });
      setStatus(
        result.status === "saved"
          ? { kind: "success", message: "포트폴리오 CSV를 내보냈습니다." }
          : { kind: "idle" },
      );
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="session-actions" aria-label="세션 저장과 내보내기">
      <div className="session-actions__save">
        <label>
          세션 이름
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="예: BTC 2024 상반기 DCA"
          />
        </label>
        <button type="button" onClick={handleSave} disabled={busy || name.trim().length === 0}>
          세션 저장
        </button>
      </div>
      <div className="session-actions__export">
        <button type="button" onClick={handleExportJson} disabled={busy}>
          세션 JSON 내보내기
        </button>
        <button type="button" onClick={handleExportCsv} disabled={busy}>
          포트폴리오 CSV 내보내기
        </button>
      </div>
      {status.kind !== "idle" && (
        <p
          role={status.kind === "error" ? "alert" : "status"}
          className={`session-actions__status is-${status.kind}`}
        >
          {status.message}
        </p>
      )}
    </section>
  );
}
