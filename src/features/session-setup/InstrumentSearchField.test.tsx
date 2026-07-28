import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { InstrumentSearchResult } from "../../application/use-cases/searchInstruments";
import type { Instrument } from "../../domain/instrument/instrument";
import { InstrumentSearchField } from "./InstrumentSearchField";

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

function ok(instruments: Instrument[]): Promise<InstrumentSearchResult> {
  return Promise.resolve({ instruments, errorsByProviderId: {} });
}

describe("InstrumentSearchField", () => {
  it("현재 선택된 자산의 표시명을 트리거 버튼에 보여준다", () => {
    render(
      <InstrumentSearchField
        label="자산 1"
        selected={BTC}
        excludeIds={new Set()}
        search={() => ok([])}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/자산 1:/)).toHaveTextContent("Bitcoin (BTC/USDT)");
    expect(screen.getByText("BINANCE · USDT")).toBeInTheDocument();
  });

  it("버튼을 누르면 검색 모달이 열리고 빈 질의로 기본 추천을 보여준다", async () => {
    const search = vi.fn(() => ok([AAPL]));
    render(
      <InstrumentSearchField
        label="자산 1"
        selected={BTC}
        excludeIds={new Set()}
        search={search}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/자산 1:/));

    expect(await screen.findByRole("dialog", { name: "자산 1 검색" })).toBeInTheDocument();
    await waitFor(() => expect(search).toHaveBeenCalledWith(""));
    expect(await screen.findByRole("button", { name: /Apple Inc\. \(AAPL\)/ })).toBeInTheDocument();
  });

  it("결과를 클릭하면 onSelect가 호출되고 모달이 닫힌다", async () => {
    const onSelect = vi.fn();
    render(
      <InstrumentSearchField
        label="자산 1"
        selected={BTC}
        excludeIds={new Set()}
        search={() => ok([AAPL])}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByLabelText(/자산 1:/));
    fireEvent.click(await screen.findByRole("button", { name: /Apple Inc\. \(AAPL\)/ }));

    expect(onSelect).toHaveBeenCalledWith(AAPL);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("excludeIds에 있는 자산은 결과에서 제외한다", async () => {
    render(
      <InstrumentSearchField
        label="자산 2"
        selected={AAPL}
        excludeIds={new Set([AAPL.id])}
        search={() => ok([AAPL, BTC])}
        onSelect={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText(/자산 2:/));

    const dialog = await screen.findByRole("dialog", { name: "자산 2 검색" });
    expect(
      await within(dialog).findByRole("button", { name: /Bitcoin \(BTC\/USDT\)/ }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: /Apple Inc\. \(AAPL\)/ }),
    ).not.toBeInTheDocument();
  });

  it("검색 오류는 alert로 보여준다", async () => {
    const search = () =>
      Promise.resolve({
        instruments: [],
        errorsByProviderId: { tiingo: new Error("network fail") },
      });
    render(
      <InstrumentSearchField
        label="자산 1"
        selected={BTC}
        excludeIds={new Set()}
        search={search}
        onSelect={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText(/자산 1:/));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("닫기 버튼으로 모달을 닫으면 선택은 그대로 유지된다", async () => {
    const onSelect = vi.fn();
    render(
      <InstrumentSearchField
        label="자산 1"
        selected={BTC}
        excludeIds={new Set()}
        search={() => ok([AAPL])}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByLabelText(/자산 1:/));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "검색 닫기" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/자산 1:/)).toHaveTextContent("Bitcoin (BTC/USDT)");
  });

  it("모달을 닫으면 트리거 버튼으로 포커스를 복원한다", async () => {
    render(
      <InstrumentSearchField
        label="자산 1"
        selected={BTC}
        excludeIds={new Set()}
        search={() => ok([AAPL])}
        onSelect={vi.fn()}
      />,
    );
    const trigger = screen.getByLabelText(/자산 1:/);
    trigger.focus();
    fireEvent.click(trigger);

    await screen.findByRole("dialog");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "검색 닫기" }));

    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it.each(["Escape", "배경 클릭"] as const)(
    "%s로 모달을 닫아도 트리거 버튼으로 포커스를 복원한다",
    async (closeMethod) => {
      render(
        <InstrumentSearchField
          label="자산 1"
          selected={BTC}
          excludeIds={new Set()}
          search={() => ok([AAPL])}
          onSelect={vi.fn()}
        />,
      );
      const trigger = screen.getByLabelText(/자산 1:/);
      trigger.focus();
      fireEvent.click(trigger);
      const dialog = await screen.findByRole("dialog");

      if (closeMethod === "Escape") {
        fireEvent.keyDown(window, { key: "Escape" });
      } else {
        fireEvent.click(dialog.parentElement as HTMLElement);
      }

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    },
  );
});
