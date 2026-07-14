import { beforeEach, describe, expect, it } from "vitest";

import { FakeReplayScheduler } from "../../test/fakeReplayScheduler";
import type { Candle } from "../market-data/candle";
import { buildReplayDataset, type ReplayDataset } from "./replayDataset";
import {
  ReplayEngine,
  ReplayStateError,
  type ReplayEvent,
  type ReplayEventType,
} from "./replayEngine";

const DAY_MS = 86_400_000;
const JAN_1 = Date.UTC(2024, 0, 1);

function makeCandle(instrumentId: string, dayOffset: number): Candle {
  const openTimeUtcMs = JAN_1 + dayOffset * DAY_MS;
  return {
    instrumentId,
    interval: "1d",
    openTimeUtcMs,
    closeTimeUtcMs: openTimeUtcMs + DAY_MS - 1,
    tradingDate: new Date(openTimeUtcMs).toISOString().slice(0, 10),
    open: "100",
    high: "110",
    low: "90",
    close: "105",
    quoteCurrency: "USDT",
    source: {
      providerId: "binance",
      providerSymbol: "TESTUSDT",
      fetchedAtUtcMs: JAN_1,
      priceBasis: "raw",
    },
  };
}

/** 자산 a: 1~5일차, 자산 b: 2·4·6일차 → 합집합 6일 타임라인 */
function makeDataset(): ReplayDataset {
  return buildReplayDataset(
    [
      { instrumentId: "a", candles: [0, 1, 2, 3, 4].map((day) => makeCandle("a", day)) },
      { instrumentId: "b", candles: [1, 3, 5].map((day) => makeCandle("b", day)) },
    ],
    { interval: "1d" },
  );
}

describe("ReplayEngine 상태 전이", () => {
  let scheduler: FakeReplayScheduler;
  let engine: ReplayEngine;
  let events: ReplayEvent[];

  beforeEach(() => {
    scheduler = new FakeReplayScheduler();
    engine = new ReplayEngine({ scheduler, baseStepIntervalMs: 1000 });
    events = [];
    engine.subscribe((event) => events.push(event));
  });

  const eventTypes = (): ReplayEventType[] => events.map((event) => event.type);

  it("초기 상태는 idle이다", () => {
    expect(engine.getState()).toEqual({
      status: "idle",
      cursor: 0,
      startIndex: 0,
      endIndex: 0,
      speed: 1,
    });
    expect(engine.currentDate()).toBeNull();
  });

  it("초기화 전 play/pause/stepForward/seek/restart를 거부한다", () => {
    expect(() => engine.play()).toThrow(ReplayStateError);
    expect(() => engine.pause()).toThrow(ReplayStateError);
    expect(() => engine.stepForward()).toThrow(ReplayStateError);
    expect(() => engine.seekToIndex(0)).toThrow(ReplayStateError);
    expect(() => engine.seekToDate("2024-01-01")).toThrow(ReplayStateError);
    expect(() => engine.restart()).toThrow(ReplayStateError);
  });

  it("initialize는 합집합 타임라인으로 ready가 된다", () => {
    engine.initialize(makeDataset());
    expect(engine.getState()).toMatchObject({ status: "ready", cursor: 0, endIndex: 5 });
    expect(engine.currentDate()).toBe("2024-01-01");
    expect(eventTypes()).toEqual(["replayReady"]);
  });

  it("빈 타임라인 초기화를 거부한다", () => {
    expect(() => engine.initialize(buildReplayDataset([], { interval: "1d" }))).toThrow(
      ReplayStateError,
    );
  });

  it("ready → playing으로 전이하고 tick마다 커서가 진행된다", () => {
    engine.initialize(makeDataset());
    engine.play();
    expect(engine.getState().status).toBe("playing");
    expect(eventTypes()).toEqual(["replayReady", "replayStarted"]);

    scheduler.advance(1000);
    expect(engine.getState().cursor).toBe(1);
    scheduler.advance(1000);
    expect(engine.getState().cursor).toBe(2);
    expect(engine.currentDate()).toBe("2024-01-03");
  });

  it("playing → paused → playing 왕복이 가능하다", () => {
    engine.initialize(makeDataset());
    engine.play();
    scheduler.advance(1000);

    engine.pause();
    expect(engine.getState().status).toBe("paused");
    expect(scheduler.pendingCount()).toBe(0); // 일시정지가 타이머를 취소한다

    scheduler.advance(10_000);
    expect(engine.getState().cursor).toBe(1); // 멈춰 있는 동안 진행 없음

    engine.play();
    expect(engine.getState().status).toBe("playing");
    scheduler.advance(1000);
    expect(engine.getState().cursor).toBe(2);
  });

  it("stepForward는 정확히 한 칸만 이동한다", () => {
    engine.initialize(makeDataset());
    engine.stepForward();
    expect(engine.getState()).toMatchObject({ status: "paused", cursor: 1 });
    expect(scheduler.pendingCount()).toBe(0); // 수동 진행은 타이머를 만들지 않는다
    engine.stepForward();
    expect(engine.getState().cursor).toBe(2);
  });

  it("재생 중 stepForward를 거부한다", () => {
    engine.initialize(makeDataset());
    engine.play();
    expect(() => engine.stepForward()).toThrow(ReplayStateError);
  });

  it("마지막 인덱스에 도달하면 completed가 되고 타이머가 멈춘다", () => {
    engine.initialize(makeDataset());
    engine.play();
    scheduler.advance(5000); // 5 tick → cursor 5 (endIndex)

    expect(engine.getState()).toMatchObject({ status: "completed", cursor: 5 });
    expect(scheduler.pendingCount()).toBe(0);
    expect(eventTypes().filter((type) => type === "replayCompleted")).toHaveLength(1);

    scheduler.advance(10_000);
    expect(engine.getState().cursor).toBe(5); // completed 이후 진행 없음
  });

  it("completed에서 play를 거부한다 (재개는 restart 또는 seek)", () => {
    engine.initialize(makeDataset());
    engine.seekToIndex(5);
    expect(engine.getState().status).toBe("completed");
    expect(() => engine.play()).toThrow(ReplayStateError);
  });

  it("restart 후 초기 상태와 동일하다", () => {
    engine.initialize(makeDataset());
    engine.setSpeed(2);
    engine.play();
    scheduler.advance(2000);
    const stateAfterInit = { status: "ready", cursor: 0, startIndex: 0, endIndex: 5, speed: 2 };

    engine.restart();
    expect(engine.getState()).toEqual(stateAfterInit);
    expect(scheduler.pendingCount()).toBe(0);
    expect(events[events.length - 1].type).toBe("replayReady");

    // restart 후 동일 명령 순서는 동일 전이를 만든다
    engine.play();
    scheduler.advance(500);
    expect(engine.getState().cursor).toBe(1);
  });

  it("타임라인이 1개면 play 즉시 completed다", () => {
    const single = buildReplayDataset([{ instrumentId: "a", candles: [makeCandle("a", 0)] }], {
      interval: "1d",
    });
    engine.initialize(single);
    engine.play();
    expect(engine.getState()).toMatchObject({ status: "completed", cursor: 0 });
    expect(scheduler.pendingCount()).toBe(0);
  });
});

describe("ReplayEngine seek", () => {
  let scheduler: FakeReplayScheduler;
  let engine: ReplayEngine;

  beforeEach(() => {
    scheduler = new FakeReplayScheduler();
    engine = new ReplayEngine({ scheduler, baseStepIntervalMs: 1000 });
    engine.initialize(makeDataset());
  });

  it("경계값: 시작 인덱스로 seek", () => {
    engine.stepForward();
    engine.seekToIndex(0);
    expect(engine.getState()).toMatchObject({ status: "paused", cursor: 0 });
  });

  it("경계값: 마지막 인덱스로 seek하면 completed다", () => {
    engine.seekToIndex(5);
    expect(engine.getState()).toMatchObject({ status: "completed", cursor: 5 });
  });

  it("범위 밖·비정수 인덱스를 거부한다", () => {
    expect(() => engine.seekToIndex(-1)).toThrow(ReplayStateError);
    expect(() => engine.seekToIndex(6)).toThrow(ReplayStateError);
    expect(() => engine.seekToIndex(2.5)).toThrow(ReplayStateError);
  });

  it("거래일로 seek한다 (합집합 타임라인의 어느 자산 날짜든 가능)", () => {
    engine.seekToDate("2024-01-06"); // 자산 b에만 있는 날
    expect(engine.getState().cursor).toBe(5);
  });

  it("타임라인에 없는 거래일 seek을 거부한다", () => {
    expect(() => engine.seekToDate("2030-01-01")).toThrow(ReplayStateError);
  });

  it("재생 중 seek은 재생을 유지하며 타이머를 다시 예약한다", () => {
    engine.play();
    scheduler.advance(1000);
    engine.seekToIndex(3);
    expect(engine.getState()).toMatchObject({ status: "playing", cursor: 3 });
    expect(scheduler.pendingCount()).toBe(1);

    scheduler.advance(1000);
    expect(engine.getState().cursor).toBe(4);
  });

  it("completed에서 뒤로 seek하면 paused로 되돌아간다", () => {
    engine.seekToIndex(5);
    engine.seekToIndex(2);
    expect(engine.getState()).toMatchObject({ status: "paused", cursor: 2 });
  });
});

describe("ReplayEngine 속도", () => {
  let scheduler: FakeReplayScheduler;
  let engine: ReplayEngine;

  beforeEach(() => {
    scheduler = new FakeReplayScheduler();
    engine = new ReplayEngine({ scheduler, baseStepIntervalMs: 1000 });
    engine.initialize(makeDataset());
  });

  it("속도가 tick 간격을 결정한다 (base 1000ms ÷ speed)", () => {
    engine.setSpeed(0.25);
    engine.play();
    expect(scheduler.nextDelayMs()).toBe(4000);

    scheduler.advance(4000);
    expect(engine.getState().cursor).toBe(1);
  });

  it("재생 중 속도 변경은 대기 중인 tick을 새 간격으로 재예약한다", () => {
    engine.play();
    expect(scheduler.nextDelayMs()).toBe(1000);

    engine.setSpeed(10);
    expect(scheduler.pendingCount()).toBe(1); // 기존 예약 취소 + 재예약 = 여전히 1개
    expect(scheduler.nextDelayMs()).toBe(100);

    scheduler.advance(100);
    expect(engine.getState().cursor).toBe(1);
  });

  it("같은 속도로의 변경은 이벤트 없이 무시된다", () => {
    const events: ReplayEvent[] = [];
    engine.subscribe((event) => events.push(event));
    engine.setSpeed(1);
    expect(events).toEqual([]);
  });
});

describe("ReplayEngine 중복 타이머 방지와 dispose", () => {
  let scheduler: FakeReplayScheduler;
  let engine: ReplayEngine;

  beforeEach(() => {
    scheduler = new FakeReplayScheduler();
    engine = new ReplayEngine({ scheduler, baseStepIntervalMs: 1000 });
    engine.initialize(makeDataset());
  });

  it("play를 연속 호출해도 타이머는 1개다", () => {
    engine.play();
    engine.play();
    engine.play();
    expect(scheduler.pendingCount()).toBe(1);

    scheduler.advance(1000);
    expect(engine.getState().cursor).toBe(1); // 두 배로 진행되지 않는다
    expect(scheduler.pendingCount()).toBe(1);
  });

  it("pause 연속 호출은 멱등이다", () => {
    engine.play();
    engine.pause();
    engine.pause();
    expect(engine.getState().status).toBe("paused");
  });

  it("dispose 후 명령을 거부하고 이벤트가 발생하지 않는다", () => {
    const events: ReplayEvent[] = [];
    engine.subscribe((event) => events.push(event));
    engine.play();
    engine.dispose();

    expect(scheduler.pendingCount()).toBe(0); // 타이머 취소
    scheduler.advance(10_000);
    expect(events).toEqual(expect.arrayContaining([])); // dispose 이후 새 이벤트 없음
    const countAfterDispose = events.length;
    scheduler.advance(10_000);
    expect(events).toHaveLength(countAfterDispose);

    expect(() => engine.play()).toThrow(ReplayStateError);
    expect(() => engine.initialize(makeDataset())).toThrow(ReplayStateError);
    expect(() => engine.subscribe(() => undefined)).toThrow(ReplayStateError);
    expect(() => engine.dispose()).not.toThrow(); // dispose 자체는 멱등
  });

  it("구독 해제된 리스너는 호출되지 않는다", () => {
    const events: ReplayEvent[] = [];
    const unsubscribe = engine.subscribe((event) => events.push(event));
    unsubscribe();
    engine.play();
    expect(events).toEqual([]);
  });
});

describe("ReplayEngine 오류 처리", () => {
  it("리스너 예외는 error 상태로 전이하고 replayFailed를 한 번 알린다", () => {
    const scheduler = new FakeReplayScheduler();
    const engine = new ReplayEngine({ scheduler, baseStepIntervalMs: 1000 });
    engine.initialize(makeDataset());

    const failures: ReplayEvent[] = [];
    engine.subscribe((event) => {
      if (event.type === "replayFailed") {
        failures.push(event);
        return;
      }
      if (event.type === "cursorChanged") {
        throw new Error("리스너 버그");
      }
    });

    engine.play();
    scheduler.advance(1000);

    expect(engine.getState().status).toBe("error");
    expect(scheduler.pendingCount()).toBe(0);
    expect(failures).toHaveLength(1);
    expect(failures[0].error).toBeInstanceOf(Error);
  });
});

describe("ReplayEngine 결정론", () => {
  function runScenario(): ReplayEvent[] {
    const scheduler = new FakeReplayScheduler();
    const engine = new ReplayEngine({ scheduler, baseStepIntervalMs: 1000 });
    const log: ReplayEvent[] = [];
    engine.subscribe((event) => log.push(event));

    engine.initialize(makeDataset());
    engine.play();
    scheduler.advance(1500);
    engine.setSpeed(2);
    scheduler.advance(500);
    engine.pause();
    engine.stepForward();
    engine.seekToIndex(1);
    engine.play();
    scheduler.advance(5000);
    engine.restart();
    return log;
  }

  it("같은 데이터셋·시작 상태·명령 순서는 같은 전이 로그를 만든다", () => {
    expect(runScenario()).toEqual(runScenario());
  });
});
