import { useMemo, useState, type FormEvent } from "react";

import type { InstrumentSearchResult } from "../../application/use-cases/searchInstruments";
import type { PrepareReplaySessionRequest } from "../../application/use-cases/prepareReplaySession";
import type { Instrument } from "../../domain/instrument/instrument";
import { DomainValidationError } from "../../domain/shared/errors";
import type { DisplayCurrency, UsdKrwRate } from "../../domain/shared/fxConversion";
import type { DisplayMode } from "../replay-workspace/viewModel";
import { InstrumentSearchField } from "./InstrumentSearchField";
import "./SessionSetupForm.css";
import {
  buildPrepareReplaySessionRequest,
  createDefaultFormState,
  type InvestmentSettingsFormState,
  type RecurringFrequency,
  type SessionSetupFormState,
} from "./sessionSetupModel";

export interface SessionSetupFormProps {
  readonly defaultInstrument: Instrument;
  /** "비교 자산 추가" 시 초기값으로 쓰는 소수의 기본 추천 — 검색 유니버스 전체가 아니다(D-021). */
  readonly quickDefaults: readonly Instrument[];
  readonly searchInstruments: (query: string) => Promise<InstrumentSearchResult>;
  readonly displayCurrency: DisplayCurrency;
  readonly usdKrwRate: UsdKrwRate | null;
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
  defaultInstrument,
  quickDefaults,
  searchInstruments,
  displayCurrency,
  usdKrwRate,
  onSubmit,
}: SessionSetupFormProps) {
  const [state, setState] = useState<SessionSetupFormState>(() =>
    createDefaultFormState(Date.now(), defaultInstrument),
  );
  const [error, setError] = useState<string | null>(null);

  const selectedIds = useMemo(
    () => new Set(state.assets.map((instrument) => instrument.id)),
    [state.assets],
  );
  const canAddAsset = state.assets.length < 2;

  function updateInvestment(patch: Partial<InvestmentSettingsFormState>): void {
    setState((prev) => ({ ...prev, investment: { ...prev.investment, ...patch } }));
  }

  function updateAsset(index: number, instrument: Instrument): void {
    setState((prev) => ({
      ...prev,
      assets: prev.assets.map((asset, i) => (i === index ? instrument : asset)),
    }));
  }

  function addAsset(): void {
    const next = quickDefaults.find((instrument) => !selectedIds.has(instrument.id));
    if (next === undefined) {
      return;
    }
    setState((prev) => ({ ...prev, assets: [...prev.assets, next] }));
  }

  function removeAsset(index: number): void {
    setState((prev) => ({ ...prev, assets: prev.assets.filter((_, i) => i !== index) }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    try {
      const request = buildPrepareReplaySessionRequest(state, displayCurrency, usdKrwRate);
      const instrumentsById = Object.fromEntries(
        state.assets.map((instrument) => [instrument.id, instrument]),
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

  const investment = state.investment;

  return (
    <form className="session-setup" onSubmit={handleSubmit}>
      <h1>Chart Reminder 설정</h1>
      <p className="session-setup__hint">
        과거 시점으로 돌아가 자산 1~2개에 동일한 투자 규칙을 적용했을 때 자산 가치가 어떻게 변했는지
        재생합니다. 투자 금액은 표시 통화({displayCurrency}) 기준으로 입력하며, 자산 고유 통화로
        자동 환산됩니다(설정 탭에서 표시 통화를 바꿀 수 있습니다).
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

      <fieldset>
        <legend>비교 자산</legend>
        {state.assets.map((instrument, index) => (
          <div key={instrument.id} className="session-setup__asset">
            <InstrumentSearchField
              label={`자산 ${index + 1}`}
              selected={instrument}
              excludeIds={selectedIds}
              search={searchInstruments}
              onSelect={(next) => updateAsset(index, next)}
            />
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
          </div>
        ))}

        {canAddAsset && (
          <button type="button" onClick={addAsset}>
            비교 자산 추가 (최대 2개)
          </button>
        )}
      </fieldset>

      <fieldset>
        <legend>투자 설정 (선택한 모든 자산에 동일하게 적용)</legend>

        <fieldset className="session-setup__mode">
          <legend>투자 모드</legend>
          <label>
            <input
              type="radio"
              name="investment-mode"
              checked={investment.mode === "lump-sum"}
              onChange={() => updateInvestment({ mode: "lump-sum" })}
            />
            일시투자
          </label>
          <label>
            <input
              type="radio"
              name="investment-mode"
              checked={investment.mode === "dca"}
              onChange={() => updateInvestment({ mode: "dca" })}
            />
            정기 정액매수
          </label>
        </fieldset>

        {investment.mode === "lump-sum" ? (
          <label>
            원금 ({displayCurrency})
            <input
              type="text"
              inputMode="decimal"
              value={investment.initialCash}
              onChange={(event) => updateInvestment({ initialCash: event.target.value })}
            />
          </label>
        ) : (
          <>
            <label>
              납입액 ({displayCurrency})
              <input
                type="text"
                inputMode="decimal"
                value={investment.recurringAmount}
                onChange={(event) => updateInvestment({ recurringAmount: event.target.value })}
              />
            </label>
            <label>
              주기
              <select
                value={investment.recurringFrequency}
                onChange={(event) =>
                  updateInvestment({ recurringFrequency: event.target.value as RecurringFrequency })
                }
              >
                <option value="weekly">매주</option>
                <option value="monthly">매월</option>
              </select>
            </label>
            {investment.recurringFrequency === "weekly" ? (
              <label>
                요일
                <select
                  value={investment.recurringIsoDayOfWeek}
                  onChange={(event) =>
                    updateInvestment({ recurringIsoDayOfWeek: Number(event.target.value) })
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
                  value={investment.recurringDayOfMonth}
                  onChange={(event) =>
                    updateInvestment({ recurringDayOfMonth: Number(event.target.value) })
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
            value={investment.feePercent}
            onChange={(event) => updateInvestment({ feePercent: event.target.value })}
          />
        </label>

        <label className="session-setup__checkbox">
          <input
            type="checkbox"
            checked={investment.allowFractionalQuantity}
            onChange={(event) =>
              updateInvestment({ allowFractionalQuantity: event.target.checked })
            }
          />
          소수점 매수 허용
        </label>
      </fieldset>

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
