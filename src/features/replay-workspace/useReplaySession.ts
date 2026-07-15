import { useEffect, useState, useSyncExternalStore } from "react";

import type { AppComposition } from "../../app/composition";
import {
  prepareReplaySession,
  type AssetDataNotice,
  type PrepareReplaySessionRequest,
  type PrepareReplaySessionResult,
} from "../../application/use-cases/prepareReplaySession";
import type { ReplayDataset } from "../../domain/replay/replayDataset";
import type { ReplayEngine, ReplaySpeed, ReplayState } from "../../domain/replay/replayEngine";
import type { SimulationResult } from "../../domain/simulation/simulationEngine";
import { formatProviderError } from "./format";

type PrepareState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly result: PrepareReplaySessionResult }
  | { readonly status: "error"; readonly message: string };

export type ReplaySessionStatus = "loading" | "ready" | "error";

export interface UseReplaySessionResult {
  readonly status: ReplaySessionStatus;
  readonly errorMessage: string | null;
  readonly dataset: ReplayDataset | null;
  readonly resultsByInstrumentId: Readonly<Record<string, SimulationResult>> | null;
  readonly dataNoticesByInstrumentId: Readonly<Record<string, AssetDataNotice>> | null;
  readonly replayState: ReplayState | null;
  readonly play: () => void;
  readonly pause: () => void;
  readonly stepForward: () => void;
  readonly restart: () => void;
  readonly setSpeed: (speed: ReplaySpeed) => void;
  readonly seekToIndex: (index: number) => void;
}

/**
 * ReplayEngine을 위한 최소 외부 스토어. (useSyncExternalStore 짝)
 *
 * 엔진 생성/해제는 effect에서 일어나는 부수효과이므로 React state로 직접 미러링하지
 * 않는다 — 대신 이 스토어가 구독자에게 알리고, 컴포넌트는 useSyncExternalStore로
 * 스냅샷만 읽는다.
 */
function createEngineStore() {
  let engine: ReplayEngine | null = null;
  let unsubscribeEngine: (() => void) | null = null;
  let snapshot: ReplayState | null = null;
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  return {
    getSnapshot: (): ReplayState | null => snapshot,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    attach: (nextEngine: ReplayEngine): void => {
      engine = nextEngine;
      snapshot = nextEngine.getState();
      unsubscribeEngine = nextEngine.subscribe((event) => {
        snapshot = event.state;
        notify();
      });
      notify();
    },
    detach: (): void => {
      unsubscribeEngine?.();
      unsubscribeEngine = null;
      engine = null;
      snapshot = null;
      notify();
    },
    getEngine: (): ReplayEngine | null => engine,
  };
}

type EngineStore = ReturnType<typeof createEngineStore>;

/**
 * 데이터 준비(비동기) + 리플레이 엔진 구독을 하나로 묶는다. (M5 view model 경계)
 *
 * `composition`과 `request`는 호출측이 세션 제출 시점에만 새로 만드는 안정된 참조라고
 * 신뢰한다 — 이 훅의 생애주기(컴포넌트 마운트) 동안 한 세션만 다룬다.
 */
export function useReplaySession(
  composition: AppComposition,
  request: PrepareReplaySessionRequest,
): UseReplaySessionResult {
  const [store] = useState<EngineStore>(createEngineStore);

  const prepareState = usePrepareReplaySession(composition, request);

  useEffect(() => {
    if (prepareState.status !== "ready") {
      return;
    }
    const engine = composition.buildReplayEngine();
    engine.initialize(prepareState.result.dataset);
    store.attach(engine);
    return () => {
      store.detach();
      engine.dispose();
    };
  }, [composition, prepareState, store]);

  const replayState = useSyncExternalStore(store.subscribe, store.getSnapshot);

  return {
    status: prepareState.status,
    errorMessage: prepareState.status === "error" ? prepareState.message : null,
    dataset: prepareState.status === "ready" ? prepareState.result.dataset : null,
    resultsByInstrumentId:
      prepareState.status === "ready" ? prepareState.result.resultsByInstrumentId : null,
    dataNoticesByInstrumentId:
      prepareState.status === "ready" ? prepareState.result.dataNoticesByInstrumentId : null,
    replayState,
    play: () => store.getEngine()?.play(),
    pause: () => store.getEngine()?.pause(),
    stepForward: () => store.getEngine()?.stepForward(),
    restart: () => store.getEngine()?.restart(),
    setSpeed: (speed) => store.getEngine()?.setSpeed(speed),
    seekToIndex: (index) => store.getEngine()?.seekToIndex(index),
  };
}

function createPrepareStateStore(): { value: PrepareState; listeners: Set<() => void> } {
  return { value: { status: "loading" }, listeners: new Set() };
}

/** prepareReplaySession 비동기 상태. 마운트 동안 request/composition이 고정이라고 신뢰한다. */
function usePrepareReplaySession(
  composition: AppComposition,
  request: PrepareReplaySessionRequest,
): PrepareState {
  const [stateStore] = useState(createPrepareStateStore);

  useEffect(() => {
    let cancelled = false;

    function setValue(next: PrepareState): void {
      if (cancelled) {
        return;
      }
      stateStore.value = next;
      for (const listener of stateStore.listeners) {
        listener();
      }
    }

    prepareReplaySession(composition, request)
      .then((result) => setValue({ status: "ready", result }))
      .catch((error: unknown) =>
        setValue({ status: "error", message: formatProviderError(error) }),
      );

    return () => {
      cancelled = true;
    };
  }, [composition, request, stateStore]);

  return useSyncExternalStore(
    (listener) => {
      stateStore.listeners.add(listener);
      return () => stateStore.listeners.delete(listener);
    },
    () => stateStore.value,
  );
}
