import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BINANCE_INSTRUMENTS } from "../../infrastructure/providers/binance/binanceCatalog";
import { SessionSetupForm } from "./SessionSetupForm";

const [BTC, ETH] = BINANCE_INSTRUMENTS;

function renderForm(onSubmit = vi.fn()) {
  render(
    <SessionSetupForm
      availableInstruments={BINANCE_INSTRUMENTS}
      defaultInstrument={BTC}
      displayCurrency="USD"
      usdKrwRate={null}
      onSubmit={onSubmit}
    />,
  );
  return onSubmit;
}

describe("SessionSetupForm", () => {
  it("기본값으로 제출하면 BTC 일시투자 요청을 만든다", () => {
    const onSubmit = renderForm();

    fireEvent.click(screen.getByRole("button", { name: "시뮬레이션 준비" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const [request, instrumentsById] = onSubmit.mock.calls[0];
    expect(request.selections).toHaveLength(1);
    expect(request.selections[0].instrument.id).toBe(BTC.id);
    expect(request.selections[0].simulationConfig.mode).toBe("lump-sum");
    expect(instrumentsById[BTC.id]).toBe(BTC);
  });

  it("자산을 추가하면 2번째 자산 선택이 나타나고, 2개가 되면 추가 버튼이 사라진다", () => {
    renderForm();

    expect(screen.queryByLabelText("자산 2")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /비교 자산 추가/ }));

    expect(screen.getByLabelText("자산 2")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /비교 자산 추가/ })).not.toBeInTheDocument();
  });

  it("자산 제거 버튼으로 1개까지 줄일 수 있다", () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: /비교 자산 추가/ }));
    expect(screen.getByLabelText("자산 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "자산 2 제거" }));
    expect(screen.queryByLabelText("자산 2")).not.toBeInTheDocument();
  });

  it("정기 정액매수를 선택하면 원금 입력 대신 납입액·주기 입력이 나타난다", () => {
    renderForm();

    expect(screen.getByLabelText(/원금/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("정기 정액매수"));

    expect(screen.queryByLabelText(/원금/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/납입액/)).toBeInTheDocument();
    expect(screen.getByLabelText("주기")).toBeInTheDocument();
  });

  it("시작일이 종료일보다 늦으면 오류를 보여주고 onSubmit을 호출하지 않는다", () => {
    const onSubmit = renderForm();

    fireEvent.change(screen.getByLabelText("시작일"), { target: { value: "2024-12-01" } });
    fireEvent.change(screen.getByLabelText("종료일"), { target: { value: "2024-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "시뮬레이션 준비" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("시작일은 종료일보다 앞서야 한다");
  });

  it("투자 설정은 하나뿐이고, 자산 2개를 선택해도 동일한 모드로 함께 제출된다 (D-020 완전 통합)", () => {
    const onSubmit = renderForm();

    fireEvent.click(screen.getByRole("button", { name: /비교 자산 추가/ }));
    // 통합 투자 설정 fieldset에는 라디오가 하나씩만 있어야 한다(자산별로 반복되지 않음).
    expect(screen.getAllByLabelText("정기 정액매수")).toHaveLength(1);
    fireEvent.click(screen.getByLabelText("정기 정액매수"));

    fireEvent.click(screen.getByRole("button", { name: "시뮬레이션 준비" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const [request] = onSubmit.mock.calls[0];
    expect(request.selections).toHaveLength(2);
    expect(request.selections[0].simulationConfig.mode).toBe("dca");
    expect(request.selections[1].simulationConfig.mode).toBe("dca");
    expect(request.selections[1].instrument.id).toBe(ETH.id);
  });

  it("원금 입력 라벨에 표시 통화가 반영된다", () => {
    renderForm();
    expect(screen.getByLabelText("원금 (USD)")).toBeInTheDocument();
  });
});
