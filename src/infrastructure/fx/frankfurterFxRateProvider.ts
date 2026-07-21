import { systemClock, type Clock } from "../../application/ports/clock";
import { FxRateError, type FxRateProvider } from "../../application/ports/fxRateProvider";
import { toDecimalString, DomainDecimal } from "../../domain/shared/decimal";
import type { UsdKrwRate } from "../../domain/shared/fxConversion";
import { isTradingDate } from "../../domain/shared/time";
import type { HttpClient } from "../http/httpClient";

const DEFAULT_BASE_URL = "https://api.frankfurter.dev/v2/rate/USD/KRW";
const DEFAULT_MAX_AGE_MS = 60 * 60 * 1000; // 1시간 — docs/providers/FRANKFURTER.md §호출 정책

export interface FrankfurterFxRateProviderOptions {
  readonly httpClient: HttpClient;
  readonly clock?: Clock;
  readonly baseUrl?: string;
  readonly maxAgeMs?: number;
}

/**
 * Frankfurter(무료, 키 불필요, CORS 열림) 기반 USD/KRW 환율 Provider. (D-020)
 *
 * 표시/입력 통화 변환 전용 — 시뮬레이션 엔진·캔들 캐시와 무관하다(docs/providers/FRANKFURTER.md).
 * CORS가 열려 있어 `fetchHttpClient`로 브라우저 프리뷰·Tauri 모두에서 동작한다(Tiingo·
 * 공공데이터포털과 다른 성격).
 */
export class FrankfurterFxRateProvider implements FxRateProvider {
  private readonly httpClient: HttpClient;
  private readonly clock: Clock;
  private readonly baseUrl: string;
  private readonly maxAgeMs: number;
  private cached: { readonly rate: UsdKrwRate; readonly fetchedAtUtcMs: number } | null = null;

  constructor(options: FrankfurterFxRateProviderOptions) {
    this.httpClient = options.httpClient;
    this.clock = options.clock ?? systemClock;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  }

  async getUsdKrwRate(options?: { readonly forceRefresh?: boolean }): Promise<UsdKrwRate> {
    const now = this.clock.nowUtcMs();
    if (
      options?.forceRefresh !== true &&
      this.cached !== null &&
      now - this.cached.fetchedAtUtcMs < this.maxAgeMs
    ) {
      return this.cached.rate;
    }

    let response;
    try {
      response = await this.httpClient.get(this.baseUrl);
    } catch (error) {
      throw new FxRateError("network", `환율 조회 네트워크 오류: ${String(error)}`);
    }
    if (response.status >= 500) {
      throw new FxRateError("network", `환율 조회 서버 오류 (HTTP ${response.status})`);
    }
    if (response.status !== 200) {
      throw new FxRateError(
        "invalid-response",
        `환율 조회 요청 거부 (HTTP ${response.status}): ${response.body.slice(0, 200)}`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.body) as unknown;
    } catch {
      throw new FxRateError("invalid-response", "환율 응답이 유효한 JSON이 아니다");
    }

    const rate = this.parseRate(parsed);
    this.cached = { rate, fetchedAtUtcMs: now };
    return rate;
  }

  private parseRate(parsed: unknown): UsdKrwRate {
    if (typeof parsed !== "object" || parsed === null) {
      throw new FxRateError("invalid-response", "환율 응답이 객체가 아니다");
    }
    const record = parsed as Record<string, unknown>;

    const rawRate = record.rate;
    if (typeof rawRate !== "number" || !Number.isFinite(rawRate) || rawRate <= 0) {
      throw new FxRateError(
        "invalid-response",
        `환율 응답의 rate가 유효한 양수가 아니다: ${String(rawRate)}`,
      );
    }

    const rawDate = record.date;
    if (typeof rawDate !== "string" || !isTradingDate(rawDate)) {
      throw new FxRateError(
        "invalid-response",
        `환율 응답의 date가 유효하지 않다: ${String(rawDate)}`,
      );
    }

    return {
      krwPerUsd: toDecimalString(new DomainDecimal(rawRate)),
      asOfUtcMs: Date.parse(`${rawDate}T00:00:00.000Z`),
    };
  }
}
