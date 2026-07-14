import type { ReplayScheduler, SchedulerHandle } from "../domain/replay/replayScheduler";

interface PendingTask {
  readonly id: number;
  readonly callback: () => void;
  readonly dueAtMs: number;
}

/**
 * 테스트 전용 가짜 시계 스케줄러. (docs/04 §5)
 * 가상 시간을 수동으로 전진시켜 완전히 결정론적으로 tick을 실행한다.
 */
export class FakeReplayScheduler implements ReplayScheduler {
  private nextId = 1;
  private nowMs = 0;
  private tasks: PendingTask[] = [];

  schedule(callback: () => void, delayMs: number): SchedulerHandle {
    const id = this.nextId;
    this.nextId += 1;
    this.tasks.push({ id, callback, dueAtMs: this.nowMs + delayMs });
    return { id };
  }

  cancel(handle: SchedulerHandle): void {
    this.tasks = this.tasks.filter((task) => task.id !== handle.id);
  }

  /** 대기 중인 예약 수. 중복 타이머 방지 검증에 사용한다. */
  pendingCount(): number {
    return this.tasks.length;
  }

  /** 다음 예약까지 남은 가상 시간(ms). 예약이 없으면 null. */
  nextDelayMs(): number | null {
    if (this.tasks.length === 0) {
      return null;
    }
    const earliest = Math.min(...this.tasks.map((task) => task.dueAtMs));
    return earliest - this.nowMs;
  }

  /** 가상 시간을 ms만큼 전진시키며 만기된 예약을 시간순(동시각은 등록순)으로 실행한다. */
  advance(ms: number): void {
    const targetMs = this.nowMs + ms;
    for (;;) {
      const due = this.tasks
        .filter((task) => task.dueAtMs <= targetMs)
        .sort((a, b) => a.dueAtMs - b.dueAtMs || a.id - b.id)[0];
      if (due === undefined) {
        break;
      }
      this.nowMs = due.dueAtMs;
      this.tasks = this.tasks.filter((task) => task.id !== due.id);
      due.callback();
    }
    this.nowMs = targetMs;
  }
}
