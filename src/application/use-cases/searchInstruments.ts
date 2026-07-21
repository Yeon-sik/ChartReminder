import type { Instrument } from "../../domain/instrument/instrument";
import type { MarketDataProvider } from "../ports/marketDataProvider";

export interface InstrumentSearchResult {
  readonly instruments: readonly Instrument[];
  /** 검색에 실패한 provider의 원본 오류 — UI가 `formatProviderError`로 변환해 보여준다. */
  readonly errorsByProviderId: Readonly<Record<string, unknown>>;
}

/**
 * 등록된 모든 Provider(암호화폐+주식)에 동시에 검색을 요청해 결과를 합친다.
 *
 * 한 Provider가 실패해도(예: BYOK 키 미설정) 다른 Provider의 검색 결과까지 막지 않는다 —
 * `Promise.allSettled`로 부분 실패를 허용하고, 실패한 provider는 `errorsByProviderId`에
 * 원본 오류를 보존한다(오류를 삼키지 않는다, docs/09).
 */
export async function searchInstrumentsAcrossProviders(
  providers: ReadonlyMap<string, MarketDataProvider>,
  query: string,
): Promise<InstrumentSearchResult> {
  const entries = [...providers.entries()];
  const settled = await Promise.allSettled(
    entries.map(([, provider]) => provider.searchInstruments(query)),
  );

  const instruments: Instrument[] = [];
  const errorsByProviderId: Record<string, unknown> = {};

  settled.forEach((result, index) => {
    const [providerId] = entries[index];
    if (result.status === "fulfilled") {
      instruments.push(...result.value);
    } else {
      errorsByProviderId[providerId] = result.reason;
    }
  });

  return { instruments, errorsByProviderId };
}
