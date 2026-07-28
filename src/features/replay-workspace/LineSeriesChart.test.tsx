import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LineSeriesChart, type ChartLine } from "./LineSeriesChart";

const addSeriesMock = vi.fn();
const removeSeriesMock = vi.fn();
const setDataMock = vi.fn();
const chartRemoveMock = vi.fn();
const applyOptionsMock = vi.fn();

vi.mock("lightweight-charts", () => ({
  LineSeries: "LineSeriesDefinition",
  LineStyle: { Solid: 0, Dashed: 2 },
  createChart: vi.fn(() => ({
    addSeries: addSeriesMock.mockImplementation(() => ({ setData: setDataMock })),
    removeSeries: removeSeriesMock,
    remove: chartRemoveMock,
    applyOptions: applyOptionsMock,
  })),
}));

function line(overrides: Partial<ChartLine> = {}): ChartLine {
  return {
    id: "asset-1",
    label: "Asset One",
    color: "#111111",
    points: [
      { time: "2024-01-01", value: 100 },
      { time: "2024-01-02", value: 110 },
    ],
    ...overrides,
  };
}

describe("LineSeriesChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("각 라인마다 시리즈를 만들고 setData를 정확히 전달한다 (미래 데이터 누출 없음)", () => {
    const points = [
      { time: "2024-01-01", value: 100 },
      { time: "2024-01-02", value: 110 },
      { time: "2024-01-03", value: 90 },
    ];
    render(<LineSeriesChart lines={[line({ points })]} ariaLabel="테스트 차트" />);

    expect(addSeriesMock).toHaveBeenCalledTimes(1);
    expect(setDataMock).toHaveBeenCalledWith([
      { time: "2024-01-01", value: 100 },
      { time: "2024-01-02", value: 110 },
      { time: "2024-01-03", value: 90 },
    ]);
  });

  it("solid/dashed 스타일을 색상과 별개로 전달한다 (색상만으로 구분하지 않음, docs/06 §7)", () => {
    render(
      <LineSeriesChart
        lines={[
          line({ id: "a", color: "#111", lineStyle: "solid" }),
          line({ id: "b", color: "#222", lineStyle: "dashed" }),
        ]}
        ariaLabel="테스트 차트"
      />,
    );

    expect(addSeriesMock).toHaveBeenNthCalledWith(
      1,
      "LineSeriesDefinition",
      expect.objectContaining({ color: "#111", lineStyle: 0 }),
    );
    expect(addSeriesMock).toHaveBeenNthCalledWith(
      2,
      "LineSeriesDefinition",
      expect.objectContaining({ color: "#222", lineStyle: 2 }),
    );
  });

  it("사라진 라인은 removeSeries로 제거한다", () => {
    const { rerender } = render(
      <LineSeriesChart lines={[line({ id: "a" }), line({ id: "b" })]} ariaLabel="테스트 차트" />,
    );
    expect(addSeriesMock).toHaveBeenCalledTimes(2);

    rerender(<LineSeriesChart lines={[line({ id: "a" })]} ariaLabel="테스트 차트" />);
    expect(removeSeriesMock).toHaveBeenCalledTimes(1);
  });

  it("언마운트 시 차트를 정리한다", () => {
    const { unmount } = render(<LineSeriesChart lines={[line()]} ariaLabel="테스트 차트" />);
    unmount();
    expect(chartRemoveMock).toHaveBeenCalledTimes(1);
  });

  it("스크린 리더를 위한 대체 텍스트를 제공한다 (docs/06 §7)", () => {
    const { getByRole } = render(<LineSeriesChart lines={[line()]} ariaLabel="가격 차트 설명" />);
    expect(getByRole("img", { name: "가격 차트 설명" })).toBeInTheDocument();
  });

  it("valueUnit을 지정하면 축 눈금 포맷터가 값 뒤에 단위를 붙인다", () => {
    render(<LineSeriesChart lines={[line()]} ariaLabel="테스트 차트" valueUnit="USD" />);

    const call = applyOptionsMock.mock.calls.find(
      ([options]) => options?.localization?.priceFormatter !== undefined,
    );
    expect(call).toBeDefined();
    const [{ localization }] = call as [
      { localization: { priceFormatter: (p: number) => string } },
    ];
    expect(localization.priceFormatter(1234.5)).toBe("1234.50 USD");
  });

  it("valueUnit이 없으면 포맷터를 지정하지 않는다(기본 숫자 표시)", () => {
    render(<LineSeriesChart lines={[line()]} ariaLabel="테스트 차트" />);

    const call = applyOptionsMock.mock.calls.find(([options]) => "localization" in (options ?? {}));
    expect(call?.[0].localization.priceFormatter).toBeUndefined();
  });
});
