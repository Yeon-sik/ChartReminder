import { assertTradingDate, type TradingDate } from "../shared/time";

/**
 * 자산별 거래일 목록의 합집합 타임라인을 만든다. (docs/04_REPLAY_ENGINE_SPEC.md §6)
 *
 * - 결과는 중복 없는 오름차순 배열이다.
 * - 입력 순서·정렬 상태와 무관하게 같은 결과를 만든다(결정론).
 * - 특정 자산에 없는 날짜를 채우지 않는다. gap 유지는 소비 측 책임이다.
 */
export function unionTradingDates(seriesDates: readonly (readonly TradingDate[])[]): TradingDate[] {
  const unique = new Set<TradingDate>();
  for (const dates of seriesDates) {
    for (const date of dates) {
      assertTradingDate(date);
      unique.add(date);
    }
  }
  return [...unique].sort();
}
