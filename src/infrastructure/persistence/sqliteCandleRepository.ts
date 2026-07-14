import type {
  CandleBatch,
  CandleRangeQuery,
  CandleRangeResult,
  CandleRepository,
} from "../../application/ports/candleRepository";
import type { Candle, CandleInterval, PriceBasis } from "../../domain/market-data/candle";
import { normalizeUtcTimeRanges } from "../../domain/market-data/timeRange";
import { DomainValidationError } from "../../domain/shared/errors";
import type { SqlDatabase } from "./sqlDatabase";

interface CandleRow {
  readonly instrument_id: string;
  readonly interval: string;
  readonly provider_id: string;
  readonly open_time_utc_ms: number;
  readonly close_time_utc_ms: number;
  readonly trading_date: string;
  readonly open: string;
  readonly high: string;
  readonly low: string;
  readonly close: string;
  readonly adjusted_close: string | null;
  readonly volume: string | null;
  readonly quote_currency: string;
  readonly provider_symbol: string;
  readonly price_basis: string;
  readonly fetched_at_utc_ms: number;
  readonly data_version: string | null;
}

interface CoverageRow {
  readonly start_time_utc_ms: number;
  readonly end_time_utc_ms: number;
}

const CANDLE_COLUMNS = [
  "instrument_id",
  "interval",
  "provider_id",
  "open_time_utc_ms",
  "close_time_utc_ms",
  "trading_date",
  "open",
  "high",
  "low",
  "close",
  "adjusted_close",
  "volume",
  "quote_currency",
  "provider_symbol",
  "price_basis",
  "fetched_at_utc_ms",
  "data_version",
] as const;

/** SQLite 파라미터 상한(기본 999)을 넘지 않도록 한 문장당 행 수를 제한한다. */
const UPSERT_CHUNK_SIZE = 50;

function parseInterval(value: string): CandleInterval {
  if (value !== "1d") {
    throw new DomainValidationError(`지원하지 않는 interval이 저장돼 있다: "${value}"`);
  }
  return value;
}

function parsePriceBasis(value: string): PriceBasis {
  if (value !== "raw" && value !== "adjusted") {
    throw new DomainValidationError(`지원하지 않는 price_basis가 저장돼 있다: "${value}"`);
  }
  return value;
}

/**
 * SQLite 캔들 캐시 저장소. (docs/07 §2, D-011)
 *
 * 쓰기 순서는 캔들 → 커버리지다. 중간 실패 시 커버리지가 기록되지 않아
 * 다음 조회가 같은 범위를 다시 받아 덮어쓰므로(upsert) 재실행에 안전하다.
 */
export class SqliteCandleRepository implements CandleRepository {
  constructor(private readonly db: SqlDatabase) {}

  async findRange(query: CandleRangeQuery): Promise<CandleRangeResult> {
    const keyParams = [query.instrumentId, query.interval, query.providerId];
    const rows = await this.db.select<CandleRow>(
      `SELECT * FROM candles
        WHERE instrument_id = $1 AND interval = $2 AND provider_id = $3
          AND open_time_utc_ms >= $4 AND open_time_utc_ms < $5
        ORDER BY open_time_utc_ms ASC`,
      [...keyParams, query.range.startMs, query.range.endMs],
    );
    const coverageRows = await this.db.select<CoverageRow>(
      `SELECT start_time_utc_ms, end_time_utc_ms FROM candle_coverage
        WHERE instrument_id = $1 AND interval = $2 AND provider_id = $3
          AND end_time_utc_ms > $4 AND start_time_utc_ms < $5
        ORDER BY start_time_utc_ms ASC`,
      [...keyParams, query.range.startMs, query.range.endMs],
    );

    return {
      candles: rows.map((row) => this.rowToCandle(row)),
      coveredRanges: coverageRows.map((row) => ({
        startMs: row.start_time_utc_ms,
        endMs: row.end_time_utc_ms,
      })),
    };
  }

  async upsertBatch(batch: CandleBatch): Promise<void> {
    this.assertBatchConsistent(batch);

    for (let offset = 0; offset < batch.candles.length; offset += UPSERT_CHUNK_SIZE) {
      const chunk = batch.candles.slice(offset, offset + UPSERT_CHUNK_SIZE);
      await this.upsertChunk(chunk);
    }
    await this.mergeCoverage(batch);
  }

  private async upsertChunk(chunk: readonly Candle[]): Promise<void> {
    const params: unknown[] = [];
    const valuePlaceholders = chunk.map((candle, rowIndex) => {
      params.push(
        candle.instrumentId,
        candle.interval,
        candle.source.providerId,
        candle.openTimeUtcMs,
        candle.closeTimeUtcMs,
        candle.tradingDate,
        candle.open,
        candle.high,
        candle.low,
        candle.close,
        candle.adjustedClose ?? null,
        candle.volume ?? null,
        candle.quoteCurrency,
        candle.source.providerSymbol,
        candle.source.priceBasis,
        candle.source.fetchedAtUtcMs,
        candle.source.dataVersion ?? null,
      );
      const base = rowIndex * CANDLE_COLUMNS.length;
      const placeholders = CANDLE_COLUMNS.map((_, column) => `$${base + column + 1}`);
      return `(${placeholders.join(", ")})`;
    });

    await this.db.execute(
      `INSERT OR REPLACE INTO candles (${CANDLE_COLUMNS.join(", ")})
        VALUES ${valuePlaceholders.join(", ")}`,
      params,
    );
  }

  /**
   * 새 커버리지를 기존 커버리지와 병합해 최소 조각으로 유지한다.
   * 검색 후 삭제·재삽입이므로 조각 수는 항상 작게 유지된다.
   */
  private async mergeCoverage(batch: CandleBatch): Promise<void> {
    const keyParams = [batch.instrumentId, batch.interval, batch.providerId];
    const existing = await this.db.select<CoverageRow>(
      `SELECT start_time_utc_ms, end_time_utc_ms FROM candle_coverage
        WHERE instrument_id = $1 AND interval = $2 AND provider_id = $3`,
      keyParams,
    );
    const merged = normalizeUtcTimeRanges([
      ...existing.map((row) => ({ startMs: row.start_time_utc_ms, endMs: row.end_time_utc_ms })),
      batch.coveredRange,
    ]);

    await this.db.execute(
      `DELETE FROM candle_coverage
        WHERE instrument_id = $1 AND interval = $2 AND provider_id = $3`,
      keyParams,
    );
    for (const range of merged) {
      await this.db.execute(
        `INSERT INTO candle_coverage
          (instrument_id, interval, provider_id, start_time_utc_ms, end_time_utc_ms, fetched_at_utc_ms)
          VALUES ($1, $2, $3, $4, $5, $6)`,
        [...keyParams, range.startMs, range.endMs, batch.fetchedAtUtcMs],
      );
    }
  }

  private assertBatchConsistent(batch: CandleBatch): void {
    for (const candle of batch.candles) {
      if (
        candle.instrumentId !== batch.instrumentId ||
        candle.interval !== batch.interval ||
        candle.source.providerId !== batch.providerId
      ) {
        throw new DomainValidationError(
          `배치 키와 일치하지 않는 캔들이 있다: ${candle.instrumentId}/${candle.interval}/` +
            `${candle.source.providerId} (배치: ${batch.instrumentId}/${batch.interval}/${batch.providerId})`,
        );
      }
    }
  }

  private rowToCandle(row: CandleRow): Candle {
    return {
      instrumentId: row.instrument_id,
      interval: parseInterval(row.interval),
      openTimeUtcMs: row.open_time_utc_ms,
      closeTimeUtcMs: row.close_time_utc_ms,
      tradingDate: row.trading_date,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      adjustedClose: row.adjusted_close ?? undefined,
      volume: row.volume ?? undefined,
      quoteCurrency: row.quote_currency,
      source: {
        providerId: row.provider_id,
        providerSymbol: row.provider_symbol,
        fetchedAtUtcMs: row.fetched_at_utc_ms,
        priceBasis: parsePriceBasis(row.price_basis),
        dataVersion: row.data_version ?? undefined,
      },
    };
  }
}
