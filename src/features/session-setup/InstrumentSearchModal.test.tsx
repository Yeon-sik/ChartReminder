import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { InstrumentSearchResult } from "../../application/use-cases/searchInstruments";
import type { Instrument } from "../../domain/instrument/instrument";
import { InstrumentSearchModal } from "./InstrumentSearchModal";

const BTC: Instrument = {
  id: "crypto-btc-usdt",
  symbol: "BTC/USDT",
  displayName: "Bitcoin",
  assetClass: "crypto",
  market: "BINANCE",
  quoteCurrency: "USDT",
  exchangeTimezone: "UTC",
  providerId: "binance",
  providerSymbol: "BTCUSDT",
  status: "active",
};

const AAPL: Instrument = {
  id: "stock-aapl",
  symbol: "AAPL",
  displayName: "Apple Inc.",
  assetClass: "stock",
  market: "US",
  quoteCurrency: "USD",
  exchangeTimezone: "America/New_York",
  providerId: "tiingo",
  providerSymbol: "aapl",
  status: "active",
};

const SAMSUNG: Instrument = {
  id: "krx-samsung",
  symbol: "005930",
  displayName: "삼성전자",
  assetClass: "stock",
  market: "KRX",
  quoteCurrency: "KRW",
  exchangeTimezone: "Asia/Seoul",
  providerId: "krx-public-data",
  providerSymbol: "005930",
  status: "active",
};

function ok(instruments: Instrument[]): Promise<InstrumentSearchResult> {
  return Promise.resolve({ instruments, errorsByProviderId: {} });
}

function renderModal(overrides: Partial<Parameters<typeof InstrumentSearchModal>[0]> = {}) {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  render(
    <InstrumentSearchModal
      title="자산 1 검색"
      excludeIds={new Set()}
      search={() => ok([BTC, AAPL, SAMSUNG])}
      onSelect={onSelect}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onSelect, onClose };
}

describe("InstrumentSearchModal", () => {
  it("열리면 빈 질의로 검색해 결과를 보여준다", async () => {
    const search = vi.fn(() => ok([BTC]));
    renderModal({ search });

    await waitFor(() => expect(search).toHaveBeenCalledWith(""));
    expect(
      await screen.findByRole("button", { name: /Bitcoin \(BTC\/USDT\)/ }),
    ).toBeInTheDocument();
  });

  it("시장 필터를 누르면 해당 provider 자산만 남긴다", async () => {
    renderModal();

    await screen.findByRole("button", { name: /Bitcoin \(BTC\/USDT\)/ });
    fireEvent.click(screen.getByRole("button", { name: "미국 주식" }));

    expect(screen.getByRole("button", { name: /Apple Inc\. \(AAPL\)/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Bitcoin \(BTC\/USDT\)/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /삼성전자/ })).not.toBeInTheDocument();
  });

  it("결과를 클릭하면 onSelect가 호출된다", async () => {
    const { onSelect } = renderModal();

    fireEvent.click(await screen.findByRole("button", { name: /Apple Inc\. \(AAPL\)/ }));

    expect(onSelect).toHaveBeenCalledWith(AAPL);
  });

  it("Escape 키를 누르면 onClose가 호출된다", () => {
    const { onClose } = renderModal();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Tab 포커스를 모달 안에서 순환시킨다", async () => {
    renderModal();
    const closeButton = screen.getByRole("button", { name: "검색 닫기" });
    const lastResult = await screen.findByRole("button", { name: /삼성전자/ });

    closeButton.focus();
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(lastResult).toHaveFocus();

    fireEvent.keyDown(window, { key: "Tab" });
    expect(closeButton).toHaveFocus();
  });

  it("열린 동안 배경 스크롤을 막고 닫힐 때 이전 값을 복원한다", () => {
    document.body.style.overflow = "auto";
    const { unmount } = render(
      <InstrumentSearchModal
        title="자산 1 검색"
        excludeIds={new Set()}
        search={() => ok([])}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("auto");
    document.body.style.overflow = "";
  });

  it("배경(오버레이)을 클릭하면 onClose가 호출되지만, 패널 내부 클릭은 닫지 않는다", async () => {
    const { onClose } = renderModal();
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("dialog").parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("닫기 버튼을 누르면 onClose가 호출된다", () => {
    const { onClose } = renderModal();

    fireEvent.click(screen.getByRole("button", { name: "검색 닫기" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("검색 오류는 alert로 보여준다", async () => {
    const search = () =>
      Promise.resolve({
        instruments: [],
        errorsByProviderId: { tiingo: new Error("network fail") },
      });
    renderModal({ search });

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("결과가 없으면 안내 문구를 보여준다", async () => {
    renderModal({ search: () => ok([]) });

    expect(await screen.findByText("검색 결과가 없습니다.")).toBeInTheDocument();
  });
});
