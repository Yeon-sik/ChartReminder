import { useEffect, useState } from "react";

import "./App.css";
import { getAppComposition, type AppComposition } from "./app/composition";
import type { PrepareReplaySessionRequest } from "./application/use-cases/prepareReplaySession";
import type { Instrument } from "./domain/instrument/instrument";
import { ReplayWorkspace } from "./features/replay-workspace/ReplayWorkspace";
import type { DisplayMode } from "./features/replay-workspace/viewModel";
import { SessionSetupForm } from "./features/session-setup/SessionSetupForm";
import { BINANCE_INSTRUMENTS } from "./infrastructure/providers/binance/binanceCatalog";

interface Session {
  readonly id: number;
  readonly request: PrepareReplaySessionRequest;
  readonly instrumentsById: Record<string, Instrument>;
  readonly displayMode: DisplayMode;
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

  function handleSessionSubmit(
    request: PrepareReplaySessionRequest,
    instrumentsById: Record<string, Instrument>,
    displayMode: DisplayMode,
  ): void {
    setSession({ id: nextSessionId, request, instrumentsById, displayMode });
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
      <SessionSetupForm
        availableInstruments={BINANCE_INSTRUMENTS}
        defaultInstrument={BINANCE_INSTRUMENTS[0]}
        onSubmit={handleSessionSubmit}
      />
    );
  }

  return (
    <ReplayWorkspace
      key={session.id}
      composition={composition}
      request={session.request}
      instrumentsById={session.instrumentsById}
      displayMode={session.displayMode}
      onBackToSetup={() => setSession(null)}
    />
  );
}

export default App;
