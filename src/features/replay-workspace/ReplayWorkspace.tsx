import { useState } from "react";

import type { AppComposition } from "../../app/composition";
import type {
  AssetDataNotice,
  PrepareReplaySessionRequest,
} from "../../application/use-cases/prepareReplaySession";
import type { Instrument } from "../../domain/instrument/instrument";
import type { ReplaySpeed, ReplayStatus } from "../../domain/replay/replayEngine";
import type { ReplayDataset } from "../../domain/replay/replayDataset";
import type { DisplayCurrency, UsdKrwRate } from "../../domain/shared/fxConversion";
import type { RecurringAnchor, SimulationConfig } from "../../domain/simulation/simulationConfig";
import type { SimulationResult } from "../../domain/simulation/simulationEngine";
import type { TradingDate } from "../../domain/shared/time";
import "./ReplayWorkspace.css";
import { formatDataNotice, formatPercent } from "./format";
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
  /** 표시 통화(D-020) — 투자금 변화·결과 요약·원시 가격 차트를 이 통화로 환산해 보여준다. */
  readonly displayCurrency: DisplayCurrency;
  readonly usdKrwRate: UsdKrwRate | null;
  /** 저장된 세션을 불러올 때 재생 속도를 복원한다 (docs/07 §4). 새 세션이면 undefined. */
  readonly initialSpeed?: ReplaySpeed;
  readonly onBackToSetup: () => void;
}

export function ReplayWorkspace({
  composition,
  request,
  instrumentsById,
  displayMode,
  displayCurrency,
  usdKrwRate,
  initialSpeed,
  onBackToSetup,
}: ReplayWorkspaceProps) {
  const [retryCount, setRetryCount] = useState(0);
  const session = useReplaySession(composition, request, initialSpeed, retryCount);

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

      <SessionOverview
        request={request}
        displayMode={displayMode}
        displayCurrency={displayCurrency}
      />

      {session.status === "loading" && (
        <p role="status" className="replay-workspace__loading">
          데이터를 조회하는 중입니다…
        </p>
      )}

      {session.status === "error" && (
        <div role="alert" className="replay-workspace__error">
          <div>
            <p className="replay-workspace__error-title">리플레이 준비에 실패했습니다.</p>
            <p>{session.errorMessage}</p>
          </div>
          <div className="replay-workspace__error-actions">
            <button type="button" onClick={() => setRetryCount((count) => count + 1)}>
              다시 시도
            </button>
            <button type="button" onClick={onBackToSetup}>
              설정으로 돌아가기
            </button>
          </div>
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
            displayCurrency={displayCurrency}
            usdKrwRate={usdKrwRate}
            cursor={session.replayState.cursor}
            startIndex={session.replayState.startIndex}
            endIndex={session.replayState.endIndex}
            status={session.replayState.status}
            speed={session.replayState.speed}
            currentDate={session.dataset.timeline[session.replayState.cursor] ?? null}
            firstDate={session.dataset.timeline[0]}
            lastDate={session.dataset.timeline[session.dataset.timeline.length - 1]}
            onPlay={session.play}
            onPause={session.pause}
            onStepForward={session.stepForward}
            onRestart={session.restart}
            onSetSpeed={session.setSpeed}
            onSeek={session.seekToIndex}
          />
        )}
    </div>
  );
}

const DISPLAY_MODE_LABELS: Record<DisplayMode, string> = {
  raw: "원시 가격",
  "normalized-100": "시작점 100",
  "cumulative-return": "누적 수익률",
};

const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"] as const;

function formatRequestedDate(utcMs: number): string {
  return new Date(utcMs).toISOString().slice(0, 10);
}

function describeRecurringAnchor(anchor: RecurringAnchor): string {
  return anchor.kind === "day-of-week"
    ? `매주 ${WEEKDAY_LABELS[anchor.isoDayOfWeek - 1]}요일`
    : `매월 ${anchor.dayOfMonth}일`;
}

function describeSimulationConfig(config: SimulationConfig): string {
  const modeSummary =
    config.mode === "lump-sum"
      ? "일시투자"
      : config.recurring === undefined
        ? "정기 정액매수 · 일정 정보 없음"
        : `정기 정액매수 · ${describeRecurringAnchor(config.recurring.anchor)}`;
  return `${modeSummary} · 수수료 ${formatPercent(config.feeRate)} · 소수점 매수 ${
    config.allowFractionalQuantity ? "허용" : "비허용"
  }`;
}

function SessionOverview({
  request,
  displayMode,
  displayCurrency,
}: Pick<ReplayWorkspaceProps, "request" | "displayMode" | "displayCurrency">) {
  const representativeConfig = request.selections[0]?.simulationConfig;
  const sameSimulationRule = request.selections.every(
    (selection) =>
      JSON.stringify(selection.simulationConfig) === JSON.stringify(representativeConfig),
  );
  const startDate = formatRequestedDate(request.range.startMs);
  const endDate = formatRequestedDate(request.range.endMs - 1);

  return (
    <section className="replay-workspace__summary" aria-label="현재 세션 요약">
      <div className="replay-workspace__summary-head">
        <p className="replay-workspace__summary-eyebrow">현재 세션</p>
        <h2>무엇을 어떤 기준으로 재생 중인지</h2>
        <ul className="replay-workspace__asset-list">
          {request.selections.map((selection) => (
            <li key={selection.instrument.id} className="replay-workspace__asset-chip">
              {selection.instrument.displayName} ({selection.instrument.symbol})
            </li>
          ))}
        </ul>
      </div>

      <dl className="replay-workspace__summary-grid">
        <div>
          <dt>기간</dt>
          <dd>
            {startDate} ~ {endDate}
          </dd>
        </div>
        <div>
          <dt>가격변화 기준</dt>
          <dd>{DISPLAY_MODE_LABELS[displayMode]}</dd>
        </div>
        <div>
          <dt>표시 통화</dt>
          <dd>{displayCurrency}</dd>
        </div>
        <div>
          <dt>투자 규칙</dt>
          <dd>
            {representativeConfig === undefined
              ? "설정 없음"
              : sameSimulationRule
                ? describeSimulationConfig(representativeConfig)
                : "자산별 개별 투자 규칙"}
          </dd>
        </div>
      </dl>
    </section>
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
  readonly displayCurrency: DisplayCurrency;
  readonly usdKrwRate: UsdKrwRate | null;
  readonly cursor: number;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly status: ReplayStatus;
  readonly speed: ReplaySpeed;
  readonly currentDate: TradingDate | null;
  readonly firstDate: TradingDate;
  readonly lastDate: TradingDate;
  readonly onPlay: () => void;
  readonly onPause: () => void;
  readonly onStepForward: () => void;
  readonly onRestart: () => void;
  readonly onSetSpeed: (speed: ReplaySpeed) => void;
  readonly onSeek: (index: number) => void;
}

function ReadyWorkspace({
  composition,
  request,
  dataset,
  resultsByInstrumentId,
  dataNoticesByInstrumentId,
  instrumentsById,
  displayMode,
  displayCurrency,
  usdKrwRate,
  cursor,
  startIndex,
  endIndex,
  status,
  speed,
  currentDate,
  firstDate,
  lastDate,
  onPlay,
  onPause,
  onStepForward,
  onRestart,
  onSetSpeed,
  onSeek,
}: ReadyWorkspaceProps) {
  const priceSeries = buildPriceSeries(
    dataset,
    instrumentsById,
    displayMode,
    cursor,
    displayCurrency,
    usdKrwRate,
  );
  const portfolioSeries = buildPortfolioSeries(
    resultsByInstrumentId,
    instrumentsById,
    cursor,
    displayCurrency,
    usdKrwRate,
  );
  const summaryRows = buildResultSummary(
    resultsByInstrumentId,
    instrumentsById,
    cursor,
    displayCurrency,
    usdKrwRate,
  );

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
        cursor={cursor}
        startIndex={startIndex}
        endIndex={endIndex}
        firstDate={firstDate}
        lastDate={lastDate}
        onPlay={onPlay}
        onPause={onPause}
        onStepForward={onStepForward}
        onRestart={onRestart}
        onSetSpeed={onSetSpeed}
        onSeek={onSeek}
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

      <section className="chart-section" aria-label="가격변화 차트">
        <h2>가격변화</h2>
        <PriceChart series={priceSeries} />
      </section>

      <section className="chart-section" aria-label="투자금 변화 차트">
        <h2>투자금 변화</h2>
        <PortfolioChart series={portfolioSeries} displayCurrency={displayCurrency} />
      </section>

      <section aria-label="결과 요약">
        <h2>결과 요약</h2>
        {Object.values(instrumentsById).some(
          (instrument) => instrument.quoteCurrency !== displayCurrency,
        ) && (
          <p className="replay-workspace__currency-note">
            금액은 표시 통화({displayCurrency})로 환산해 표시됩니다. USDT는 USD와 1:1로 간주합니다.
            {usdKrwRate !== null &&
              ` 환율 기준일: ${new Date(usdKrwRate.asOfUtcMs).toISOString().slice(0, 10)} (1 USD = ${usdKrwRate.krwPerUsd} KRW, 출처: Frankfurter)`}
          </p>
        )}
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
