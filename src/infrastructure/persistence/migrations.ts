/**
 * 버전 관리되는 스키마 마이그레이션. (docs/07 §3, D-011)
 *
 * 규칙:
 * - 배포된 마이그레이션은 수정하지 않는다. 변경은 새 버전을 추가한다.
 * - 트랜잭션이 보장되지 않으므로 각 문장은 가능한 한 멱등적으로 작성한다(IF NOT EXISTS).
 * - 실패해도 DB를 삭제하지 않는다. 다음 시작에서 미적용 버전부터 재시도한다.
 */
export interface SchemaMigration {
  readonly version: number;
  readonly description: string;
  readonly statements: readonly string[];
}

export const MIGRATIONS: readonly SchemaMigration[] = [
  {
    version: 1,
    description: "candle cache tables",
    statements: [
      `CREATE TABLE IF NOT EXISTS candles (
        instrument_id TEXT NOT NULL,
        interval TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        open_time_utc_ms INTEGER NOT NULL,
        close_time_utc_ms INTEGER NOT NULL,
        trading_date TEXT NOT NULL,
        open TEXT NOT NULL,
        high TEXT NOT NULL,
        low TEXT NOT NULL,
        close TEXT NOT NULL,
        adjusted_close TEXT,
        volume TEXT,
        quote_currency TEXT NOT NULL,
        provider_symbol TEXT NOT NULL,
        price_basis TEXT NOT NULL,
        fetched_at_utc_ms INTEGER NOT NULL,
        data_version TEXT,
        PRIMARY KEY (instrument_id, interval, provider_id, open_time_utc_ms)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_candles_trading_date
        ON candles (instrument_id, interval, provider_id, trading_date)`,
      `CREATE TABLE IF NOT EXISTS candle_coverage (
        instrument_id TEXT NOT NULL,
        interval TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        start_time_utc_ms INTEGER NOT NULL,
        end_time_utc_ms INTEGER NOT NULL,
        fetched_at_utc_ms INTEGER NOT NULL,
        PRIMARY KEY (instrument_id, interval, provider_id, start_time_utc_ms)
      )`,
    ],
  },
];
