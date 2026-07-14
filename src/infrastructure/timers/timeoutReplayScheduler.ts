import type { ReplayScheduler, SchedulerHandle } from "../../domain/replay/replayScheduler";

/** setTimeout 기반 실제 스케줄러. UI(M5)에서 ReplayEngine에 주입한다. */
export function createTimeoutReplayScheduler(): ReplayScheduler {
  let nextId = 1;
  const timers = new Map<number, ReturnType<typeof setTimeout>>();

  return {
    schedule(callback, delayMs): SchedulerHandle {
      const id = nextId;
      nextId += 1;
      timers.set(
        id,
        setTimeout(() => {
          timers.delete(id);
          callback();
        }, delayMs),
      );
      return { id };
    },
    cancel(handle) {
      const timer = timers.get(handle.id);
      if (timer !== undefined) {
        clearTimeout(timer);
        timers.delete(handle.id);
      }
    },
  };
}
