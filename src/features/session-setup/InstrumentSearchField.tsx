import { useEffect, useRef, useState } from "react";

import type { InstrumentSearchResult } from "../../application/use-cases/searchInstruments";
import type { Instrument } from "../../domain/instrument/instrument";
import { formatProviderError } from "../replay-workspace/format";
import "./InstrumentSearchField.css";

const DEBOUNCE_MS = 300;

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

/**
 * 자산 검색 콤보박스. (D-021 — 비교 종목을 큐레이션 목록으로 한정하지 않고 검색 지원)
 *
 * 포커스를 받으면 빈 질의로 즉시 검색해 각 provider의 기본 추천을 보여주고, 입력이 있으면
 * `DEBOUNCE_MS` 후 실제 검색을 요청한다. 결과는 `<button>` 목록이라 별도 ARIA combobox
 * 구현 없이도 Tab/Enter로 키보드 조작이 가능하다(ui.md "키보드 접근").
 */
export function InstrumentSearchField({
  label,
  selected,
  excludeIds,
  search,
  onSelect,
}: InstrumentSearchFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [queryText, setQueryText] = useState("");
  const [results, setResults] = useState<Instrument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blurTimeoutRef = useRef<number | undefined>(undefined);

  // effect 본문에서는 setState를 동기 호출하지 않는다(react-hooks/set-state-in-effect) —
  // loading=true는 이 값을 유발하는 이벤트 핸들러(포커스·입력)에서 미리 켠다.
  useEffect(() => {
    if (!isEditing) {
      return;
    }
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
  }, [isEditing, queryText, search, excludeIds]);

  useEffect(() => {
    return () => window.clearTimeout(blurTimeoutRef.current);
  }, []);

  function handleFocus(): void {
    setIsEditing(true);
    setQueryText("");
    setLoading(true);
  }

  function handleBlur(): void {
    // 결과 버튼 클릭이 blur보다 먼저 처리되도록 살짝 지연한다(콤보박스 공통 패턴).
    blurTimeoutRef.current = window.setTimeout(() => setIsEditing(false), 150);
  }

  function handleSelect(instrument: Instrument): void {
    window.clearTimeout(blurTimeoutRef.current);
    onSelect(instrument);
    setIsEditing(false);
    setQueryText("");
  }

  return (
    <div className="instrument-search">
      <label>
        {label}
        <input
          type="text"
          value={isEditing ? queryText : instrumentLabel(selected)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onChange={(event) => {
            setQueryText(event.target.value);
            setLoading(true);
          }}
          placeholder="종목명 또는 코드 검색"
          autoComplete="off"
        />
      </label>

      {isEditing && (
        <div className="instrument-search__panel">
          {loading && (
            <p role="status" className="instrument-search__status">
              검색하는 중입니다…
            </p>
          )}
          {error !== null && (
            <p role="alert" className="instrument-search__status instrument-search__status--error">
              {error}
            </p>
          )}
          {!loading && results.length === 0 && (
            <p className="instrument-search__status">검색 결과가 없습니다.</p>
          )}
          {results.length > 0 && (
            <ul className="instrument-search__results">
              {results.map((instrument) => (
                <li key={instrument.id}>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelect(instrument)}
                  >
                    {instrumentLabel(instrument)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
