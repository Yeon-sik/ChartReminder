import { useEffect, useMemo, useState } from "react";

import "./App.css";
import { getAppComposition, type AppComposition } from "./app/composition";
import type { PrepareReplaySessionRequest } from "./application/use-cases/prepareReplaySession";
import type { Instrument } from "./domain/instrument/instrument";
import type { ReplaySpeed } from "./domain/replay/replayEngine";
import { ReplayWorkspace } from "./features/replay-workspace/ReplayWorkspace";
import type { DisplayMode } from "./features/replay-workspace/viewModel";
import { ProviderApiKeyField } from "./features/session-setup/ProviderApiKeyField";
import { SavedSessionsPanel } from "./features/session-setup/SavedSessionsPanel";
import { SessionSetupForm } from "./features/session-setup/SessionSetupForm";
import type { RestoredSession } from "./features/session-setup/sessionPersistenceModel";
import { BINANCE_INSTRUMENTS } from "./infrastructure/providers/binance/binanceCatalog";
import {
  TIINGO_INSTRUMENTS,
  TIINGO_PROVIDER_ID,
} from "./infrastructure/providers/tiingo/tiingoCatalog";

interface Session {
  readonly id: number;
  readonly request: PrepareReplaySessionRequest;
  readonly instrumentsById: Record<string, Instrument>;
  readonly displayMode: DisplayMode;
  readonly replaySpeed?: ReplaySpeed;
}

function useAppComposition(): { composition: AppComposition | null; error: string | null } {
  const [composition, setComposition] = useState<AppComposition | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAppComposition()
      .then((result) => {
        if (!cancelled) {
          setComposition(result);
        }
      })
      .catch((initError: unknown) => {
        if (!cancelled) {
          setError(initError instanceof Error ? initError.message : "앱을 초기화하지 못했습니다.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { composition, error };
}

function App() {
  const { composition, error } = useAppComposition();
  const [session, setSession] = useState<Session | null>(null);
  const [nextSessionId, setNextSessionId] = useState(1);
  const hasTiingo = composition?.providers.has(TIINGO_PROVIDER_ID) ?? false;
  const availableInstruments = useMemo(
    () => (hasTiingo ? [...BINANCE_INSTRUMENTS, ...TIINGO_INSTRUMENTS] : BINANCE_INSTRUMENTS),
    [hasTiingo],
  );
  const instrumentCatalogById = useMemo(
    () => Object.fromEntries(availableInstruments.map((instrument) => [instrument.id, instrument])),
    [availableInstruments],
  );

  function handleSessionSubmit(
    request: PrepareReplaySessionRequest,
    instrumentsById: Record<string, Instrument>,
    displayMode: DisplayMode,
  ): void {
    setSession({ id: nextSessionId, request, instrumentsById, displayMode });
    setNextSessionId((id) => id + 1);
  }

  function handleLoadSession(restored: RestoredSession): void {
    setSession({
      id: nextSessionId,
      request: restored.request,
      instrumentsById: restored.instrumentsById,
      displayMode: restored.displayMode,
      replaySpeed: restored.replaySpeed,
    });
    setNextSessionId((id) => id + 1);
  }

  if (error !== null) {
    return (
      <main className="container">
        <p role="alert">{error}</p>
      </main>
    );
  }

  if (composition === null) {
    return (
      <main className="container">
        <p role="status">앱을 초기화하는 중입니다…</p>
      </main>
    );
  }

  if (session === null) {
    return (
      <>
        <SavedSessionsPanel
          composition={composition}
          instrumentCatalogById={instrumentCatalogById}
          onLoad={handleLoadSession}
        />
        {hasTiingo && (
          <ProviderApiKeyField
            composition={composition}
            providerId={TIINGO_PROVIDER_ID}
            label="Tiingo(미국 주식) API 키"
            signupUrl="tiingo.com"
          />
        )}
        <SessionSetupForm
          availableInstruments={availableInstruments}
          defaultInstrument={availableInstruments[0]}
          onSubmit={handleSessionSubmit}
        />
      </>
    );
  }

  return (
    <ReplayWorkspace
      key={session.id}
      initialSpeed={session.replaySpeed}
      composition={composition}
      request={session.request}
      instrumentsById={session.instrumentsById}
      displayMode={session.displayMode}
      onBackToSetup={() => setSession(null)}
    />
  );
}

export default App;
