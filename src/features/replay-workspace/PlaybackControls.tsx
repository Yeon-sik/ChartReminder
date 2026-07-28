import { useEffect } from "react";

import {
  REPLAY_SPEEDS,
  type ReplaySpeed,
  type ReplayStatus,
} from "../../domain/replay/replayEngine";
import type { TradingDate } from "../../domain/shared/time";

export interface PlaybackControlsProps {
  readonly status: ReplayStatus;
  readonly currentDate: TradingDate | null;
  readonly speed: ReplaySpeed;
  /** 진행바 범위·위치 (docs/06 §2, §5 — seek는 MVP에서 허용). */
  readonly cursor: number;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly firstDate: TradingDate;
  readonly lastDate: TradingDate;
  readonly onPlay: () => void;
  readonly onPause: () => void;
  readonly onStepForward: () => void;
  readonly onRestart: () => void;
  readonly onSetSpeed: (speed: ReplaySpeed) => void;
  readonly onSeek: (index: number) => void;
}

const STATUS_LABELS: Record<ReplayStatus, string> = {
  idle: "대기 중",
  ready: "재생 준비 완료",
  playing: "재생 중",
  paused: "일시정지",
  completed: "완료",
  error: "오류",
};

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function RestartIcon() {
  return (
    <svg className="playback-controls__icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 2v12L1 8z" />
      <rect x="4" y="2" width="2" height="12" />
      <path d="M15 2v12L7 8z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg className="playback-controls__icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 1.5v13l12-6.5z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg className="playback-controls__icon" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="3" y="2" width="4" height="12" />
      <rect x="9" y="2" width="4" height="12" />
    </svg>
  );
}

function StepForwardIcon() {
  return (
    <svg className="playback-controls__icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M1 2v12l8-6z" />
      <rect x="11" y="2" width="2" height="12" />
    </svg>
  );
}

function formatReplayProgress(cursor: number, startIndex: number, endIndex: number): string {
  const completed = cursor - startIndex + 1;
  const total = endIndex - startIndex + 1;
  const percent = total <= 0 ? 0 : Math.round((completed / total) * 100);
  return `${completed}/${total}일 · ${percent}%`;
}

/**
 * 재생 제어. (docs/06 §5)
 *
 * Space: 재생/일시정지, →: 한 단계 전진, Home: 처음으로. 입력 요소에 포커스가 있을 때는
 * 무시한다(폼 타이핑과 충돌 방지). 모든 조작은 네이티브 버튼으로도 가능하다(ui.md).
 */
export function PlaybackControls({
  status,
  currentDate,
  speed,
  cursor,
  startIndex,
  endIndex,
  firstDate,
  lastDate,
  onPlay,
  onPause,
  onStepForward,
  onRestart,
  onSetSpeed,
  onSeek,
}: PlaybackControlsProps) {
  const canStep = status === "ready" || status === "paused";
  const canPlay = status === "ready" || status === "paused";
  const canRestart = status !== "idle" && status !== "error";
  // ReplayEngine.seekToIndex도 이 두 상태에서만 거부한다 (replayEngine.ts).
  const canSeek = status !== "idle" && status !== "error";
  const progressLabel = formatReplayProgress(cursor, startIndex, endIndex);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (isTypingTarget(event.target)) {
        return;
      }
      if (event.code === "Space") {
        if (status === "playing") {
          event.preventDefault();
          onPause();
        } else if (canPlay) {
          event.preventDefault();
          onPlay();
        }
      } else if (event.code === "ArrowRight") {
        if (canStep) {
          event.preventDefault();
          onStepForward();
        }
      } else if (event.code === "Home") {
        if (canRestart) {
          event.preventDefault();
          onRestart();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [status, canPlay, canStep, canRestart, onPlay, onPause, onStepForward, onRestart]);

  return (
    <div className="playback-controls">
      <div className="playback-controls__row">
        <button type="button" onClick={onRestart} disabled={!canRestart} aria-label="처음으로">
          <RestartIcon />
          처음으로
        </button>
        {status === "playing" ? (
          <button type="button" onClick={onPause}>
            <PauseIcon />
            일시정지
          </button>
        ) : (
          <button type="button" onClick={onPlay} disabled={!canPlay}>
            <PlayIcon />
            재생
          </button>
        )}
        <button type="button" onClick={onStepForward} disabled={!canStep} aria-label="한 단계 전진">
          <StepForwardIcon />한 단계
        </button>

        <label className="playback-controls__speed">
          속도
          <select
            value={speed}
            onChange={(event) => onSetSpeed(Number(event.target.value) as ReplaySpeed)}
          >
            {REPLAY_SPEEDS.map((option) => (
              <option key={option} value={option}>
                {option}x
              </option>
            ))}
          </select>
        </label>

        <p className="playback-controls__status" aria-live="polite">
          {STATUS_LABELS[status]}
          {currentDate !== null && ` · ${currentDate}`}
        </p>
      </div>

      <div className="playback-controls__seek-row">
        <span className="playback-controls__seek-date">{firstDate}</span>
        <input
          type="range"
          className="playback-controls__seek"
          aria-label="재생 진행바"
          aria-valuetext={
            currentDate === null ? progressLabel : `${currentDate} · ${progressLabel}`
          }
          min={startIndex}
          max={endIndex}
          step={1}
          value={cursor}
          disabled={!canSeek}
          onChange={(event) => onSeek(Number(event.target.value))}
        />
        <span className="playback-controls__progress">{progressLabel}</span>
        <span className="playback-controls__seek-date">{lastDate}</span>
      </div>
    </div>
  );
}
