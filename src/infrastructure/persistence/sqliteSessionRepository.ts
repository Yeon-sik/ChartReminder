import type { SessionRepository, SessionSummary } from "../../application/ports/sessionRepository";
import type {
  ReplaySessionRecord,
  SavedSessionConfiguration,
  SavedSessionDataVersions,
} from "../../domain/session/replaySession";
import { DomainValidationError } from "../../domain/shared/errors";
import type { SqlDatabase } from "./sqlDatabase";

interface SessionRow {
  readonly id: string;
  readonly name: string;
  readonly schema_version: number;
  readonly configuration_json: string;
  readonly data_version_json: string | null;
  readonly created_at_utc_ms: number;
  readonly updated_at_utc_ms: number;
}

function parseConfiguration(json: string): SavedSessionConfiguration {
  try {
    return JSON.parse(json) as SavedSessionConfiguration;
  } catch {
    throw new DomainValidationError("저장된 세션 configuration_json이 유효한 JSON이 아니다");
  }
}

function parseDataVersions(json: string | null): SavedSessionDataVersions {
  if (json === null) {
    return {};
  }
  try {
    return JSON.parse(json) as SavedSessionDataVersions;
  } catch {
    throw new DomainValidationError("저장된 세션 data_version_json이 유효한 JSON이 아니다");
  }
}

/**
 * SQLite 세션 저장소. (docs/07 §2 replay_sessions, D-011)
 *
 * SqliteCandleRepository와 동일한 패턴 — 실패해도 DB를 삭제하지 않고 예외를 그대로 전파한다.
 */
export class SqliteSessionRepository implements SessionRepository {
  constructor(private readonly db: SqlDatabase) {}

  async save(session: ReplaySessionRecord): Promise<void> {
    await this.db.execute(
      `INSERT OR REPLACE INTO replay_sessions
        (id, name, schema_version, configuration_json, data_version_json, created_at_utc_ms, updated_at_utc_ms)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        session.id,
        session.name,
        session.schemaVersion,
        JSON.stringify(session.configuration),
        JSON.stringify(session.dataVersions),
        session.createdAtUtcMs,
        session.updatedAtUtcMs,
      ],
    );
  }

  async findById(id: string): Promise<ReplaySessionRecord | null> {
    const rows = await this.db.select<SessionRow>(`SELECT * FROM replay_sessions WHERE id = $1`, [
      id,
    ]);
    const row = rows[0];
    return row === undefined ? null : this.rowToRecord(row);
  }

  async listSummaries(): Promise<SessionSummary[]> {
    const rows = await this.db.select<Pick<SessionRow, "id" | "name" | "updated_at_utc_ms">>(
      `SELECT id, name, updated_at_utc_ms FROM replay_sessions ORDER BY updated_at_utc_ms DESC`,
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      updatedAtUtcMs: row.updated_at_utc_ms,
    }));
  }

  private rowToRecord(row: SessionRow): ReplaySessionRecord {
    return {
      id: row.id,
      name: row.name,
      schemaVersion: row.schema_version,
      configuration: parseConfiguration(row.configuration_json),
      dataVersions: parseDataVersions(row.data_version_json),
      createdAtUtcMs: row.created_at_utc_ms,
      updatedAtUtcMs: row.updated_at_utc_ms,
    };
  }
}
