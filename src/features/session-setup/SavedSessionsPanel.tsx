import { useEffect, useState } from "react";

import type { AppComposition } from "../../app/composition";
import type { SessionSummary } from "../../application/ports/sessionRepository";
import { loadReplaySession } from "../../application/use-cases/loadReplaySession";
import type { Instrument } from "../../domain/instrument/instrument";
import { formatProviderError } from "../replay-workspace/format";
import "./SavedSessionsPanel.css";
import {
  buildCatalogForRecord,
  restoreSessionFromRecord,
  type RestoredSession,
} from "./sessionPersistenceModel";

export interface SavedSessionsPanelProps {
  readonly composition: AppComposition;
  readonly instrumentCatalogById: Readonly<Record<string, Instrument>>;
  readonly onLoad: (restored: RestoredSession) => void;
}

type ListState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly summaries: readonly SessionSummary[] }
  | { readonly status: "error"; readonly message: string };

/** 저장된 세션 목록과 불러오기. (docs/07 §4) 저장된 세션이 없으면 아무것도 렌더링하지 않는다. */
export function SavedSessionsPanel({
  composition,
  instrumentCatalogById,
  onLoad,
}: SavedSessionsPanelProps) {
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    composition.sessionRepository
      .listSummaries()
      .then((summaries) => {
        if (!cancelled) {
          setState({ status: "ready", summaries });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ status: "error", message: formatProviderError(error) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [composition]);

  async function handleLoad(id: string): Promise<void> {
    setLoadingId(id);
    setLoadError(null);
    try {
      const record = await loadReplaySession(composition.sessionRepository, id);
      // 검색으로 골랐던(큐레이션 기본값 밖) 자산도 재로드할 수 있게 보충한다 (D-021).
      const catalog = await buildCatalogForRecord(
        record,
        instrumentCatalogById,
        composition.providers,
      );
      const restored = restoreSessionFromRecord(record, catalog);
      onLoad(restored);
    } catch (error) {
      setLoadError(formatProviderError(error));
    } finally {
      setLoadingId(null);
    }
  }

  if (state.status === "loading") {
    return (
      <p role="status" className="saved-sessions__loading">
        저장된 세션을 확인하는 중입니다…
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <p role="alert" className="saved-sessions__error">
        {state.message}
      </p>
    );
  }

  if (state.summaries.length === 0) {
    return null;
  }

  return (
    <section className="saved-sessions" aria-label="저장된 세션">
      <h2>저장된 세션</h2>
      <ul>
        {state.summaries.map((summary) => (
          <li key={summary.id}>
            <span className="saved-sessions__name">{summary.name}</span>
            <span className="saved-sessions__date">
              {new Date(summary.updatedAtUtcMs).toLocaleString()}
            </span>
            <button
              type="button"
              onClick={() => handleLoad(summary.id)}
              disabled={loadingId === summary.id}
            >
              불러오기
            </button>
          </li>
        ))}
      </ul>
      {loadError !== null && (
        <p role="alert" className="saved-sessions__error">
          {loadError}
        </p>
      )}
    </section>
  );
}
