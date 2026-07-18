import { beforeEach, describe, expect, it } from "vitest";

import type { ReplaySessionRecord } from "../../domain/session/replaySession";
import { createInMemorySqlDatabase } from "../../test/betterSqliteDatabase";
import { runMigrations } from "./migrationRunner";
import { SqliteSessionRepository } from "./sqliteSessionRepository";

function makeRecord(overrides: Partial<ReplaySessionRecord> = {}): ReplaySessionRecord {
  return {
    id: "session-1",
    name: "BTC 2024",
    schemaVersion: 1,
    configuration: {
      assets: [
        {
          instrumentId: "crypto-btc-usdt",
          providerId: "binance",
          providerSymbol: "BTCUSDT",
          simulationConfig: {
            mode: "lump-sum",
            initialCash: { amount: "1000", currency: "USDT" },
            executionPrice: "close",
            feeRate: "0",
            allowFractionalQuantity: true,
            dividendPolicy: "ignore",
          },
        },
      ],
      interval: "1d",
      range: { startMs: 0, endMs: 86_400_000 },
      displayMode: "raw",
      replaySpeed: 1,
    },
    dataVersions: { "crypto-btc-usdt": "v1" },
    createdAtUtcMs: 1_000,
    updatedAtUtcMs: 1_000,
    ...overrides,
  };
}

describe("SqliteSessionRepository (실제 SQLite 통합)", () => {
  let db: ReturnType<typeof createInMemorySqlDatabase>;
  let repository: SqliteSessionRepository;

  beforeEach(async () => {
    db = createInMemorySqlDatabase();
    await runMigrations(db);
    repository = new SqliteSessionRepository(db);
  });

  it("저장한 세션을 손실 없이 왕복 조회한다", async () => {
    const record = makeRecord();
    await repository.save(record);

    const found = await repository.findById(record.id);
    expect(found).toEqual(record);
  });

  it("없는 id는 null을 반환한다 (오류 아님)", async () => {
    expect(await repository.findById("missing")).toBeNull();
  });

  it("같은 id로 다시 저장하면 덮어쓴다 (upsert)", async () => {
    await repository.save(makeRecord({ name: "첫 이름" }));
    await repository.save(makeRecord({ name: "바뀐 이름", updatedAtUtcMs: 2_000 }));

    const found = await repository.findById("session-1");
    expect(found?.name).toBe("바뀐 이름");

    const all = await repository.listSummaries();
    expect(all).toHaveLength(1);
  });

  it("목록은 최신 수정 순으로 정렬한다", async () => {
    await repository.save(makeRecord({ id: "a", updatedAtUtcMs: 1_000 }));
    await repository.save(makeRecord({ id: "b", updatedAtUtcMs: 3_000 }));
    await repository.save(makeRecord({ id: "c", updatedAtUtcMs: 2_000 }));

    const summaries = await repository.listSummaries();
    expect(summaries.map((s) => s.id)).toEqual(["b", "c", "a"]);
  });
});
