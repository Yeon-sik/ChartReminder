import { useCallback, useEffect, useMemo, useState } from "react";

import "./App.css";
import { getAppComposition, type AppComposition } from "./app/composition";
import type { PrepareReplaySessionRequest } from "./application/use-cases/prepareReplaySession";
import type { Instrument } from "./domain/instrument/instrument";
import type { DisplayCurrency, UsdKrwRate } from "./domain/shared/fxConversion";
import type { ReplaySpeed } from "./domain/replay/replayEngine";
import { SettingsScreen } from "./features/app-settings/SettingsScreen";
import { formatProviderError } from "./features/replay-workspace/format";
import { ReplayWorkspace } from "./features/replay-workspace/ReplayWorkspace";
import type { DisplayMode } from "./features/replay-workspace/viewModel";
import { SavedSessionsPanel } from "./features/session-setup/SavedSessionsPanel";
import { SessionSetupForm } from "./features/session-setup/SessionSetupForm";
import type { RestoredSession } from "./features/session-setup/sessionPersistenceModel";
import { BINANCE_INSTRUMENTS } from "./infrastructure/providers/binance/binanceCatalog";
import {
  KRX_PUBLIC_DATA_INSTRUMENTS,
  KRX_PUBLIC_DATA_PROVIDER_ID,
} from "./infrastructure/providers/krxPublicData/krxPublicDataCatalog";
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

type AppView = "setup" | "settings";

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

/** 표시 통화(D-020) — appSettingsStore에서 1회 불러온다. */
function useDisplayCurrency(composition: AppComposition | null): {
  displayCurrency: DisplayCurrency;
  setDisplayCurrency: (value: DisplayCurrency) => void;
} {
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>("KRW");

  useEffect(() => {
    if (composition === null) {
      return;
    }
    let cancelled = false;
    composition.appSettingsStore.getDisplayCurrency().then((value) => {
      if (!cancelled) {
        setDisplayCurrency(value);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [composition]);

  return { displayCurrency, setDisplayCurrency };
}

/** 현재 USD/KRW 환율(D-020) — 앱 시작 시 1회 조회, 설정 화면에서 강제 새로고침 가능. */
function useUsdKrwRate(composition: AppComposition | null): {
  usdKrwRate: UsdKrwRate | null;
  rateError: string | null;
  rateLoading: boolean;
  refreshRate: (forceRefresh: boolean) => void;
} {
  const [usdKrwRate, setUsdKrwRate] = useState<UsdKrwRate | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  // 마운트 시 바로 조회를 시작하므로 초기값을 true로 둔다 — effect 안에서 동기적으로
  // setState를 호출하지 않기 위함(react-hooks/set-state-in-effect).
  const [rateLoading, setRateLoading] = useState(true);

  // 효과 본문에서는 setState를 동기 호출하지 않는다 — 실제 상태 갱신은 전부
  // Promise 콜백(.then/.catch/.finally) 안에서만 일어난다.
  const fetchRate = useCallback(
    (forceRefresh: boolean) => {
      if (composition === null) {
        return;
      }
      composition.fxRateProvider
        .getUsdKrwRate({ forceRefresh })
        .then((rate) => {
          setUsdKrwRate(rate);
          setRateError(null);
        })
        .catch((fetchError: unknown) => {
          setRateError(formatProviderError(fetchError));
        })
        .finally(() => {
          setRateLoading(false);
        });
    },
    [composition],
  );

  useEffect(() => {
    fetchRate(false);
  }, [fetchRate]);

  // 버튼 클릭(이벤트 핸들러) 쪽에서만 동기적으로 loading=true를 켠다.
  const refreshRate = useCallback(
    (forceRefresh: boolean) => {
      setRateLoading(true);
      fetchRate(forceRefresh);
    },
    [fetchRate],
  );

  return { usdKrwRate, rateError, rateLoading, refreshRate };
}

function App() {
  const { composition, error } = useAppComposition();
  const [session, setSession] = useState<Session | null>(null);
  const [nextSessionId, setNextSessionId] = useState(1);
  const [view, setView] = useState<AppView>("setup");
  const { displayCurrency, setDisplayCurrency } = useDisplayCurrency(composition);
  const { usdKrwRate, rateError, rateLoading, refreshRate } = useUsdKrwRate(composition);

  const hasTiingo = composition?.providers.has(TIINGO_PROVIDER_ID) ?? false;
  const hasKrxPublicData = composition?.providers.has(KRX_PUBLIC_DATA_PROVIDER_ID) ?? false;
  const availableInstruments = useMemo(
    () => [
      ...BINANCE_INSTRUMENTS,
      ...(hasTiingo ? TIINGO_INSTRUMENTS : []),
      ...(hasKrxPublicData ? KRX_PUBLIC_DATA_INSTRUMENTS : []),
    ],
    [hasTiingo, hasKrxPublicData],
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
        <nav className="app-nav" aria-label="화면 전환">
          <button
            type="button"
            className={view === "setup" ? "app-nav__tab is-active" : "app-nav__tab"}
            onClick={() => setView("setup")}
          >
            세션 설정
          </button>
          <button
            type="button"
            className={view === "settings" ? "app-nav__tab is-active" : "app-nav__tab"}
            onClick={() => setView("settings")}
          >
            설정
          </button>
        </nav>

        {view === "settings" ? (
          <SettingsScreen
            composition={composition}
            displayCurrency={displayCurrency}
            usdKrwRate={usdKrwRate}
            rateError={rateError}
            rateLoading={rateLoading}
            onDisplayCurrencyChange={setDisplayCurrency}
            onRefreshRate={() => refreshRate(true)}
          />
        ) : (
          <>
            <SavedSessionsPanel
              composition={composition}
              instrumentCatalogById={instrumentCatalogById}
              onLoad={handleLoadSession}
            />
            <SessionSetupForm
              availableInstruments={availableInstruments}
              defaultInstrument={availableInstruments[0]}
              displayCurrency={displayCurrency}
              usdKrwRate={usdKrwRate}
              onSubmit={handleSessionSubmit}
            />
          </>
        )}
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
      displayCurrency={displayCurrency}
      usdKrwRate={usdKrwRate}
      onBackToSetup={() => setSession(null)}
    />
  );
}

export default App;
