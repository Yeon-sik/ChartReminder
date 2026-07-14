import { systemClock, type Clock } from "../../application/ports/clock";
import { MIGRATIONS, type SchemaMigration } from "./migrations";
import type { SqlDatabase } from "./sqlDatabase";

interface AppliedVersionRow {
  readonly version: number;
}

/**
 * 미적용 마이그레이션을 버전 순으로 적용한다. (docs/07 §3)
 *
 * - 앱 시작 시 호출한다. 이미 최신이면 아무것도 하지 않는다.
 * - 적용 기록은 schema_migrations 테이블에 남는다.
 * - 실패 시 예외를 그대로 전파한다. DB를 자동 삭제하거나 초기화하지 않는다.
 * - 코드가 아는 최신 버전보다 DB가 높으면(다운그레이드 실행) 오류로 중단한다.
 */
export async function runMigrations(
  db: SqlDatabase,
  migrations: readonly SchemaMigration[] = MIGRATIONS,
  clock: Clock = systemClock,
): Promise<void> {
  await db.execute(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at_utc_ms INTEGER NOT NULL
    )`,
  );

  const appliedRows = await db.select<AppliedVersionRow>(
    "SELECT version FROM schema_migrations ORDER BY version ASC",
  );
  const appliedVersions = new Set(appliedRows.map((row) => row.version));
  const currentVersion = appliedRows.length > 0 ? appliedRows[appliedRows.length - 1].version : 0;

  const knownLatest = migrations.reduce((max, migration) => Math.max(max, migration.version), 0);
  if (currentVersion > knownLatest) {
    throw new Error(
      `DB 스키마 버전(${currentVersion})이 앱이 아는 버전(${knownLatest})보다 높다. ` +
        "구버전 앱으로 최신 DB를 열 수 없다. DB를 삭제하지 말고 앱을 업데이트해야 한다.",
    );
  }

  const pending = [...migrations]
    .sort((a, b) => a.version - b.version)
    .filter((migration) => !appliedVersions.has(migration.version));

  for (const migration of pending) {
    for (const statement of migration.statements) {
      await db.execute(statement);
    }
    await db.execute(
      "INSERT INTO schema_migrations (version, description, applied_at_utc_ms) VALUES ($1, $2, $3)",
      [migration.version, migration.description, clock.nowUtcMs()],
    );
  }
}
