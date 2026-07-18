import { describe, expect, it } from "vitest";

import type { ReplaySessionRecord } from "../../domain/session/replaySession";
import { InMemorySessionRepository } from "./inMemorySessionRepository";

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

describe("InMemorySessionRepository", () => {
  it("저장한 세션을 왕복 조회한다", async () => {
    const repository = new InMemorySessionRepository();
    const record = makeRecord();
    await repository.save(record);
    expect(await repository.findById(record.id)).toEqual(record);
  });

  it("없는 id는 null을 반환한다", async () => {
    const repository = new InMemorySessionRepository();
    expect(await repository.findById("missing")).toBeNull();
  });

  it("목록은 최신 수정 순으로 정렬한다", async () => {
    const repository = new InMemorySessionRepository();
    await repository.save(makeRecord({ id: "a", updatedAtUtcMs: 1_000 }));
    await repository.save(makeRecord({ id: "b", updatedAtUtcMs: 3_000 }));

    const summaries = await repository.listSummaries();
    expect(summaries.map((s) => s.id)).toEqual(["b", "a"]);
  });
});
