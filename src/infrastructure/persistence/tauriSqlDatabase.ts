import Database from "@tauri-apps/plugin-sql";

import type { SqlDatabase } from "./sqlDatabase";

/** 앱 데이터 디렉터리 기준 상대 경로. (tauri-plugin-sql 규약) */
export const APP_DATABASE_PATH = "sqlite:investment-replay.db";

/**
 * tauri-plugin-sql 기반 SqlDatabase 구현. Tauri 런타임에서만 동작하며
 * 테스트에서는 import하지 않는다 (테스트는 src/test/betterSqliteDatabase.ts 사용).
 */
export async function openTauriSqlDatabase(path: string = APP_DATABASE_PATH): Promise<SqlDatabase> {
  const db = await Database.load(path);
  return {
    async execute(sql, params) {
      await db.execute(sql, params === undefined ? undefined : [...params]);
    },
    async select<TRow>(sql: string, params?: readonly unknown[]) {
      return db.select<TRow[]>(sql, params === undefined ? undefined : [...params]);
    },
  };
}
