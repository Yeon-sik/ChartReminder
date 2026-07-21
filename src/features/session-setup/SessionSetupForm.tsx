import { useMemo, useState, type FormEvent } from "react";

import type { PrepareReplaySessionRequest } from "../../application/use-cases/prepareReplaySession";
import type { Instrument } from "../../domain/instrument/instrument";
import { DomainValidationError } from "../../domain/shared/errors";
import type { DisplayMode } from "../replay-workspace/viewModel";
import "./SessionSetupForm.css";
import {
  buildPrepareReplaySessionRequest,
  createDefaultFormState,
  defaultAssetFormState,
  type AssetFormState,
  type RecurringFrequency,
  type SessionSetupFormState,
} from "./sessionSetupModel";

export interface SessionSetupFormProps {
  readonly availableInstruments: readonly Instrument[];
  readonly defaultInstrument: Instrument;
  readonly onSubmit: (
    request: PrepareReplaySessionRequest,
    instrumentsById: Record<string, Instrument>,
    displayMode: DisplayMode,
  ) => void;
}

const DISPLAY_MODE_LABELS: Record<DisplayMode, string> = {
  raw: "원시 가격",
  "normalized-100": "시작점 100",
  "cumulative-return": "누적 수익률",
};

const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

export function SessionSetupForm({
  availableInstruments,
  defaultInstrument,
  onSubmit,
}: SessionSetupFormProps) {
  const [state, setState] = useState<SessionSetupFormState>(() =>
    createDefaultFormState(Date.now(), defaultInstrument),
  );
  const [error, setError] = useState<string | null>(null);

  const selectedIds = useMemo(
    () => new Set(state.assets.map((asset) => asset.instrument.id)),
    [state.assets],
  );
  const canAddAsset = state.assets.length < 2 && availableInstruments.length > state.assets.length;

  function updateAsset(index: number, patch: Partial<AssetFormState>): void {
    setState((prev) => ({
      ...prev,
      assets: prev.assets.map((asset, i) => (i === index ? { ...asset, ...patch } : asset)),
    }));
  }

  function addAsset(): void {
    const next = availableInstruments.find((instrument) => !selectedIds.has(instrument.id));
    if (next === undefined) {
      return;
    }
    setState((prev) => ({ ...prev, assets: [...prev.assets, defaultAssetFormState(next)] }));
  }

  function removeAsset(index: number): void {
    setState((prev) => ({ ...prev, assets: prev.assets.filter((_, i) => i !== index) }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    try {
      const request = buildPrepareReplaySessionRequest(state);
      const instrumentsById = Object.fromEntries(
        state.assets.map((asset) => [asset.instrument.id, asset.instrument]),
      );
      setError(null);
      onSubmit(request, instrumentsById, state.displayMode);
    } catch (submitError) {
      setError(
        submitError instanceof DomainValidationError
          ? submitError.message
          : "입력을 확인해 주세요.",
      );
    }
  }

  return (
    <form className="session-setup" onSubmit={handleSubmit}>
      <h1>Chart Reminder 설정</h1>
      <p className="session-setup__hint">
        과거 시점으로 돌아가 자산 1~2개에 투자 규칙을 적용했을 때 자산 가치가 어떻게 변했는지
        재생합니다. 가격은 Binance BTC/ETH/SOL USDT 시장 가격 기준입니다.
      </p>

      <fieldset>
        <legend>기간</legend>
        <label>
          시작일
          <input
            type="date"
            value={state.startDate}
            onChange={(event) => setState((prev) => ({ ...prev, startDate: event.target.value }))}
            required
          />
        </label>
        <label>
          종료일
          <input
            type="date"
            value={state.endDate}
            onChange={(event) => setState((prev) => ({ ...prev, endDate: event.target.value }))}
            required
          />
        </label>
      </fieldset>

      <fieldset>
        <legend>표시 기준</legend>
        <label>
          가격 차트 기준
          <select
            value={state.displayMode}
            onChange={(event) =>
              setState((prev) => ({ ...prev, displayMode: event.target.value as DisplayMode }))
            }
          >
            {(Object.keys(DISPLAY_MODE_LABELS) as DisplayMode[]).map((mode) => (
              <option key={mode} value={mode}>
                {DISPLAY_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      {state.assets.map((asset, index) => (
        <fieldset key={asset.instrument.id} className="session-setup__asset">
          <legend>
            자산 {index + 1}
            {state.assets.length > 1 && (
              <button
                type="button"
                className="session-setup__remove"
                onClick={() => removeAsset(index)}
                aria-label={`자산 ${index + 1} 제거`}
              >
                제거
              </button>
            )}
          </legend>

          <label>
            종목
            <select
              value={asset.instrument.id}
              onChange={(event) => {
                const next = availableInstruments.find(
                  (instrument) => instrument.id === event.target.value,
                );
                if (next !== undefined) {
                  updateAsset(index, { instrument: next });
                }
              }}
            >
              {availableInstruments
                .filter(
                  (instrument) =>
                    instrument.id === asset.instrument.id || !selectedIds.has(instrument.id),
                )
                .map((instrument) => (
                  <option key={instrument.id} value={instrument.id}>
                    {instrument.displayName} ({instrument.symbol})
                  </option>
                ))}
            </select>
          </label>

          <fieldset className="session-setup__mode">
            <legend>투자 모드</legend>
            <label>
              <input
                type="radio"
                name={`mode-${index}`}
                checked={asset.mode === "lump-sum"}
                onChange={() => updateAsset(index, { mode: "lump-sum" })}
              />
              일시투자
            </label>
            <label>
              <input
                type="radio"
                name={`mode-${index}`}
                checked={asset.mode === "dca"}
                onChange={() => updateAsset(index, { mode: "dca" })}
              />
              정기 정액매수
            </label>
          </fieldset>

          {asset.mode === "lump-sum" ? (
            <label>
              원금 ({asset.instrument.quoteCurrency})
              <input
                type="text"
                inputMode="decimal"
                value={asset.initialCash}
                onChange={(event) => updateAsset(index, { initialCash: event.target.value })}
              />
            </label>
          ) : (
            <>
              <label>
                납입액 ({asset.instrument.quoteCurrency})
                <input
                  type="text"
                  inputMode="decimal"
                  value={asset.recurringAmount}
                  onChange={(event) => updateAsset(index, { recurringAmount: event.target.value })}
                />
              </label>
              <label>
                주기
                <select
                  value={asset.recurringFrequency}
                  onChange={(event) =>
                    updateAsset(index, {
                      recurringFrequency: event.target.value as RecurringFrequency,
                    })
                  }
                >
                  <option value="weekly">매주</option>
                  <option value="monthly">매월</option>
                </select>
              </label>
              {asset.recurringFrequency === "weekly" ? (
                <label>
                  요일
                  <select
                    value={asset.recurringIsoDayOfWeek}
                    onChange={(event) =>
                      updateAsset(index, { recurringIsoDayOfWeek: Number(event.target.value) })
                    }
                  >
                    {WEEKDAY_LABELS.map((label, weekdayIndex) => (
                      <option key={label} value={weekdayIndex + 1}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label>
                  일자
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={asset.recurringDayOfMonth}
                    onChange={(event) =>
                      updateAsset(index, { recurringDayOfMonth: Number(event.target.value) })
                    }
                  />
                </label>
              )}
            </>
          )}

          <label>
            수수료(%)
            <input
              type="text"
              inputMode="decimal"
              value={asset.feePercent}
              onChange={(event) => updateAsset(index, { feePercent: event.target.value })}
            />
          </label>

          <label className="session-setup__checkbox">
            <input
              type="checkbox"
              checked={asset.allowFractionalQuantity}
              onChange={(event) =>
                updateAsset(index, { allowFractionalQuantity: event.target.checked })
              }
            />
            소수점 매수 허용
          </label>
        </fieldset>
      ))}

      {canAddAsset && (
        <button type="button" onClick={addAsset}>
          비교 자산 추가 (최대 2개)
        </button>
      )}

      {error !== null && (
        <p role="alert" className="session-setup__error">
          {error}
        </p>
      )}

      <button type="submit" className="session-setup__submit">
        시뮬레이션 준비
      </button>
    </form>
  );
}
