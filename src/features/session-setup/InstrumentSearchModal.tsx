import { useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";

import type { InstrumentSearchResult } from "../../application/use-cases/searchInstruments";
import type { Instrument } from "../../domain/instrument/instrument";
import { formatProviderError } from "../replay-workspace/format";
import "./InstrumentSearchModal.css";

const DEBOUNCE_MS = 300;
const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "a[href]",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

type MarketFilterId = "all" | "crypto" | "us-stock" | "kr-stock";

/**
 * 앱이 지원하는 시장은 GOAL.md 범위대로 고정 3종(암호화폐·미국 주식·한국 주식)이라
 * providerId로 직접 매핑한다 — 결과에 실제로 나타난 시장만으로 칩을 동적 생성하지 않는다
 * (검색어를 바꿀 때마다 칩이 나타났다 사라지면 오히려 혼란스럽다).
 */
const MARKET_FILTERS: ReadonlyArray<{
  readonly id: MarketFilterId;
  readonly label: string;
  readonly providerId: string | null;
}> = [
  { id: "all", label: "전체", providerId: null },
  { id: "crypto", label: "암호화폐", providerId: "binance" },
  { id: "us-stock", label: "미국 주식", providerId: "tiingo" },
  { id: "kr-stock", label: "한국 주식", providerId: "krx-public-data" },
];

export interface InstrumentSearchModalProps {
  readonly title: string;
  /** 다른 자산 슬롯에서 이미 고른 자산 — 검색 결과에서 제외한다. */
  readonly excludeIds: ReadonlySet<string>;
  readonly search: (query: string) => Promise<InstrumentSearchResult>;
  readonly onSelect: (instrument: Instrument) => void;
  readonly onClose: () => void;
}

function instrumentLabel(instrument: Instrument): string {
  return `${instrument.displayName} (${instrument.symbol})`;
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getAttribute("aria-hidden") !== "true",
  );
}

/**
 * 자산 상세 검색 모달. (D-025 — 인라인 목록 대신 별도 검색 창에서 시장 필터를 포함한 검색)
 *
 * 열리면 빈 질의로 즉시 검색해 기본 추천을 보여주고(기존 InstrumentSearchField와 동일한
 * 동작), 입력이 있으면 `DEBOUNCE_MS` 후 실제 검색을 요청한다. Esc·배경 클릭·닫기 버튼
 * 셋 다 `onClose`로 닫고, 열린 동안 키보드 포커스를 모달 안에 유지한다.
 */
export function InstrumentSearchModal({
  title,
  excludeIds,
  search,
  onSelect,
  onClose,
}: InstrumentSearchModalProps) {
  const [queryText, setQueryText] = useState("");
  const [marketFilter, setMarketFilter] = useState<MarketFilterId>("all");
  const [results, setResults] = useState<Instrument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (restoreFocusRef.current === null && document.activeElement instanceof HTMLElement) {
      restoreFocusRef.current = document.activeElement;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    inputRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || modalRef.current === null) {
        return;
      }

      const focusable = focusableElements(modalRef.current);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) {
        return;
      }

      const activeElement = document.activeElement;
      const focusIsOutside = !modalRef.current.contains(activeElement);
      if (event.shiftKey && (activeElement === first || focusIsOutside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeElement === last || focusIsOutside)) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // effect 본문에서는 setState를 동기 호출하지 않는다(react-hooks/set-state-in-effect) —
  // loading=true는 이 값을 유발하는 이벤트(마운트·입력)에서 미리 켠다.
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(
      () => {
        search(queryText)
          .then((result) => {
            if (cancelled) {
              return;
            }
            setResults(result.instruments.filter((instrument) => !excludeIds.has(instrument.id)));
            const firstError = Object.values(result.errorsByProviderId)[0];
            setError(firstError === undefined ? null : formatProviderError(firstError));
          })
          .catch((searchError: unknown) => {
            if (!cancelled) {
              setError(formatProviderError(searchError));
            }
          })
          .finally(() => {
            if (!cancelled) {
              setLoading(false);
            }
          });
      },
      queryText === "" ? 0 : DEBOUNCE_MS,
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // excludeIds는 매 렌더 새 Set일 수 있어 호출측에서 안정된 참조를 넘긴다고 가정한다.
  }, [queryText, search, excludeIds]);

  function handleOverlayClick(event: MouseEvent<HTMLDivElement>): void {
    if (event.target === overlayRef.current) {
      onClose();
    }
  }

  const activeProviderId = MARKET_FILTERS.find((filter) => filter.id === marketFilter)?.providerId;
  const visibleResults =
    activeProviderId === null || activeProviderId === undefined
      ? results
      : results.filter((instrument) => instrument.providerId === activeProviderId);

  return createPortal(
    <div ref={overlayRef} className="instrument-search-modal__overlay" onClick={handleOverlayClick}>
      <div
        ref={modalRef}
        className="instrument-search-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="instrument-search-modal__header">
          <h2>{title}</h2>
          <button
            type="button"
            className="instrument-search-modal__close"
            onClick={onClose}
            aria-label="검색 닫기"
          >
            ✕
          </button>
        </header>

        <input
          ref={inputRef}
          type="text"
          className="instrument-search-modal__input"
          value={queryText}
          onChange={(event) => {
            setQueryText(event.target.value);
            setLoading(true);
          }}
          placeholder="종목명 또는 코드 검색"
          autoComplete="off"
        />

        <div className="instrument-search-modal__filters" role="group" aria-label="시장 필터">
          {MARKET_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={
                marketFilter === filter.id
                  ? "instrument-search-modal__filter is-active"
                  : "instrument-search-modal__filter"
              }
              aria-pressed={marketFilter === filter.id}
              onClick={() => setMarketFilter(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="instrument-search-modal__body">
          {loading && (
            <p role="status" className="instrument-search-modal__status">
              검색하는 중입니다…
            </p>
          )}
          {error !== null && (
            <p
              role="alert"
              className="instrument-search-modal__status instrument-search-modal__status--error"
            >
              {error}
            </p>
          )}
          {!loading && visibleResults.length === 0 && (
            <p className="instrument-search-modal__status">검색 결과가 없습니다.</p>
          )}
          {visibleResults.length > 0 && (
            <ul className="instrument-search-modal__results">
              {visibleResults.map((instrument) => (
                <li key={instrument.id}>
                  <button
                    type="button"
                    className="instrument-search-modal__result"
                    onClick={() => onSelect(instrument)}
                  >
                    <span className="instrument-search-modal__result-name">
                      {instrumentLabel(instrument)}
                    </span>
                    <span className="instrument-search-modal__result-meta">
                      <span className="instrument-search-modal__badge">{instrument.market}</span>
                      <span>{instrument.quoteCurrency}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
