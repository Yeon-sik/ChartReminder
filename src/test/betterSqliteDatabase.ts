import BetterSqlite3 from "better-sqlite3";

import type { SqlDatabase } from "../infrastructure/persistence/sqlDatabase";

/**
 * 테스트 전용 SqlDatabase 구현. (D-011)
 *
 * 실제 SQLite(better-sqlite3, in-memory)를 실행해 마이그레이션·저장소 로직을
 * Tauri 런타임 없이 통합 테스트한다. tauri-plugin-sql의 `$N` 위치 바인딩을
 * better-sqlite3의 `?` 바인딩으로 변환한다.
 */
export function createInMemorySqlDatabase(): SqlDatabase & { close: () => void } {
  const db = new BetterSqlite3(":memory:");

  const bindPositional = (sql: string, params: readonly unknown[]) => {
    const ordered: unknown[] = [];
    const converted = sql.replace(/\$(\d+)/g, (_match, index: string) => {
      ordered.push(params[Number(index) - 1]);
      return "?";
    });
    return { converted, ordered };
  };

  return {
    execute(sql, params = []) {
      const { converted, ordered } = bindPositional(sql, params);
      db.prepare(converted).run(...ordered);
      return Promise.resolve();
    },
    select<TRow>(sql: string, params: readonly unknown[] = []) {
      const { converted, ordered } = bindPositional(sql, params);
      return Promise.resolve(db.prepare(converted).all(...ordered) as TRow[]);
    },
    close: () => db.close(),
  };
}
