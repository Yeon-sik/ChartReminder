import { describe, expect, it } from "vitest";

import { DomainValidationError } from "../../domain/shared/errors";
import {
  MarketDataProviderError,
  ProviderAuthError,
  ProviderNetworkError,
  ProviderRateLimitError,
  ProviderResponseError,
} from "../../application/ports/providerErrors";
import type { AssetDataNotice } from "../../application/use-cases/prepareReplaySession";
import {
  formatDataNotice,
  formatMoney,
  formatPercent,
  formatPriceStatus,
  formatProviderError,
} from "./format";

describe("formatMoney", () => {
  it("소수 2자리로 반올림하고 통화를 붙인다", () => {
    expect(formatMoney({ amount: "1000", currency: "USD" })).toBe("1000.00 USD");
    expect(formatMoney({ amount: "1000.005", currency: "USD" })).toBe("1000.01 USD");
  });

  it("음수 금액(손실)도 표시한다", () => {
    expect(formatMoney({ amount: "-40", currency: "USD" })).toBe("-40.00 USD");
  });
});

describe("formatPercent", () => {
  it("소수를 퍼센트로 변환한다", () => {
    expect(formatPercent("0.2")).toBe("20.00%");
    expect(formatPercent("-0.04")).toBe("-4.00%");
  });

  it("무한소수는 2자리에서 반올림한다", () => {
    expect(formatPercent("0.1818181818")).toBe("18.18%");
  });
});

describe("formatPriceStatus", () => {
  it("fresh와 carried-forward를 구분한다", () => {
    expect(formatPriceStatus("fresh")).toContain("실시간");
    expect(formatPriceStatus("carried-forward")).toContain("이월");
  });
});

describe("formatDataNotice", () => {
  const none: AssetDataNotice = {
    hasNoData: false,
    hasPreListingGap: false,
    hasInteriorGap: false,
  };

  it("경고가 없으면 null이다", () => {
    expect(formatDataNotice(none)).toBeNull();
  });

  it("데이터 완전 없음을 최우선으로 보고한다", () => {
    const notice: AssetDataNotice = {
      hasNoData: true,
      hasPreListingGap: true,
      hasInteriorGap: true,
    };
    expect(formatDataNotice(notice)).toContain("데이터가 없습니다");
  });

  it("상장 이전 구간을 보고한다", () => {
    const notice: AssetDataNotice = {
      hasNoData: false,
      hasPreListingGap: true,
      hasInteriorGap: false,
    };
    expect(formatDataNotice(notice)).toContain("상장 이전");
  });

  it("중간 누락을 보고한다", () => {
    const notice: AssetDataNotice = {
      hasNoData: false,
      hasPreListingGap: false,
      hasInteriorGap: true,
    };
    expect(formatDataNotice(notice)).toContain("이월");
  });
});

describe("formatProviderError — docs/06 §6 서로 다른 문구", () => {
  it("네트워크 오류와 rate limit은 다른 문구다", () => {
    const network = formatProviderError(new ProviderNetworkError("binance", "실패"));
    const rateLimit = formatProviderError(new ProviderRateLimitError("binance", "실패"));
    expect(network).not.toBe(rateLimit);
    expect(network).toContain("인터넷");
    expect(rateLimit).toContain("rate limit");
  });

  it("418(IP ban)과 429는 다른 문구다", () => {
    const banned = formatProviderError(
      new ProviderRateLimitError("binance", "실패", undefined, true),
    );
    const limited = formatProviderError(
      new ProviderRateLimitError("binance", "실패", undefined, false),
    );
    expect(banned).not.toBe(limited);
  });

  it("응답 형식 오류는 기술 세부정보를 노출하지 않는다", () => {
    const message = formatProviderError(
      new ProviderResponseError("binance", "unexpected token at line 42", ["stack: at foo.ts:12"]),
    );
    expect(message).not.toContain("stack");
    expect(message).not.toContain("line 42");
  });

  it("BYOK 인증 오류는 라이선스/인증 설정 안내 문구다 (docs/06 §6, D-015)", () => {
    const message = formatProviderError(
      new ProviderAuthError("tiingo", "Tiingo API 키가 설정되지 않았습니다."),
    );
    expect(message).toContain("라이선스 또는 인증 설정");
  });

  it("일반 provider 거부 오류를 처리한다", () => {
    expect(
      formatProviderError(new MarketDataProviderError("provider", "binance", "400")),
    ).toContain("거부");
  });

  it("DomainValidationError는 메시지를 그대로 사용자에게 보여준다", () => {
    expect(
      formatProviderError(new DomainValidationError("자산은 최대 2개까지 비교할 수 있다")),
    ).toBe("자산은 최대 2개까지 비교할 수 있다");
  });

  it("알 수 없는 오류는 일반 문구로 대체하고 스택을 노출하지 않는다", () => {
    const message = formatProviderError(
      new Error("TypeError: Cannot read property of undefined at x.ts:99"),
    );
    expect(message).not.toContain("x.ts");
    expect(message).toBe("예상치 못한 오류가 발생했습니다. 다시 시도해 주세요.");
  });
});
