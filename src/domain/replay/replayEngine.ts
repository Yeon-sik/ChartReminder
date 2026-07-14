import type { TradingDate } from "../shared/time";
import type { ReplayDataset } from "./replayDataset";
import type { ReplayScheduler, SchedulerHandle } from "./replayScheduler";

export const REPLAY_SPEEDS = [0.25, 0.5, 1, 2, 5, 10] as const;
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];

export type ReplayStatus = "idle" | "ready" | "playing" | "paused" | "completed" | "error";

export interface ReplayState {
  readonly status: ReplayStatus;
  /** 현재 공개된 타임라인 인덱스. ready 상태에서 startIndex(첫 거래일 공개). */
  readonly cursor: number;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly speed: ReplaySpeed;
}

export type ReplayEventType =
  | "replayReady"
  | "replayStarted"
  | "cursorChanged"
  | "speedChanged"
  | "replayPaused"
  | "replayCompleted"
  | "replayFailed";

export interface ReplayEvent {
  readonly type: ReplayEventType;
  readonly state: ReplayState;
  readonly error?: unknown;
}

export type ReplayEventListener = (event: ReplayEvent) => void;

/** 허용되지 않는 상태 전이 명령. 호출 측 버그를 조용히 넘기지 않기 위해 던진다. */
export class ReplayStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReplayStateError";
  }
}

export interface ReplayEngineOptions {
  readonly scheduler: ReplayScheduler;
  /**
   * 1x 속도에서 한 스텝의 가상 시간 간격(ms). 기본 1000.
   * 정확한 기본값은 UI 테스트 후 조정한다 (docs/04 §4).
   */
  readonly baseStepIntervalMs?: number;
}

/**
 * 결정론적 리플레이 상태 머신. (docs/04)
 *
 * - 데이터 조회·투자 계산·렌더링을 하지 않는다. 준비된 데이터셋의 커서만 진행한다.
 * - 타이머는 주입된 scheduler로만 예약한다. 같은 데이터셋·시작 상태·명령 순서는
 *   항상 같은 상태 전이를 만든다.
 * - 대기 중인 tick 예약은 항상 최대 1개다 (중복 타이머 방지).
 * - 이벤트 리스너가 던진 예외는 엔진을 error 상태로 전이시키고 replayFailed로 알린다.
 */
export class ReplayEngine {
  private readonly scheduler: ReplayScheduler;
  private readonly baseStepIntervalMs: number;
  private readonly listeners = new Set<ReplayEventListener>();

  private dataset: ReplayDataset | null = null;
  private state: ReplayState = { status: "idle", cursor: 0, startIndex: 0, endIndex: 0, speed: 1 };
  private pendingTick: SchedulerHandle | null = null;
  private disposed = false;
  private failing = false;

  constructor(options: ReplayEngineOptions) {
    this.scheduler = options.scheduler;
    this.baseStepIntervalMs = options.baseStepIntervalMs ?? 1000;
  }

  getState(): ReplayState {
    return { ...this.state };
  }

  /** 현재 커서의 거래일. idle에서는 null. */
  currentDate(): TradingDate | null {
    if (this.dataset === null || this.state.status === "idle") {
      return null;
    }
    return this.dataset.timeline[this.state.cursor];
  }

  subscribe(listener: ReplayEventListener): () => void {
    this.assertNotDisposed("subscribe");
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  initialize(dataset: ReplayDataset): void {
    this.assertNotDisposed("initialize");
    if (dataset.timeline.length === 0) {
      throw new ReplayStateError("빈 타임라인으로 초기화할 수 없다");
    }
    this.cancelPendingTick();
    this.dataset = dataset;
    this.state = {
      status: "ready",
      cursor: 0,
      startIndex: 0,
      endIndex: dataset.timeline.length - 1,
      speed: this.state.speed,
    };
    this.emit("replayReady");
  }

  play(): void {
    this.assertNotDisposed("play");
    if (this.state.status === "playing") {
      return; // 멱등: 이미 재생 중이면 새 타이머를 만들지 않는다
    }
    if (this.state.status !== "ready" && this.state.status !== "paused") {
      throw new ReplayStateError(`${this.state.status} 상태에서는 play할 수 없다`);
    }
    if (this.state.cursor >= this.state.endIndex) {
      // 타임라인이 1개뿐이라 시작 즉시 끝에 있는 경우
      this.state = { ...this.state, status: "completed" };
      this.emit("replayCompleted");
      return;
    }
    this.state = { ...this.state, status: "playing" };
    this.emit("replayStarted");
    this.scheduleNextTick();
  }

  pause(): void {
    this.assertNotDisposed("pause");
    if (this.state.status === "paused") {
      return; // 멱등
    }
    if (this.state.status !== "playing") {
      throw new ReplayStateError(`${this.state.status} 상태에서는 pause할 수 없다`);
    }
    this.cancelPendingTick();
    this.state = { ...this.state, status: "paused" };
    this.emit("replayPaused");
  }

  stepForward(): void {
    this.assertNotDisposed("stepForward");
    if (this.state.status !== "ready" && this.state.status !== "paused") {
      throw new ReplayStateError(`${this.state.status} 상태에서는 stepForward할 수 없다`);
    }
    // 시작점에서 수동 진행하면 이후는 일시정지 상태로 취급한다
    if (this.state.status === "ready") {
      this.state = { ...this.state, status: "paused" };
    }
    this.advanceCursor();
  }

  seekToIndex(index: number): void {
    this.assertNotDisposed("seek");
    const { status, startIndex, endIndex } = this.state;
    if (status === "idle" || this.dataset === null) {
      throw new ReplayStateError("초기화 전에는 seek할 수 없다");
    }
    if (status === "error") {
      throw new ReplayStateError("error 상태에서는 seek할 수 없다");
    }
    if (!Number.isInteger(index) || index < startIndex || index > endIndex) {
      throw new ReplayStateError(
        `seek 인덱스가 범위를 벗어났다: ${index} (허용: ${startIndex}~${endIndex})`,
      );
    }

    const wasPlaying = status === "playing";
    this.cancelPendingTick();

    if (index >= endIndex) {
      this.state = { ...this.state, cursor: index, status: "completed" };
      this.emit("cursorChanged");
      this.emit("replayCompleted");
      return;
    }

    // 재생 중이 아니면 seek 후에는 일시정지 상태다 (재생 재개는 명시적 play)
    const nextStatus = wasPlaying ? "playing" : "paused";
    this.state = { ...this.state, cursor: index, status: nextStatus };
    this.emit("cursorChanged");
    if (wasPlaying) {
      this.scheduleNextTick();
    }
  }

  seekToDate(date: TradingDate): void {
    this.assertNotDisposed("seek");
    if (this.dataset === null) {
      throw new ReplayStateError("초기화 전에는 seek할 수 없다");
    }
    const index = this.dataset.timeline.indexOf(date);
    if (index < 0) {
      throw new ReplayStateError(`타임라인에 없는 거래일이다: ${date}`);
    }
    this.seekToIndex(index);
  }

  setSpeed(speed: ReplaySpeed): void {
    this.assertNotDisposed("setSpeed");
    if (!REPLAY_SPEEDS.includes(speed)) {
      throw new ReplayStateError(`지원하지 않는 속도다: ${speed}`);
    }
    if (speed === this.state.speed) {
      return;
    }
    this.state = { ...this.state, speed };
    // 재생 중이면 대기 중인 tick을 새 간격으로 다시 예약한다.
    // 남은 시간 비례 재계산 대신 전체 간격 재예약을 택한다 (결정론적이고 단순).
    if (this.state.status === "playing") {
      this.cancelPendingTick();
      this.scheduleNextTick();
    }
    this.emit("speedChanged");
  }

  restart(): void {
    this.assertNotDisposed("restart");
    if (this.state.status === "idle" || this.dataset === null) {
      throw new ReplayStateError("초기화 전에는 restart할 수 없다");
    }
    this.cancelPendingTick();
    this.state = { ...this.state, status: "ready", cursor: this.state.startIndex };
    this.emit("replayReady");
  }

  dispose(): void {
    if (this.disposed) {
      return; // 멱등
    }
    this.cancelPendingTick();
    this.listeners.clear();
    this.disposed = true;
  }

  private stepIntervalMs(): number {
    return this.baseStepIntervalMs / this.state.speed;
  }

  private scheduleNextTick(): void {
    if (this.pendingTick !== null) {
      return; // 중복 타이머 방지
    }
    this.pendingTick = this.scheduler.schedule(this.handleTick, this.stepIntervalMs());
  }

  private readonly handleTick = (): void => {
    this.pendingTick = null;
    if (this.disposed || this.state.status !== "playing") {
      return; // 취소 경합 등으로 늦게 도착한 tick은 무시한다
    }
    this.advanceCursor();
    if (this.state.status === "playing") {
      this.scheduleNextTick();
    }
  };

  /** 커서를 한 칸 전진시키고, 끝에 도달하면 completed로 전이한다. */
  private advanceCursor(): void {
    const nextCursor = this.state.cursor + 1;
    if (nextCursor >= this.state.endIndex) {
      this.state = { ...this.state, cursor: this.state.endIndex, status: "completed" };
      this.emit("cursorChanged");
      this.emit("replayCompleted");
      return;
    }
    this.state = { ...this.state, cursor: nextCursor };
    this.emit("cursorChanged");
  }

  private emit(type: ReplayEventType, error?: unknown): void {
    if (this.disposed) {
      return;
    }
    const event: ReplayEvent = { type, state: this.getState(), error };
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (listenerError) {
        this.fail(listenerError);
        return;
      }
    }
  }

  /** 내부 실패 처리: 타이머를 멈추고 error 상태로 전이한 뒤 한 번만 알린다. */
  private fail(error: unknown): void {
    if (this.failing) {
      return; // replayFailed 처리 중 재실패는 전파를 멈춘다 (무한 루프 방지)
    }
    this.failing = true;
    try {
      this.cancelPendingTick();
      this.state = { ...this.state, status: "error" };
      this.emit("replayFailed", error);
    } finally {
      this.failing = false;
    }
  }

  private cancelPendingTick(): void {
    if (this.pendingTick !== null) {
      this.scheduler.cancel(this.pendingTick);
      this.pendingTick = null;
    }
  }

  private assertNotDisposed(command: string): void {
    if (this.disposed) {
      throw new ReplayStateError(`dispose된 엔진에는 ${command}를 호출할 수 없다`);
    }
  }
}
