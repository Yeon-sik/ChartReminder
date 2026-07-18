import type { ReplaySessionRecord } from "../../domain/session/replaySession";

export interface SessionSummary {
  readonly id: string;
  readonly name: string;
  readonly updatedAtUtcMs: number;
}

/** 저장된 리플레이 세션 포트. (docs/07 §2 replay_sessions) */
export interface SessionRepository {
  save(session: ReplaySessionRecord): Promise<void>;
  findById(id: string): Promise<ReplaySessionRecord | null>;
  listSummaries(): Promise<SessionSummary[]>;
}
