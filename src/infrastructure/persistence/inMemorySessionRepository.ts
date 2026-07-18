import type { SessionRepository, SessionSummary } from "../../application/ports/sessionRepository";
import type { ReplaySessionRecord } from "../../domain/session/replaySession";

/**
 * 브라우저 프리뷰 전용 메모리 세션 저장소. (InMemoryCandleRepository와 동일 패턴, M5/M6)
 * 영속성이 없다 — 앱을 새로고침하면 저장된 세션이 사라진다.
 */
export class InMemorySessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, ReplaySessionRecord>();

  save(session: ReplaySessionRecord): Promise<void> {
    this.sessions.set(session.id, session);
    return Promise.resolve();
  }

  findById(id: string): Promise<ReplaySessionRecord | null> {
    return Promise.resolve(this.sessions.get(id) ?? null);
  }

  listSummaries(): Promise<SessionSummary[]> {
    const summaries = [...this.sessions.values()]
      .map((session) => ({
        id: session.id,
        name: session.name,
        updatedAtUtcMs: session.updatedAtUtcMs,
      }))
      .sort((a, b) => b.updatedAtUtcMs - a.updatedAtUtcMs);
    return Promise.resolve(summaries);
  }
}
