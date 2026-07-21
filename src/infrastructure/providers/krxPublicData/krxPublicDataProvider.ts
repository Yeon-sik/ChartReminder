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
import { KRX_PUBLIC_DATA_INSTRUMENTS, KRX_PUBLIC_DATA_PROVIDER_ID } from "./krxPublicDataCatalog";

const DAY_MS = 86_400_000;
const OPERATION_PATH = "/getStockPriceInfo";
const DEFAULT_BASE_URL =
  "https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService" + OPERATION_PATH;
const ROWS_PER_PAGE = 500;
const MAX_PAGES = 50;
/**
 * 종목명 검색 전용 엔드포인트(다른 서비스, D-021). 가격 조회(GetStockSecuritiesInfoService)와
 * 별개로 공공데이터포털에서 "금융위원회_KRX상장종목정보"를 따로 활용신청해야 한다 — 실 키로
 * 확인한 결과, 가격 서비스만 활용신청된 키로 이 엔드포인트를 호출하면 평문 "Forbidden"(HTTP
 * 403)이 온다(JSON이 아니라 게이트웨이 단계 거부로 보임).
 */
const SEARCH_BASE_URL =
  "https://apis.data.go.kr/1160100/service/GetKrxListedInfoService/getItemInfo";
/** 자동완성 UI가 감당할 수 있는 상한. */
const MAX_SEARCH_RESULTS = 20;
/**
 * 검색용 스냅샷 기준일 — 정확한 "가장 최근 거래일"을 계산하지 않고 7일 전으로 고정해
 * 휴장일·공고 지연을 여유 있게 피한다(종목명·코드는 며칠 사이 거의 바뀌지 않는다, D-021).
 */
const SEARCH_BASDT_LOOKBACK_DAYS = 7;

/**
 * `baseUrl` 오버라이드(.env `OPEN_API_ENDPOINT`, D-018)가 서비스 루트까지만 가리켜도
 * 동작하도록 오퍼레이션 경로를 보정한다 — 실 키로 확인한 결과, 이 경로가 빠지면 이 서비스는
 * 조용히 빈 결과를 주지 않고 정상 요청 자체가 성립하지 않는다(D-019).
 */
function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return trimmed.endsWith(OPERATION_PATH) ? trimmed : `${trimmed}${OPERATION_PATH}`;
}

export interface KrxPublicDataProviderOptions {
  readonly httpClient: HttpClient;
  /** BYOK — 매 호출 시점의 최신 키를 읽는다. null이면 미설정. (D-017) */
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
  readonly volume: DecimalString | undefined;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function toBasDt(date: TradingDate): string {
  return date.split("-").join("");
}

/**
 * 이 API는 Tiingo(Authorization 헤더)와 달리 serviceKey를 쿼리 파라미터로만 받는다 —
 * 오류 메시지에 URL을 포함해야 할 때 키가 로그에 남지 않도록 값을 지운다 (docs/09 §2).
 */
function redactServiceKey(url: string): string {
  return url.replace(/([?&]serviceKey=)[^&]*/, "$1REDACTED");
}

function fromBasDt(value: unknown): TradingDate | null {
  const raw = typeof value === "number" ? String(value) : value;
  if (typeof raw !== "string" || !/^\d{8}$/.test(raw)) {
    return null;
  }
  const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  return isTradingDate(date) ? date : null;
}

/**
 * 공공데이터포털(data.go.kr) "금융위원회_주식시세정보"(GetStockSecuritiesInfoService) 어댑터.
 * (D-017, docs/03 §7, docs/providers/KRX_PUBLIC_DATA.md)
 *
 * BYOK — 이 앱은 데이터를 재배포하지 않고, 각 사용자가 자신의 data.go.kr 개인 계정으로
 * 발급받은 무료 키로만 조회한다. CORS를 지원하지 않아(docs/providers 참고) Tauri HTTP
 * 플러그인 기반 `HttpClient`가 필요하다(`tauriHttpClient`).
 *
 * 이 API는 수정주가를 제공하지 않는다 — 모든 캔들은 `priceBasis: "raw"`이고
 * `adjustedClose`는 항상 undefined다(시뮬레이션 엔진은 이미 raw close로 폴백한다).
 */
export class KrxPublicDataProvider implements MarketDataProvider {
  readonly id = KRX_PUBLIC_DATA_PROVIDER_ID;

  private readonly httpClient: HttpClient;
  private readonly getApiKey: () => string | null;
  private readonly clock: Clock;
  private readonly baseUrl: string;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: KrxPublicDataProviderOptions) {
    this.httpClient = options.httpClient;
    this.getApiKey = options.getApiKey;
    this.clock = options.clock ?? systemClock;
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    this.maxAttempts = options.maxAttempts ?? 3;
    this.baseDelayMs = options.baseDelayMs ?? 500;
    this.sleep = options.sleep ?? defaultSleep;
  }

  /**
   * 빈 질의는 큐레이션된 기본 목록(대형주 5종)을 보여주고, 실제 입력이 있으면
   * "금융위원회_KRX상장종목정보"(`GetKrxListedInfoService`, `likeItmsNm` 종목명 부분검색)로
   * 검색한다(D-021 — 비교 종목을 5종으로 한정하지 않고 전체 검색 지원). 이 서비스는
   * `SEARCH_BASE_URL` 주석에 적은 대로 별도 활용신청이 필요할 수 있다.
   */
  async searchInstruments(query: string): Promise<Instrument[]> {
    const needle = query.trim();
    if (needle === "") {
      return [...KRX_PUBLIC_DATA_INSTRUMENTS];
    }

    const apiKey = this.getApiKey();
    if (apiKey === null || apiKey.trim() === "") {
      throw new ProviderAuthError(
        this.id,
        "공공데이터포털 API 키가 설정되지 않았습니다. 설정에서 무료 키를 입력하세요.",
      );
    }

    const basDt = toBasDt(
      new Date(this.clock.nowUtcMs() - SEARCH_BASDT_LOOKBACK_DAYS * DAY_MS)
        .toISOString()
        .slice(0, 10),
    );
    const url =
      `${SEARCH_BASE_URL}?serviceKey=${encodeURIComponent(apiKey)}` +
      `&resultType=json&numOfRows=${MAX_SEARCH_RESULTS}&pageNo=1` +
      `&basDt=${basDt}&likeItmsNm=${encodeURIComponent(needle)}`;

    const { items } = await this.requestPageWithRetry(url);
    return this.normalizeSearchResults(items);
  }

  private normalizeSearchResults(rows: readonly unknown[]): Instrument[] {
    const seenCodes = new Set<string>();
    const instruments: Instrument[] = [];

    for (const row of rows) {
      if (instruments.length >= MAX_SEARCH_RESULTS) {
        break;
      }
      if (typeof row !== "object" || row === null) {
        continue;
      }
      const record = row as Record<string, unknown>;
      const name = record.itmsNm;
      const rawCode = record.srtnCd;
      if (typeof name !== "string" || typeof rawCode !== "string") {
        continue;
      }
      // 이 API의 srtnCd는 "A"로 시작할 수 있다(가격 API와 다름, 실 키 미확인 — 방어적으로 처리).
      const code = /^A\d{6}$/.test(rawCode) ? rawCode.slice(1) : rawCode;
      if (!/^\d{6}$/.test(code) || seenCodes.has(code)) {
        continue;
      }
      seenCodes.add(code);

      instruments.push({
        id: `stock-${code}`,
        symbol: code,
        displayName: name,
        assetClass: "stock",
        market: "KRX",
        quoteCurrency: "KRW",
        exchangeTimezone: "Asia/Seoul",
        providerId: this.id,
        providerSymbol: code,
        status: "active",
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
        "공공데이터포털 API 키가 설정되지 않았습니다. 설정에서 무료 키를 입력하세요.",
      );
    }

    const fetchedAtUtcMs = this.clock.nowUtcMs();
    // 이 API는 기준일 다음 영업일에야 갱신되므로(T+1) 오늘 자리는 애초에 응답에 없다 —
    // 그래도 캐시 커버리지가 미래를 포함하지 않도록 Binance/Tiingo와 동일한 관례를 유지한다.
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

    const rows = await this.fetchAllPages(query.instrument.providerSymbol, apiKey, {
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

  private async fetchAllPages(
    providerSymbol: string,
    apiKey: string,
    range: { startMs: number; endMs: number },
  ): Promise<unknown[]> {
    const beginBasDt = toBasDt(new Date(range.startMs).toISOString().slice(0, 10));
    // 실 키로 확인(D-019): 이 API의 endBasDt는 배타적(exclusive)이다 — beginBasDt=20260720,
    // endBasDt=20260720(같은 날)이나 endBasDt=20260716(그날 포함 의도)은 그 날짜를 결과에서
    // 제외했고, endBasDt=20260721이어야 20260720이 포함됐다. 문서·커뮤니티 자료가 흔히
    // 서술하는 "포함 범위"와 다르다. 우리 range도 반개구간이라 날짜 변환 없이 그대로 쓴다.
    const endBasDt = toBasDt(new Date(range.endMs).toISOString().slice(0, 10));

    const rows: unknown[] = [];
    let totalCount: number | null = null;

    for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo += 1) {
      const url =
        `${this.baseUrl}?serviceKey=${encodeURIComponent(apiKey)}` +
        `&resultType=json&numOfRows=${ROWS_PER_PAGE}&pageNo=${pageNo}` +
        `&likeSrtnCd=${encodeURIComponent(providerSymbol)}` +
        `&beginBasDt=${beginBasDt}&endBasDt=${endBasDt}`;

      const { items, totalCount: pageTotalCount } = await this.requestPageWithRetry(url);
      totalCount = pageTotalCount;
      rows.push(...items);

      if (items.length === 0 || rows.length >= pageTotalCount) {
        break;
      }
    }

    if (totalCount !== null && rows.length < totalCount) {
      throw new ProviderResponseError(
        this.id,
        `페이지네이션이 전체 데이터를 수집하지 못했다 (수집 ${rows.length} / 전체 ${totalCount})`,
      );
    }
    return rows;
  }

  private async requestPageWithRetry(
    url: string,
  ): Promise<{ items: unknown[]; totalCount: number }> {
    let lastError: unknown;

    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      if (attempt > 0) {
        await this.sleep(this.baseDelayMs * 2 ** (attempt - 1));
      }
      try {
        return await this.requestPageOnce(url);
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
      `재시도 ${this.maxAttempts}회 모두 실패: ${redactServiceKey(url)}`,
      lastError,
    );
  }

  private async requestPageOnce(url: string): Promise<{ items: unknown[]; totalCount: number }> {
    let response;
    try {
      response = await this.httpClient.get(url);
    } catch (error) {
      throw new ProviderNetworkError(this.id, "네트워크 요청 실패", error);
    }

    if (response.status >= 500) {
      throw new ProviderNetworkError(this.id, `공공데이터포털 서버 오류 (HTTP ${response.status})`);
    }
    if (response.status === 403) {
      // 실 키로 확인(D-021): 가격 조회는 되지만 검색(GetKrxListedInfoService)은 활용신청이
      // 안 돼 있으면 JSON이 아니라 평문 "Forbidden"으로 즉시 거부된다 — resultCode를 볼 수
      // 없는 게이트웨이 단계 거부라 여기서 바로 안내 문구로 매핑한다.
      throw new ProviderAuthError(
        this.id,
        "공공데이터포털이 요청을 거부했습니다(403). 서비스 키를 확인하고, data.go.kr에서 이 오픈API " +
          "(예: 금융위원회_KRX상장종목정보)가 활용신청되어 있는지 확인하세요.",
      );
    }
    if (response.status !== 200) {
      throw new MarketDataProviderError(
        "provider",
        this.id,
        `공공데이터포털 요청 거부 (HTTP ${response.status}): ${response.body.slice(0, 200)}`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.body) as unknown;
    } catch {
      throw new ProviderResponseError(this.id, "응답이 유효한 JSON이 아니다", [
        response.body.slice(0, 200),
      ]);
    }

    return this.parseEnvelope(parsed);
  }

  /**
   * data.go.kr 표준 OpenAPI 응답 봉투(response.header/body) 파싱.
   * (docs/providers/KRX_PUBLIC_DATA.md — resultCode 표는 실 키로 재확인 필요한 항목으로 기록)
   */
  private parseEnvelope(parsed: unknown): { items: unknown[]; totalCount: number } {
    const envelope = parsed as { response?: unknown };
    const response = envelope.response as { header?: unknown; body?: unknown } | undefined;
    if (typeof response !== "object" || response === null) {
      throw new ProviderResponseError(this.id, "응답에 response 필드가 없다");
    }
    const header = response.header as { resultCode?: unknown; resultMsg?: unknown } | undefined;
    const resultCode = typeof header?.resultCode === "string" ? header.resultCode : undefined;
    const resultMsg = typeof header?.resultMsg === "string" ? header.resultMsg : "알 수 없는 오류";
    if (resultCode === undefined) {
      throw new ProviderResponseError(this.id, "응답에 header.resultCode가 없다");
    }

    if (resultCode === "03") {
      // NODATA_ERROR — 조회 결과가 없을 뿐 오류가 아니다(상장 이전·전체 휴장 구간 등).
      return { items: [], totalCount: 0 };
    }
    if (resultCode === "22") {
      // LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR — 계정 단위 일일 트래픽 한도.
      throw new ProviderRateLimitError(
        this.id,
        `공공데이터포털 호출 한도를 초과했다(${resultCode}): ${resultMsg}`,
        undefined,
        true,
      );
    }
    if (["20", "21", "30", "31", "32", "33"].includes(resultCode)) {
      throw new ProviderAuthError(
        this.id,
        `공공데이터포털 인증/권한 오류(${resultCode}): ${resultMsg}. 서비스 키를 확인하세요.`,
      );
    }
    if (["04", "05"].includes(resultCode)) {
      throw new ProviderNetworkError(
        this.id,
        `공공데이터포털 일시적 오류(${resultCode}): ${resultMsg}`,
      );
    }
    if (resultCode !== "00") {
      throw new ProviderResponseError(this.id, `공공데이터포털 오류(${resultCode}): ${resultMsg}`);
    }

    const body = response.body as { totalCount?: unknown; items?: unknown } | undefined;
    if (typeof body !== "object" || body === null) {
      throw new ProviderResponseError(this.id, "응답에 body 필드가 없다");
    }
    const totalCount = typeof body.totalCount === "number" ? body.totalCount : 0;

    if (body.items === "" || body.items === undefined || body.items === null) {
      return { items: [], totalCount };
    }
    const itemsField = body.items as { item?: unknown };
    const rawItem = itemsField.item;
    if (rawItem === undefined || rawItem === null) {
      return { items: [], totalCount };
    }
    const items = Array.isArray(rawItem) ? rawItem : [rawItem];
    return { items, totalCount };
  }

  private normalizeRows(
    rows: readonly unknown[],
    query: CandleQuery,
    effectiveEndMs: number,
    fetchedAtUtcMs: number,
  ): Candle[] {
    const byOpenTime = new Map<number, NormalizedRow>();

    for (const row of rows) {
      const normalized = this.parseRow(row, query.instrument.providerSymbol);
      if (normalized === null) {
        continue; // likeSrtnCd 부분일치로 섞여 들어올 수 있는 다른 종목 코드는 버린다.
      }
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

  private parseRow(row: unknown, expectedProviderSymbol: string): NormalizedRow | null {
    if (typeof row !== "object" || row === null) {
      throw new ProviderResponseError(this.id, "일봉 행이 객체가 아니다");
    }
    const record = row as Record<string, unknown>;

    const srtnCd = record.srtnCd;
    if (typeof srtnCd === "string" && srtnCd !== expectedProviderSymbol) {
      return null;
    }

    const tradingDate = fromBasDt(record.basDt);
    if (tradingDate === null) {
      throw new ProviderResponseError(
        this.id,
        `basDt가 유효한 거래일(YYYYMMDD)이 아니다: ${JSON.stringify(record.basDt)}`,
      );
    }
    const openTimeUtcMs = Date.parse(`${tradingDate}T00:00:00.000Z`);

    const requireDecimal = (field: string, value: unknown): DecimalString => {
      const numeric =
        typeof value === "number"
          ? value
          : typeof value === "string" && value.trim() !== ""
            ? Number(value)
            : NaN;
      if (!Number.isFinite(numeric)) {
        throw new ProviderResponseError(
          this.id,
          `${field}이(가) 유효한 숫자가 아니다: ${JSON.stringify(value)}`,
        );
      }
      return toDecimalString(new DomainDecimal(numeric));
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
      open: requireDecimal("mkp", record.mkp),
      high: requireDecimal("hipr", record.hipr),
      low: requireDecimal("lopr", record.lopr),
      close: requireDecimal("clpr", record.clpr),
      volume: optionalDecimal("trqu", record.trqu),
    };
  }
}
