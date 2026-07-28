import { useState } from "react";

import type { InstrumentSearchResult } from "../../application/use-cases/searchInstruments";
import type { Instrument } from "../../domain/instrument/instrument";
import { InstrumentSearchModal } from "./InstrumentSearchModal";
import "./InstrumentSearchField.css";

export interface InstrumentSearchFieldProps {
  readonly label: string;
  readonly selected: Instrument;
  /** 다른 자산 슬롯에서 이미 고른 자산 — 검색 결과에서 제외한다. */
  readonly excludeIds: ReadonlySet<string>;
  readonly search: (query: string) => Promise<InstrumentSearchResult>;
  readonly onSelect: (instrument: Instrument) => void;
}

function instrumentLabel(instrument: Instrument): string {
  return `${instrument.displayName} (${instrument.symbol})`;
}

function instrumentMeta(instrument: Instrument): string {
  return `${instrument.market} · ${instrument.quoteCurrency}`;
}

/**
 * 자산 선택 트리거. (D-025 — 인라인 목록 대신 돋보기 버튼으로 별도 검색 모달을 연다)
 *
 * 버튼은 현재 선택된 자산을 보여주기만 하고, 실제 검색·시장 필터·결과 선택은
 * `InstrumentSearchModal`이 담당한다.
 */
export function InstrumentSearchField({
  label,
  selected,
  excludeIds,
  search,
  onSelect,
}: InstrumentSearchFieldProps) {
  const [isOpen, setIsOpen] = useState(false);

  function handleSelect(instrument: Instrument): void {
    onSelect(instrument);
    setIsOpen(false);
  }

  return (
    <div className="instrument-search">
      <label>
        {label}
        <button
          type="button"
          className="instrument-search__trigger"
          aria-label={`${label}: ${instrumentLabel(selected)}`}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          onClick={() => setIsOpen(true)}
        >
          <span className="instrument-search__trigger-copy">
            <span className="instrument-search__trigger-label">{instrumentLabel(selected)}</span>
            <span className="instrument-search__trigger-meta">{instrumentMeta(selected)}</span>
          </span>
          <span aria-hidden="true" className="instrument-search__icon">
            🔍
          </span>
        </button>
      </label>

      {isOpen && (
        <InstrumentSearchModal
          title={`${label} 검색`}
          excludeIds={excludeIds}
          search={search}
          onSelect={handleSelect}
          onClose={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
