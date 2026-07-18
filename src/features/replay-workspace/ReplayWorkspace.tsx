import type { AppComposition } from "../../app/composition";
import type {
  AssetDataNotice,
  PrepareReplaySessionRequest,
} from "../../application/use-cases/prepareReplaySession";
import type { Instrument } from "../../domain/instrument/instrument";
import type { ReplaySpeed, ReplayStatus } from "../../domain/replay/replayEngine";
import type { ReplayDataset } from "../../domain/replay/replayDataset";
import type { SimulationResult } from "../../domain/simulation/simulationEngine";
import type { TradingDate } from "../../domain/shared/time";
import "./ReplayWorkspace.css";
import { formatDataNotice } from "./format";
import { PlaybackControls } from "./PlaybackControls";
import { PortfolioChart } from "./PortfolioChart";
import { PriceChart } from "./PriceChart";
import { ResultSummary } from "./ResultSummary";
import { SessionActions } from "./SessionActions";
import { useReplaySession } from "./useReplaySession";
import {
  buildPortfolioSeries,
  buildPriceSeries,
  buildResultSummary,
  type DisplayMode,
} from "./viewModel";

export interface ReplayWorkspaceProps {
  readonly composition: AppComposition;
  readonly request: PrepareReplaySessionRequest;
  readonly instrumentsById: Readonly<Record<string, Instrument>>;
  readonly displayMode: DisplayMode;
  /** 저장된 세션을 불러올 때 재생 속도를 복원한다 (docs/07 §4). 새 세션이면 undefined. */
  readonly initialSpeed?: ReplaySpeed;
  readonly onBackToSetup: () => void;
}

export function ReplayWorkspace({
  composition,
  request,
  instrumentsById,
  displayMode,
  initialSpeed,
  onBackToSetup,
}: ReplayWorkspaceProps) {
  const session = useReplaySession(composition, request, initialSpeed);

  return (
    <div className="replay-workspace">
      <div className="replay-workspace__header">
        <button type="button" onClick={onBackToSetup}>
          ← 새 설정
        </button>
        {composition.runtime === "browser-preview" && (
          <p className="replay-workspace__runtime-note">
            브라우저 미리보기 모드입니다 — 데이터 캐시가 저장되지 않습니다.
          </p>
        )}
      </div>

      {session.status === "loading" && (
        <p role="status" className="replay-workspace__loading">
          데이터를 조회하는 중입니다…
        </p>
      )}

      {session.status === "error" && (
        <div role="alert" className="replay-workspace__error">
          <p>{session.errorMessage}</p>
          <button type="button" onClick={onBackToSetup}>
            설정으로 돌아가기
          </button>
        </div>
      )}

      {session.status === "ready" &&
        session.dataset !== null &&
        session.resultsByInstrumentId !== null &&
        session.dataNoticesByInstrumentId !== null &&
        session.replayState !== null && (
          <ReadyWorkspace
            composition={composition}
            request={request}
            dataset={session.dataset}
            resultsByInstrumentId={session.resultsByInstrumentId}
            dataNoticesByInstrumentId={session.dataNoticesByInstrumentId}
            instrumentsById={instrumentsById}
            displayMode={displayMode}
            cursor={session.replayState.cursor}
            status={session.replayState.status}
            speed={session.replayState.speed}
            currentDate={session.dataset.timeline[session.replayState.cursor] ?? null}
            onPlay={session.play}
            onPause={session.pause}
            onStepForward={session.stepForward}
            onRestart={session.restart}
            onSetSpeed={session.setSpeed}
          />
        )}
    </div>
  );
}

interface ReadyWorkspaceProps {
  readonly composition: AppComposition;
  readonly request: PrepareReplaySessionRequest;
  readonly dataset: ReplayDataset;
  readonly resultsByInstrumentId: Readonly<Record<string, SimulationResult>>;
  readonly dataNoticesByInstrumentId: Readonly<Record<string, AssetDataNotice>>;
  readonly instrumentsById: Readonly<Record<string, Instrument>>;
  readonly displayMode: DisplayMode;
  readonly cursor: number;
  readonly status: ReplayStatus;
  readonly speed: ReplaySpeed;
  readonly currentDate: TradingDate | null;
  readonly onPlay: () => void;
  readonly onPause: () => void;
  readonly onStepForward: () => void;
  readonly onRestart: () => void;
  readonly onSetSpeed: (speed: ReplaySpeed) => void;
}

function ReadyWorkspace({
  composition,
  request,
  dataset,
  resultsByInstrumentId,
  dataNoticesByInstrumentId,
  instrumentsById,
  displayMode,
  cursor,
  status,
  speed,
  currentDate,
  onPlay,
  onPause,
  onStepForward,
  onRestart,
  onSetSpeed,
}: ReadyWorkspaceProps) {
  const priceSeries = buildPriceSeries(dataset, instrumentsById, displayMode, cursor);
  const portfolioSeries = buildPortfolioSeries(resultsByInstrumentId, instrumentsById, cursor);
  const summaryRows = buildResultSummary(resultsByInstrumentId, instrumentsById, cursor);

  const notices = Object.entries(dataNoticesByInstrumentId)
    .map(([instrumentId, notice]) => ({
      instrumentId,
      text: formatDataNotice(notice),
    }))
    .filter((entry): entry is { instrumentId: string; text: string } => entry.text !== null);

  return (
    <>
      <PlaybackControls
        status={status}
        currentDate={currentDate}
        speed={speed}
        onPlay={onPlay}
        onPause={onPause}
        onStepForward={onStepForward}
        onRestart={onRestart}
        onSetSpeed={onSetSpeed}
      />

      {notices.length > 0 && (
        <ul className="replay-workspace__notices">
          {notices.map((notice) => (
            <li key={notice.instrumentId}>
              {instrumentsById[notice.instrumentId]?.displayName ?? notice.instrumentId}:{" "}
              {notice.text}
            </li>
          ))}
        </ul>
      )}

      <section className="chart-section" aria-label="가격 차트">
        <h2>가격 / 정규화 수익률</h2>
        <PriceChart series={priceSeries} />
      </section>

      <section className="chart-section" aria-label="투자금 변화 차트">
        <h2>투자금 변화</h2>
        <PortfolioChart series={portfolioSeries} />
      </section>

      <section aria-label="결과 요약">
        <h2>결과 요약</h2>
        <ResultSummary rows={summaryRows} dataNoticesByInstrumentId={dataNoticesByInstrumentId} />
      </section>

      <SessionActions
        composition={composition}
        request={request}
        instrumentsById={instrumentsById}
        displayMode={displayMode}
        speed={speed}
        dataset={dataset}
        resultsByInstrumentId={resultsByInstrumentId}
        cursor={cursor}
      />
    </>
  );
}
