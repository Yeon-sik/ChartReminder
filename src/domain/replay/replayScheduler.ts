/**
 * 리플레이 타이머 포트. (docs/04 §5)
 *
 * 상태 머신은 실제 시간을 모른다. 단위 테스트는 가짜 구현으로,
 * 앱은 setTimeout 기반 구현으로 주입한다. 한 번 실행되는 one-shot 예약이다.
 */
export interface SchedulerHandle {
  readonly id: number;
}

export interface ReplayScheduler {
  schedule(callback: () => void, delayMs: number): SchedulerHandle;
  cancel(handle: SchedulerHandle): void;
}
