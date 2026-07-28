import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PlaybackControls, type PlaybackControlsProps } from "./PlaybackControls";

function baseProps(overrides: Partial<PlaybackControlsProps> = {}): PlaybackControlsProps {
  return {
    status: "ready",
    currentDate: "2024-01-01",
    speed: 1,
    cursor: 0,
    startIndex: 0,
    endIndex: 4,
    firstDate: "2024-01-01",
    lastDate: "2024-01-05",
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onStepForward: vi.fn(),
    onRestart: vi.fn(),
    onSetSpeed: vi.fn(),
    onSeek: vi.fn(),
    ...overrides,
  };
}

describe("PlaybackControls — 버튼", () => {
  it("ready 상태에서는 재생 버튼이 활성화되고 일시정지 버튼은 보이지 않는다", () => {
    render(<PlaybackControls {...baseProps({ status: "ready" })} />);
    expect(screen.getByRole("button", { name: /재생/ })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /일시정지/ })).not.toBeInTheDocument();
  });

  it("playing 상태에서는 일시정지 버튼으로 바뀐다", () => {
    const onPause = vi.fn();
    render(<PlaybackControls {...baseProps({ status: "playing", onPause })} />);
    fireEvent.click(screen.getByRole("button", { name: /일시정지/ }));
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it("completed 상태에서는 재생·한 단계 버튼이 비활성화되고 처음으로는 활성 상태다", () => {
    render(<PlaybackControls {...baseProps({ status: "completed" })} />);
    expect(screen.getByRole("button", { name: /재생/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "한 단계 전진" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "처음으로" })).toBeEnabled();
  });

  it("idle 상태에서는 처음으로 버튼도 비활성화된다", () => {
    render(<PlaybackControls {...baseProps({ status: "idle", currentDate: null })} />);
    expect(screen.getByRole("button", { name: "처음으로" })).toBeDisabled();
  });

  it("속도 변경을 호출한다", () => {
    const onSetSpeed = vi.fn();
    render(<PlaybackControls {...baseProps({ onSetSpeed })} />);
    fireEvent.change(screen.getByLabelText("속도"), { target: { value: "2" } });
    expect(onSetSpeed).toHaveBeenCalledWith(2);
  });

  it("현재 상태와 날짜를 텍스트로 보여준다 (차트 대체 텍스트, docs/06 §7)", () => {
    render(<PlaybackControls {...baseProps({ status: "paused", currentDate: "2024-03-15" })} />);
    expect(screen.getByText(/일시정지/)).toHaveTextContent("2024-03-15");
  });
});

describe("PlaybackControls — 진행바(seek) (docs/06 §2, §5)", () => {
  it("범위를 startIndex~endIndex로, 현재 값을 cursor로 표시한다", () => {
    render(<PlaybackControls {...baseProps({ cursor: 2, startIndex: 0, endIndex: 4 })} />);
    const seek = screen.getByLabelText("재생 진행바") as HTMLInputElement;
    expect(seek.min).toBe("0");
    expect(seek.max).toBe("4");
    expect(seek.value).toBe("2");
  });

  it("슬라이더를 옮기면 onSeek을 인덱스로 호출한다", () => {
    const onSeek = vi.fn();
    render(<PlaybackControls {...baseProps({ onSeek })} />);
    fireEvent.change(screen.getByLabelText("재생 진행바"), { target: { value: "3" } });
    expect(onSeek).toHaveBeenCalledWith(3);
  });

  it("idle 상태에서는 진행바가 비활성화된다", () => {
    render(<PlaybackControls {...baseProps({ status: "idle", currentDate: null })} />);
    expect(screen.getByLabelText("재생 진행바")).toBeDisabled();
  });

  it("완료 상태에서도 진행바로 되감을 수 있다", () => {
    render(<PlaybackControls {...baseProps({ status: "completed" })} />);
    expect(screen.getByLabelText("재생 진행바")).toBeEnabled();
  });

  it("첫 날짜와 마지막 날짜를 진행바 양끝에 표시한다", () => {
    render(
      <PlaybackControls {...baseProps({ firstDate: "2024-01-01", lastDate: "2024-06-30" })} />,
    );
    expect(screen.getByText("2024-01-01")).toBeInTheDocument();
    expect(screen.getByText("2024-06-30")).toBeInTheDocument();
  });

  it("현재 진행도를 텍스트와 aria-valuetext로 함께 보여준다", () => {
    render(
      <PlaybackControls
        {...baseProps({
          cursor: 2,
          startIndex: 0,
          endIndex: 4,
          currentDate: "2024-01-03",
        })}
      />,
    );
    expect(screen.getByText("3/5일 · 60%")).toBeInTheDocument();
    expect(screen.getByLabelText("재생 진행바")).toHaveAttribute(
      "aria-valuetext",
      "2024-01-03 · 3/5일 · 60%",
    );
  });
});

describe("PlaybackControls — 키보드 조작 (docs/06 §5)", () => {
  it("Space로 재생/일시정지를 토글한다", () => {
    const onPlay = vi.fn();
    render(<PlaybackControls {...baseProps({ status: "ready", onPlay })} />);
    fireEvent.keyDown(window, { code: "Space" });
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it("→로 한 단계 전진한다", () => {
    const onStepForward = vi.fn();
    render(<PlaybackControls {...baseProps({ status: "paused", onStepForward })} />);
    fireEvent.keyDown(window, { code: "ArrowRight" });
    expect(onStepForward).toHaveBeenCalledTimes(1);
  });

  it("Home으로 처음부터 다시 시작한다", () => {
    const onRestart = vi.fn();
    render(<PlaybackControls {...baseProps({ status: "completed", onRestart })} />);
    fireEvent.keyDown(window, { code: "Home" });
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it("입력 요소에 포커스가 있으면 Space를 무시한다 (폼 타이핑과 충돌 방지)", () => {
    const onPlay = vi.fn();
    render(
      <div>
        <input aria-label="다른 입력" />
        <PlaybackControls {...baseProps({ status: "ready", onPlay })} />
      </div>,
    );
    const input = screen.getByLabelText("다른 입력");
    input.focus();
    fireEvent.keyDown(input, { code: "Space" });
    expect(onPlay).not.toHaveBeenCalled();
  });

  it("허용되지 않는 상태에서는 →를 눌러도 아무 일도 일어나지 않는다", () => {
    const onStepForward = vi.fn();
    render(<PlaybackControls {...baseProps({ status: "playing", onStepForward })} />);
    fireEvent.keyDown(window, { code: "ArrowRight" });
    expect(onStepForward).not.toHaveBeenCalled();
  });
});
