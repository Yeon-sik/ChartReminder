import { systemClock, type Clock } from "../../../application/ports/clock";
import type {
  CandleQuery,
  MarketDataProvider,
  ProviderCandleBatch,
} from "../../../application/ports/marketDataProvider";
import {
  MarketDataProviderError,
  ProviderAuthError,
  ProviderNetworkError,
  ProviderRateLimitError,
  ProviderResponseError,
} from "../../../application/ports/providerErrors";
import type { Instrument } from "../../../domain/instrument/instrument";
import { validateCandle, type Candle } from "../../../domain/market-data/candle";
import { DomainDecimal, toDecimalString, type DecimalString } from "../../../domain/shared/decimal";
import { isTradingDate, type TradingDate } from "../../../domain/shared/time";
import type { HttpClient } from "../../http/httpClient";
import { TIINGO_INSTRUMENTS, TIINGO_PROVIDER_ID } from "./tiingoCatalog";

const DAY_MS = 86_400_000;
const DEFAULT_BASE_URL = "https://api.tiingo.com";
/** 계정 할당량 초과 시 관찰된 문구(공식 문서에 명시되지 않음, docs/providers/TIINGO.md 참고). */
const QUOTA_MESSAGE_HINTS = ["limit", "upgrade"];
/**
 * 자동완성 UI가 감당할 수 있는 상한(D-021). 실측 결과 Tiingo `/utilities/search`는
 * 쿼리 폭과 무관하게 쿼리당 최대 10건만 반환한다(서버 측 제한, 이 앱 코드가 아님 — curl로
 * "tech"·"bank"·"a" 등 넓은 질의로 확인). 이 상수는 그보다 크게 잡아도 사실상 무의미하지만,
 * Tiingo가 향후 이 한도를 올리더라도 안전하게 동작하도록 남겨 둔다. 전체 티커 목록(zip
 * 벌크 다운로드)으로 이 한도를 우회하는 방안도 검토했으나, 그 목록엔 회사명이 없어(티커만)
 * 검색 결과 품질이 떨어지는 트레이드오프가 있어 사용자가 현재 방식 유지를 선택했다.
 */
const MAX_SEARCH_RESULTS = 20;

export interface TiingoProviderOptions {
  readonly httpClient: HttpClient;
  /** BYOK — 매 호출 시점의 최신 키를 읽는다. null이면 미설정. (D-015) */
  readonly getApiKey: () => string | null;
  readonly clock?: Clock;
  readonly baseUrl?: string;
  readonly maxAttempts?: number;
  readonly baseDelayMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

interface NormalizedRow {
  readonly tradingDate: TradingDate;
  readonly openTimeUtcMs: number;
  readonly closeTimeUtcMs: number;
  readonly open: DecimalString;
  readonly high: DecimalString;
  readonly low: DecimalString;
  readonly close: DecimalString;
  readonly adjustedClose: DecimalString | undefined;
  readonly volume: DecimalString | undefined;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Tiingo 일봉 Provider adapter. (D-015, docs/03, docs/providers/TIINGO.md)
 *
 * BYOK — 앱은 데이터를 재배포하지 않고, 사용자 자신의 무료 키로만 조회한다. CORS를
 * 지원하지 않아 Tauri HTTP 플러그인 기반 `HttpClient`가 필요하다(`tauriHttpClient`).
 */
export class TiingoProvider implements MarketDataProvider {
  readonly id = TIINGO_PROVIDER_ID;

  private readonly httpClient: HttpClient;
  private readonly getApiKey: () => string | null;
  private readonly clock: Clock;
  private readonly baseUrl: string;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: TiingoProviderOptions) {
    this.httpClient = options.httpClient;
    this.getApiKey = options.getApiKey;
    this.clock = options.clock ?? systemClock;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.baseDelayMs = options.baseDelayMs ?? 500;
    this.sleep = options.sleep ?? defaultSleep;
  }

  /**
   * 빈 질의는 큐레이션된 기본 목록(대형주 5종)을 보여주고, 실제 입력이 있으면 Tiingo
   * 공식 Search API(`/tiingo/utilities/search`, 2026-07-21 curl로 실 키 확인)로 검색한다
   * (D-021 — 비교 종목을 5종으로 한정하지 않고 전체 검색 지원).
   */
  async searchInstruments(query: string): Promise<Instrument[]> {
    const needle = query.trim();
    if (needle === "") {
      return [...TIINGO_INSTRUMENTS];
    }

    const apiKey = this.getApiKey();
    if (apiKey === null || apiKey.trim() === "") {
      throw new ProviderAuthError(
        this.id,
        "Tiingo API 키가 설정되지 않았습니다. 설정에서 무료 키를 입력하세요.",
      );
    }

    const url = `${this.baseUrl}/tiingo/utilities/search?query=${encodeURIComponent(needle)}`;
    const parsed = await this.requestJsonWithRetry(url, apiKey);
    return this.normalizeSearchResults(parsed);
  }

  private normalizeSearchResults(parsed: unknown): Instrument[] {
    if (!Array.isArray(parsed)) {
      throw new ProviderResponseError(this.id, "검색 응답이 배열이 아니다");
    }

    const seenProviderSymbols = new Set<string>();
    const instruments: Instrument[] = [];

    for (const raw of parsed) {
      if (instruments.length >= MAX_SEARCH_RESULTS) {
        break;
      }
      if (typeof raw !== "object" || raw === null) {
        continue;
      }
      const record = raw as Record<string, unknown>;
      // 이 앱은 미국 주식만 다룬다(docs/00) — 다른 국가 상장(중복 티커)·ETF/펀드는 제외한다.
      if (record.countryCode !== "US" || record.assetType !== "Stock") {
        continue;
      }
      const ticker = record.ticker;
      const name = record.name;
      if (typeof ticker !== "string" || ticker.trim() === "" || typeof name !== "string") {
        continue;
      }
      const providerSymbol = ticker.toLowerCase();
      if (seenProviderSymbols.has(providerSymbol)) {
        continue;
      }
      seenProviderSymbols.add(providerSymbol);

      instruments.push({
        id: `stock-${providerSymbol}`,
        symbol: ticker,
        displayName: name,
        assetClass: "stock",
        // 검색 결과에는 거래소 필드가 없어 큐레이션 목록과 달리 일반값을 쓴다(D-021).
        market: "US",
        quoteCurrency: "USD",
        exchangeTimezone: "America/New_York",
        providerId: this.id,
        providerSymbol,
        status: record.isActive === false ? "inactive" : "active",
      });
    }

    return instruments;
  }

  async getCandles(query: CandleQuery): Promise<ProviderCandleBatch> {
    if (query.instrument.providerId !== this.id) {
      throw new MarketDataProviderError(
        "provider",
        this.id,
        `이 Provider의 자산이 아니다: ${query.instrument.id} (providerId: ${query.instrument.providerId})`,
      );
    }

    const apiKey = this.getApiKey();
    if (apiKey === null || apiKey.trim() === "") {
      throw new ProviderAuthError(
        this.id,
        "Tiingo API 키가 설정되지 않았습니다. 설정에서 무료 키를 입력하세요.",
      );
    }

    const fetchedAtUtcMs = this.clock.nowUtcMs();
    // 진행 중인 오늘(UTC)은 아직 닫히지 않았을 수 있으므로 제외한다 (Binance와 동일 정책).
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

    const startDate = new Date(query.range.startMs).toISOString().slice(0, 10);
    // endDate는 포함(inclusive)이므로 반개구간 끝에서 하루를 뺀다.
    const endDate = new Date(effectiveEndMs - DAY_MS).toISOString().slice(0, 10);
    const url =
      `${this.baseUrl}/tiingo/daily/${encodeURIComponent(query.instrument.providerSymbol)}/prices` +
      `?startDate=${startDate}&endDate=${endDate}&format=json`;

    const rows = await this.requestJsonWithRetry(url, apiKey);
    if (!Array.isArray(rows)) {
      throw new ProviderResponseError(this.id, "응답이 배열이 아니다");
    }

    const candles = this.normalizeRows(rows, query, effectiveEndMs, fetchedAtUtcMs);

    return {
      providerId: this.id,
      candles,
      requestedRange: query.range,
      completeRange: { startMs: query.range.startMs, endMs: effectiveEndMs },
      fetchedAtUtcMs,
    };
  }

  private async requestJsonWithRetry(url: string, apiKey: string): Promise<unknown> {
    let lastError: unknown;

    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      if (attempt > 0) {
        await this.sleep(this.baseDelayMs * 2 ** (attempt - 1));
      }
      try {
        return await this.requestJsonOnce(url, apiKey);
      } catch (error) {
        // 인증 오류·할당량 초과·스키마 오류는 재시도로 해결되지 않는다.
        if (error instanceof ProviderAuthError) {
          throw error;
        }
        if (error instanceof ProviderRateLimitError) {
          throw error;
        }
        if (error instanceof ProviderResponseError) {
          throw error;
        }
        if (error instanceof MarketDataProviderError && error.kind === "provider") {
          throw error;
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

  private async requestJsonOnce(url: string, apiKey: string): Promise<unknown> {
    let response;
    try {
      response = await this.httpClient.get(url, { Authorization: `Token ${apiKey}` });
    } catch (error) {
      throw new ProviderNetworkError(this.id, "네트워크 요청 실패", error);
    }

    if (response.status === 403) {
      throw new ProviderAuthError(
        this.id,
        "Tiingo API 키가 유효하지 않습니다. 설정에서 키를 확인하세요.",
      );
    }
    if (response.status >= 500) {
      throw new ProviderNetworkError(this.id, `Tiingo 서버 오류 (HTTP ${response.status})`);
    }
    if (response.status !== 200) {
      throw new MarketDataProviderError(
        "provider",
        this.id,
        `Tiingo 요청 거부 (HTTP ${response.status}): ${response.body.slice(0, 200)}`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.body) as unknown;
    } catch {
      // 관찰된 동작: 할당량 초과 시 200과 평문 텍스트를 반환한다 (JSON이 아님).
      // 공식 문서에 명시되지 않아 문구로 방어적으로만 구분한다 (docs/providers/TIINGO.md).
      const lower = response.body.toLowerCase();
      if (QUOTA_MESSAGE_HINTS.every((hint) => lower.includes(hint))) {
        throw new ProviderRateLimitError(
          this.id,
          `Tiingo 사용량 한도 초과로 추정됨: ${response.body.slice(0, 200)}`,
          undefined,
          true, // 재시도로 해결되지 않는 계정 단위 한도로 취급한다
        );
      }
      throw new ProviderResponseError(this.id, "응답이 유효한 JSON이 아니다", [
        response.body.slice(0, 200),
      ]);
    }
    return parsed;
  }

  private normalizeRows(
    rows: readonly unknown[],
    query: CandleQuery,
    effectiveEndMs: number,
    fetchedAtUtcMs: number,
  ): Candle[] {
    const byOpenTime = new Map<number, NormalizedRow>();

    for (const row of rows) {
      const normalized = this.parseRow(row);
      if (
        normalized.openTimeUtcMs < query.range.startMs ||
        normalized.openTimeUtcMs >= effectiveEndMs
      ) {
        continue;
      }
      byOpenTime.set(normalized.openTimeUtcMs, normalized);
    }

    const candles = [...byOpenTime.values()]
      .sort((a, b) => a.openTimeUtcMs - b.openTimeUtcMs)
      .map((row): Candle => ({
        instrumentId: query.instrument.id,
        interval: query.interval,
        openTimeUtcMs: row.openTimeUtcMs,
        closeTimeUtcMs: row.closeTimeUtcMs,
        tradingDate: row.tradingDate,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        adjustedClose: row.adjustedClose,
        volume: row.volume,
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

  private parseRow(row: unknown): NormalizedRow {
    if (typeof row !== "object" || row === null) {
      throw new ProviderResponseError(this.id, "일봉 행이 객체가 아니다");
    }
    const record = row as Record<string, unknown>;

    const rawDate = record.date;
    if (typeof rawDate !== "string" || rawDate.length < 10) {
      throw new ProviderResponseError(this.id, `date가 유효한 문자열이 아니다: ${String(rawDate)}`);
    }
    const tradingDate = rawDate.slice(0, 10);
    if (!isTradingDate(tradingDate)) {
      throw new ProviderResponseError(this.id, `date가 유효한 거래일이 아니다: "${rawDate}"`);
    }
    const openTimeUtcMs = Date.parse(`${tradingDate}T00:00:00.000Z`);

    const requireDecimal = (field: string, value: unknown): DecimalString => {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new ProviderResponseError(
          this.id,
          `${field}이(가) 유효한 숫자가 아니다: ${JSON.stringify(value)}`,
        );
      }
      return toDecimalString(new DomainDecimal(value));
    };
    const optionalDecimal = (field: string, value: unknown): DecimalString | undefined => {
      if (value === undefined || value === null) {
        return undefined;
      }
      return requireDecimal(field, value);
    };

    return {
      tradingDate,
      openTimeUtcMs,
      closeTimeUtcMs: openTimeUtcMs + DAY_MS - 1,
      open: requireDecimal("open", record.open),
      high: requireDecimal("high", record.high),
      low: requireDecimal("low", record.low),
      close: requireDecimal("close", record.close),
      adjustedClose: optionalDecimal("adjClose", record.adjClose),
      volume: optionalDecimal("volume", record.volume),
    };
  }
}
