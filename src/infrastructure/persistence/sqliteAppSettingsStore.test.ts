import { beforeEach, describe, expect, it } from "vitest";

import { createInMemorySqlDatabase } from "../../test/betterSqliteDatabase";
import { runMigrations } from "./migrationRunner";
import { SqliteAppSettingsStore } from "./sqliteAppSettingsStore";

describe("SqliteAppSettingsStore (실제 SQLite 통합)", () => {
  let db: ReturnType<typeof createInMemorySqlDatabase>;
  let store: SqliteAppSettingsStore;

  beforeEach(async () => {
    db = createInMemorySqlDatabase();
    await runMigrations(db);
    store = new SqliteAppSettingsStore(db);
  });

  it("저장된 값이 없으면 기본값 KRW를 반환한다", async () => {
    expect(await store.getDisplayCurrency()).toBe("KRW");
  });

  it("저장한 값을 다시 읽을 수 있다", async () => {
    await store.setDisplayCurrency("USD");
    expect(await store.getDisplayCurrency()).toBe("USD");
  });

  it("여러 번 저장해도 마지막 값만 남는다", async () => {
    await store.setDisplayCurrency("USD");
    await store.setDisplayCurrency("KRW");
    expect(await store.getDisplayCurrency()).toBe("KRW");
  });
});
