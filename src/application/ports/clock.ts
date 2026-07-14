import type { UtcTimestampMs } from "../../domain/shared/time";

/** 현재 시각 공급 포트. 결정론적 테스트를 위해 주입한다. */
export interface Clock {
  nowUtcMs(): UtcTimestampMs;
}

export const systemClock: Clock = {
  nowUtcMs: () => Date.now(),
};
