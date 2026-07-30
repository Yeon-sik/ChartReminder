import { systemClock, type Clock } from "../../../application/ports/clock";
import type {
  CandleQuery,
  MarketDataProvider,
  ProviderCandleBatch,
} from "../../../application/ports/marketDataProvider";
import {
  MarketDataProviderError,
  ProviderNetworkError,
  ProviderRateLimitError,
  ProviderResponseError,
} from "../../../application/ports/providerErrors";
import type { Instrument } from "../../../domain/instrument/instrument";
import { validateCandle, type Candle } from "../../../domain/market-data/candle";
import type { UtcTimeRange } from "../../../domain/market-data/timeRange";
import { isDecimalString } from "../../../domain/shared/decimal";
import { utcTradingDateFromUtcMs } from "../../../domain/shared/time";
import type { HttpClient } from "../../http/httpClient";
import {
  BINANCE_INSTRUMENTS,
  BINANCE_PROVIDER_ID,
  createBinanceInstrument,
} from "./binanceCatalog";

const DAY_MS = 86_400_000;
/** 공개 시장 데이터 전용 엔드포인트. (docs/providers/BINANCE.md) */
const DEFAULT_BASE_URL = "https://data-api.binance.vision";
const MAX_KLINES_PER_REQUEST = 1000;
const INSTRUMENT_CATALOG_TTL_MS = 15 * 60 * 1000;
const EXCHANGE_INFO_QUERY =
  "/api/v3/exchangeInfo?permissions=SPOT&symbolStatus=TRADING&showPermissionSets=false";

export interface BinanceProviderOptions {
  readonly httpClient: HttpClient;
  readonly clock?: Clock;
  readonly baseUrl?: string;
  /** 시도 횟수 상한 (첫 시도 포함) */
  readonly maxAttempts?: number;
  /** 지수 백오프 기본 대기(ms). attempt n 재시도 전 baseDelayMs * 2^n 대기 */
  readonly baseDelayMs?: number;
  /** 대기 함수. 테스트에서 가짜 시계로 대체한다. */
  readonly sleep?: (ms: number) => Promise<void>;
}

interface NormalizedKline {
  readonly openTimeUtcMs: number;
  readonly closeTimeUtcMs: number;
  readonly open: string;
  readonly high: string;
  readonly low: string;
  readonly close: string;
  readonly volume: string;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Binance 일봉 Provider adapter. (D-010, docs/03)
 *
 * 응답을 런타임 검증하고 공통 Candle로 정규화한다. 페이지네이션을 내부에서 결합하고,
 * 재시도는 지수 백오프, 429는 Retry-After 준수, 418(IP ban)은 즉시 중단한다.
 */
export class BinanceProvider implements MarketDataProvider {
  readonly id = BINANCE_PROVIDER_ID;

  private readonly httpClient: HttpClient;
  private readonly clock: Clock;
  private readonly baseUrl: string;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private instrumentCatalog: readonly Instrument[] | null = null;
  private instrumentCatalogLoadedAtUtcMs = 0;
  private instrumentCatalogRequest: Promise<readonly Instrument[]> | null = null;

  constructor(options: BinanceProviderOptions) {
    this.httpClient = options.httpClient;
    this.clock = options.clock ?? systemClock;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.baseDelayMs = options.baseDelayMs ?? 500;
    this.sleep = options.sleep ?? defaultSleep;
  }

  async searchInstruments(query: string): Promise<Instrument[]> {
    const catalog = await this.getInstrumentCatalog();
    const needle = query.trim().toLowerCase();
    const matches =
      needle === ""
        ? catalog
        : catalog.filter(
            (instrument) =>
              instrument.symbol.toLowerCase().includes(needle) ||
              instrument.displayName.toLowerCase().includes(needle) ||
              instrument.providerSymbol.toLowerCase().includes(needle),
          );
    return [...matches];
  }

  async getCandles(query: CandleQuery): Promise<ProviderCandleBatch> {
    if (query.instrument.providerId !== this.id) {
      throw new MarketDataProviderError(
        "provider",
        this.id,
        `이 Provider의 자산이 아니다: ${query.instrument.id} (providerId: ${query.instrument.providerId})`,
      );
    }

    const fetchedAtUtcMs = this.clock.nowUtcMs();
    // 진행 중인 오늘 캔들은 미완성이므로 제외하고, 커버리지도 닫힌 날까지만 주장한다.
    const currentUtcDayStartMs = Math.floor(fetchedAtUtcMs / DAY_MS) * DAY_MS;
    const effectiveEndMs = Math.min(query.range.endMs, currentUtcDayStartMs);

    if (effectiveEndMs <= query.range.startMs) {
      return {
        providerId: this.id,
        candles: [],
        requestedRange: query.range,
        completeRange: null,
        fetchedAtUtcMs,
      };
    }

    const rows = await this.fetchAllPages(query.instrument.providerSymbol, {
      startMs: query.range.startMs,
      endMs: effectiveEndMs,
    });
    const candles = this.normalizeRows(rows, query, effectiveEndMs, fetchedAtUtcMs);

    return {
      providerId: this.id,
      candles,
      requestedRange: query.range,
      completeRange: { startMs: query.range.startMs, endMs: effectiveEndMs },
      fetchedAtUtcMs,
    };
  }

  private async fetchAllPages(providerSymbol: string, range: UtcTimeRange): Promise<unknown[]> {
    const rows: unknown[] = [];
    let cursorMs = range.startMs;

    while (cursorMs < range.endMs) {
      const url =
        `${this.baseUrl}/api/v3/klines?symbol=${encodeURIComponent(providerSymbol)}` +
        `&interval=1d&startTime=${cursorMs}&endTime=${range.endMs - 1}&limit=${MAX_KLINES_PER_REQUEST}`;
      const page = await this.requestJsonWithRetry(url);

      if (!Array.isArray(page)) {
        throw new ProviderResponseError(this.id, "klines 응답이 배열이 아니다");
      }
      if (page.length === 0) {
        break;
      }
      rows.push(...page);

      const lastRow: unknown = page[page.length - 1];
      const lastOpenTime: unknown = Array.isArray(lastRow) ? lastRow[0] : undefined;
      if (typeof lastOpenTime !== "number" || !Number.isSafeInteger(lastOpenTime)) {
        throw new ProviderResponseError(this.id, "klines 행의 openTime이 정수가 아니다");
      }
      if (lastOpenTime < cursorMs) {
        throw new ProviderResponseError(this.id, "페이지네이션이 전진하지 않는다 (openTime 역행)");
      }
      cursorMs = lastOpenTime + 1;
      if (page.length < MAX_KLINES_PER_REQUEST) {
        break;
      }
    }
    return rows;
  }

  private getInstrumentCatalog(): Promise<readonly Instrument[]> {
    const nowUtcMs = this.clock.nowUtcMs();
    if (
      this.instrumentCatalog !== null &&
      nowUtcMs - this.instrumentCatalogLoadedAtUtcMs < INSTRUMENT_CATALOG_TTL_MS
    ) {
      return Promise.resolve(this.instrumentCatalog);
    }
    if (this.instrumentCatalogRequest !== null) {
      return this.instrumentCatalogRequest;
    }

    const request = this.fetchInstrumentCatalog()
      .then((catalog) => {
        this.instrumentCatalog = catalog;
        this.instrumentCatalogLoadedAtUtcMs = this.clock.nowUtcMs();
        return catalog;
      })
      .finally(() => {
        if (this.instrumentCatalogRequest === request) {
          this.instrumentCatalogRequest = null;
        }
      });
    this.instrumentCatalogRequest = request;
    return request;
  }

  private async fetchInstrumentCatalog(): Promise<readonly Instrument[]> {
    const payload = await this.requestJsonWithRetry(`${this.baseUrl}${EXCHANGE_INFO_QUERY}`);
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("symbols" in payload) ||
      !Array.isArray(payload.symbols)
    ) {
      throw new ProviderResponseError(this.id, "exchangeInfo 응답에 symbols 배열이 없다.");
    }

    const instruments: Instrument[] = [];
    const issues: string[] = [];
    const seenProviderSymbols = new Set<string>();

    payload.symbols.forEach((row: unknown, index: number) => {
      if (typeof row !== "object" || row === null) {
        issues.push(`symbols[${index}]가 객체가 아니다.`);
        return;
      }

      const symbol = "symbol" in row ? row.symbol : undefined;
      const status = "status" in row ? row.status : undefined;
      const baseAsset = "baseAsset" in row ? row.baseAsset : undefined;
      const quoteAsset = "quoteAsset" in row ? row.quoteAsset : undefined;
      const isSpotTradingAllowed =
        "isSpotTradingAllowed" in row ? row.isSpotTradingAllowed : undefined;

      if (
        typeof symbol !== "string" ||
        symbol.length === 0 ||
        typeof status !== "string" ||
        typeof baseAsset !== "string" ||
        baseAsset.length === 0 ||
        typeof quoteAsset !== "string" ||
        quoteAsset.length === 0
      ) {
        issues.push(`symbols[${index}]의 필수 문자열 필드가 유효하지 않다.`);
        return;
      }

      // 표시/입력 환율 경계가 현재 USD·USDT·KRW만 지원하므로 USDT 현물만 노출한다.
      if (status !== "TRADING" || quoteAsset !== "USDT" || isSpotTradingAllowed === false) {
        return;
      }
      if (seenProviderSymbols.has(symbol)) {
        return;
      }
      seenProviderSymbols.add(symbol);
      instruments.push(createBinanceInstrument(baseAsset, quoteAsset, symbol));
    });

    if (issues.length > 0) {
      throw new ProviderResponseError(this.id, "exchangeInfo 종목 스키마가 유효하지 않다.", issues);
    }
    if (instruments.length === 0) {
      throw new ProviderResponseError(
        this.id,
        "exchangeInfo에서 활성 USDT 현물 종목을 찾지 못했다.",
      );
    }

    const quickDefaultOrder = new Map(
      BINANCE_INSTRUMENTS.map((instrument, index) => [instrument.providerSymbol, index]),
    );
    return instruments.sort((left, right) => {
      const leftOrder = quickDefaultOrder.get(left.providerSymbol);
      const rightOrder = quickDefaultOrder.get(right.providerSymbol);
      if (leftOrder !== undefined || rightOrder !== undefined) {
        return (leftOrder ?? Number.MAX_SAFE_INTEGER) - (rightOrder ?? Number.MAX_SAFE_INTEGER);
      }
      return left.symbol < right.symbol ? -1 : left.symbol > right.symbol ? 1 : 0;
    });
  }

  private async requestJsonWithRetry(url: string): Promise<unknown> {
    let lastError: unknown;

    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      if (attempt > 0) {
        const backoffMs =
          lastError instanceof ProviderRateLimitError && lastError.retryAfterMs !== undefined
            ? lastError.retryAfterMs
            : this.baseDelayMs * 2 ** (attempt - 1);
        await this.sleep(backoffMs);
      }

      try {
        return await this.requestJsonOnce(url);
      } catch (error) {
        if (error instanceof ProviderRateLimitError && error.banned) {
          throw error; // 418: 재시도 금지
        }
        if (error instanceof ProviderResponseError) {
          throw error; // 스키마 오류는 재시도로 해결되지 않는다
        }
        if (error instanceof MarketDataProviderError && error.kind === "provider") {
          throw error; // 4xx 사용자/요청 오류
        }
        lastError = error;
      }
    }

    if (lastError instanceof MarketDataProviderError) {
      throw lastError;
    }
    throw new ProviderNetworkError(
      this.id,
      `재시도 ${this.maxAttempts}회 모두 실패: ${url}`,
      lastError,
    );
  }

  private async requestJsonOnce(url: string): Promise<unknown> {
    let response;
    try {
      response = await this.httpClient.get(url);
    } catch (error) {
      throw new ProviderNetworkError(this.id, "네트워크 요청 실패", error);
    }

    if (response.status === 429 || response.status === 418) {
      const retryAfterSeconds = Number(response.header("Retry-After") ?? "");
      const retryAfterMs = Number.isFinite(retryAfterSeconds)
        ? retryAfterSeconds * 1000
        : undefined;
      throw new ProviderRateLimitError(
        this.id,
        response.status === 418
          ? "Binance IP ban(418). 대기 후 수동으로 다시 시도해야 한다"
          : "Binance rate limit(429) 초과",
        retryAfterMs,
        response.status === 418,
      );
    }
    if (response.status >= 500) {
      throw new ProviderNetworkError(this.id, `Binance 서버 오류 (HTTP ${response.status})`);
    }
    if (response.status !== 200) {
      throw new MarketDataProviderError(
        "provider",
        this.id,
        `Binance 요청 거부 (HTTP ${response.status}): ${response.body.slice(0, 200)}`,
      );
    }

    try {
      return JSON.parse(response.body) as unknown;
    } catch (error) {
      throw new ProviderResponseError(this.id, "응답이 유효한 JSON이 아니다", [String(error)]);
    }
  }

  private normalizeRows(
    rows: readonly unknown[],
    query: CandleQuery,
    effectiveEndMs: number,
    fetchedAtUtcMs: number,
  ): Candle[] {
    const byOpenTime = new Map<number, NormalizedKline>();

    for (const row of rows) {
      const kline = this.parseKlineRow(row);
      // 요청 범위 밖 데이터 절단 (계약: 공급자가 초과 반환해도 결과는 범위 안)
      if (kline.openTimeUtcMs < query.range.startMs || kline.openTimeUtcMs >= effectiveEndMs) {
        continue;
      }
      byOpenTime.set(kline.openTimeUtcMs, kline); // 중복 제거 (마지막 관측 우선)
    }

    const candles = [...byOpenTime.values()]
      .sort((a, b) => a.openTimeUtcMs - b.openTimeUtcMs)
      .map((kline): Candle => ({
        instrumentId: query.instrument.id,
        interval: query.interval,
        openTimeUtcMs: kline.openTimeUtcMs,
        closeTimeUtcMs: kline.closeTimeUtcMs,
        tradingDate: utcTradingDateFromUtcMs(kline.openTimeUtcMs),
        open: kline.open,
        high: kline.high,
        low: kline.low,
        close: kline.close,
        volume: kline.volume,
        quoteCurrency: query.instrument.quoteCurrency,
        source: {
          providerId: this.id,
          providerSymbol: query.instrument.providerSymbol,
          fetchedAtUtcMs,
          priceBasis: "raw",
        },
      }));

    for (const candle of candles) {
      const issues = validateCandle(candle);
      if (issues.length > 0) {
        throw new ProviderResponseError(
          this.id,
          `정규화된 캔들이 불변조건을 위반한다 (${candle.tradingDate})`,
          issues.map((issue) => `${issue.code}: ${issue.message}`),
        );
      }
    }
    return candles;
  }

  private parseKlineRow(row: unknown): NormalizedKline {
    if (!Array.isArray(row) || row.length < 7) {
      throw new ProviderResponseError(this.id, "klines 행 형식이 아니다 (12원소 배열 기대)");
    }
    const requireTimestamp = (field: string, value: unknown): number => {
      if (typeof value !== "number" || !Number.isSafeInteger(value)) {
        throw new ProviderResponseError(
          this.id,
          `${field}이(가) 정수 밀리초가 아니다: ${JSON.stringify(value)}`,
        );
      }
      return value;
    };
    const requireDecimalString = (field: string, value: unknown): string => {
      if (typeof value !== "string" || !isDecimalString(value)) {
        throw new ProviderResponseError(
          this.id,
          `${field}이(가) 유효한 10진 문자열이 아니다: ${JSON.stringify(value)}`,
        );
      }
      return value;
    };
    return {
      openTimeUtcMs: requireTimestamp("openTime", row[0]),
      closeTimeUtcMs: requireTimestamp("closeTime", row[6]),
      open: requireDecimalString("open", row[1]),
      high: requireDecimalString("high", row[2]),
      low: requireDecimalString("low", row[3]),
      close: requireDecimalString("close", row[4]),
      volume: requireDecimalString("volume", row[5]),
    };
  }
}
