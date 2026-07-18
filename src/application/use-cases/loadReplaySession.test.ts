import { describe, expect, it } from "vitest";

import type { ReplaySessionRecord } from "../../domain/session/replaySession";
import { DomainValidationError } from "../../domain/shared/errors";
import type { SessionRepository, SessionSummary } from "../ports/sessionRepository";
import { loadReplaySession } from "./loadReplaySession";

function makeRecord(overrides: Partial<ReplaySessionRecord> = {}): ReplaySessionRecord {
  return {
    id: "session-1",
    name: "BTC 2024",
    schemaVersion: 1,
    configuration: {
      assets: [],
      interval: "1d",
      range: { startMs: 0, endMs: 86_400_000 },
      displayMode: "raw",
      replaySpeed: 1,
    },
    dataVersions: {},
    createdAtUtcMs: 1_000,
    updatedAtUtcMs: 1_000,
    ...overrides,
  };
}

class FakeSessionRepository implements SessionRepository {
  constructor(private readonly records: Record<string, ReplaySessionRecord>) {}

  save(): Promise<void> {
    return Promise.resolve();
  }

  findById(id: string): Promise<ReplaySessionRecord | null> {
    return Promise.resolve(this.records[id] ?? null);
  }

  listSummaries(): Promise<SessionSummary[]> {
    return Promise.resolve([]);
  }
}

describe("loadReplaySession", () => {
  it("저장된 세션을 반환한다", async () => {
    const record = makeRecord();
    const repository = new FakeSessionRepository({ [record.id]: record });
    expect(await loadReplaySession(repository, record.id)).toEqual(record);
  });

  it("없는 id는 사용자 오류로 알린다", async () => {
    const repository = new FakeSessionRepository({});
    await expect(loadReplaySession(repository, "missing")).rejects.toThrow(DomainValidationError);
  });

  it("스키마 버전이 다르면 거부한다", async () => {
    const record = makeRecord({ schemaVersion: 99 });
    const repository = new FakeSessionRepository({ [record.id]: record });
    await expect(loadReplaySession(repository, record.id)).rejects.toThrow(DomainValidationError);
  });
});
