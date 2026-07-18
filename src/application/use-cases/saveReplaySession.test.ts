import { describe, expect, it } from "vitest";

import type { ReplaySessionRecord } from "../../domain/session/replaySession";
import { DomainValidationError } from "../../domain/shared/errors";
import type { Clock } from "../ports/clock";
import type { IdGenerator } from "../ports/idGenerator";
import type { SessionRepository, SessionSummary } from "../ports/sessionRepository";
import { saveReplaySession } from "./saveReplaySession";

class FakeSessionRepository implements SessionRepository {
  readonly saved: ReplaySessionRecord[] = [];

  save(session: ReplaySessionRecord): Promise<void> {
    this.saved.push(session);
    return Promise.resolve();
  }

  findById(): Promise<ReplaySessionRecord | null> {
    return Promise.resolve(null);
  }

  listSummaries(): Promise<SessionSummary[]> {
    return Promise.resolve([]);
  }
}

const CONFIGURATION = {
  assets: [],
  interval: "1d" as const,
  range: { startMs: 0, endMs: 86_400_000 },
  displayMode: "raw" as const,
  replaySpeed: 1 as const,
};

describe("saveReplaySession", () => {
  it("새 id와 생성/수정 시각을 부여해 저장한다", async () => {
    const repository = new FakeSessionRepository();
    const clock: Clock = { nowUtcMs: () => 5_000 };
    const idGenerator: IdGenerator = { newId: () => "fixed-id" };

    const record = await saveReplaySession(
      { sessionRepository: repository, clock, idGenerator },
      { name: "  내 세션  ", configuration: CONFIGURATION, dataVersions: {} },
    );

    expect(record).toMatchObject({
      id: "fixed-id",
      name: "내 세션",
      schemaVersion: 1,
      createdAtUtcMs: 5_000,
      updatedAtUtcMs: 5_000,
    });
    expect(repository.saved).toHaveLength(1);
    expect(repository.saved[0]).toEqual(record);
  });

  it("공백뿐인 이름은 거부하고 저장하지 않는다", async () => {
    const repository = new FakeSessionRepository();

    await expect(
      saveReplaySession(
        { sessionRepository: repository },
        { name: "   ", configuration: CONFIGURATION, dataVersions: {} },
      ),
    ).rejects.toThrow(DomainValidationError);
    expect(repository.saved).toHaveLength(0);
  });
});
