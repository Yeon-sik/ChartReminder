import { describe, expect, it } from "vitest";

import { createInMemorySqlDatabase } from "../../test/betterSqliteDatabase";
import { runMigrations } from "./migrationRunner";
import { MIGRATIONS, type SchemaMigration } from "./migrations";

const fixedClock = { nowUtcMs: () => Date.UTC(2026, 6, 14) };

interface MigrationRow {
  readonly version: number;
  readonly description: string;
  readonly applied_at_utc_ms: number;
}

describe("runMigrations", () => {
  it("빈 DB에 전체 스키마를 적용하고 기록을 남긴다", async () => {
    const db = createInMemorySqlDatabase();
    await runMigrations(db, MIGRATIONS, fixedClock);

    const applied = await db.select<MigrationRow>("SELECT * FROM schema_migrations");
    expect(applied.map((row) => row.version)).toEqual(MIGRATIONS.map((m) => m.version));

    const tables = await db.select<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );
    const tableNames = tables.map((table) => table.name);
    expect(tableNames).toContain("candles");
    expect(tableNames).toContain("candle_coverage");
    db.close();
  });

  it("재실행해도 아무것도 바뀌지 않는다 (멱등)", async () => {
    const db = createInMemorySqlDatabase();
    await runMigrations(db, MIGRATIONS, fixedClock);
    await runMigrations(db, MIGRATIONS, fixedClock);

    const applied = await db.select<MigrationRow>("SELECT * FROM schema_migrations");
    expect(applied).toHaveLength(MIGRATIONS.length);
    db.close();
  });

  it("새 버전만 이어서 적용한다", async () => {
    const db = createInMemorySqlDatabase();
    const v1: SchemaMigration = {
      version: 1,
      description: "first",
      statements: ["CREATE TABLE IF NOT EXISTS one (id INTEGER PRIMARY KEY)"],
    };
    const v2: SchemaMigration = {
      version: 2,
      description: "second",
      statements: ["CREATE TABLE IF NOT EXISTS two (id INTEGER PRIMARY KEY)"],
    };

    await runMigrations(db, [v1], fixedClock);
    await runMigrations(db, [v1, v2], fixedClock);

    const applied = await db.select<MigrationRow>(
      "SELECT * FROM schema_migrations ORDER BY version",
    );
    expect(applied.map((row) => row.version)).toEqual([1, 2]);
    db.close();
  });

  it("DB 버전이 앱보다 높으면 중단하고 DB를 건드리지 않는다", async () => {
    const db = createInMemorySqlDatabase();
    const future: SchemaMigration = {
      version: 99,
      description: "future",
      statements: ["CREATE TABLE IF NOT EXISTS future_table (id INTEGER PRIMARY KEY)"],
    };
    await runMigrations(db, [future], fixedClock);

    await expect(runMigrations(db, MIGRATIONS, fixedClock)).rejects.toThrow(/스키마 버전/);
    const tables = await db.select<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'future_table'",
    );
    expect(tables).toHaveLength(1);
    db.close();
  });

  it("문장 실패 시 예외를 전파하고 적용 기록을 남기지 않는다", async () => {
    const db = createInMemorySqlDatabase();
    const broken: SchemaMigration = {
      version: 1,
      description: "broken",
      statements: ["THIS IS NOT SQL"],
    };
    await expect(runMigrations(db, [broken], fixedClock)).rejects.toThrow();

    const applied = await db.select<MigrationRow>("SELECT * FROM schema_migrations");
    expect(applied).toHaveLength(0);
    db.close();
  });
});
