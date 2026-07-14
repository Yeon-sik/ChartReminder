import { DomainValidationError } from "../shared/errors";
import { isUtcTimestampMs, type UtcTimestampMs } from "../shared/time";

/**
 * UTC 밀리초 반개구간 [startMs, endMs). 캐시 커버리지와 조회 범위 계산에 사용한다.
 * 반개구간을 쓰면 인접 범위의 병합·차집합 계산에서 경계 중복이 생기지 않는다.
 */
export interface UtcTimeRange {
  readonly startMs: UtcTimestampMs;
  readonly endMs: UtcTimestampMs;
}

export function createUtcTimeRange(startMs: number, endMs: number): UtcTimeRange {
  if (!isUtcTimestampMs(startMs) || !isUtcTimestampMs(endMs)) {
    throw new DomainValidationError(
      `범위 경계가 유효한 정수 밀리초가 아니다: [${startMs}, ${endMs})`,
    );
  }
  if (startMs >= endMs) {
    throw new DomainValidationError(`빈 범위이거나 순서가 뒤집혔다: [${startMs}, ${endMs})`);
  }
  return { startMs, endMs };
}

/** 겹치거나 맞닿은 범위를 병합해 정렬된 최소 표현으로 만든다. */
export function normalizeUtcTimeRanges(ranges: readonly UtcTimeRange[]): UtcTimeRange[] {
  const sorted = ranges
    .map((range) => createUtcTimeRange(range.startMs, range.endMs))
    .sort((a, b) => a.startMs - b.startMs);
  const merged: UtcTimeRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last !== undefined && range.startMs <= last.endMs) {
      if (range.endMs > last.endMs) {
        merged[merged.length - 1] = { startMs: last.startMs, endMs: range.endMs };
      }
    } else {
      merged.push(range);
    }
  }
  return merged;
}

/**
 * 요청 범위에서 이미 커버된 범위를 빼고 남은(누락) 범위를 반환한다.
 * 캐시가 요청을 완전히 덮으면 빈 배열이다. (docs/03 §3: 누락 범위만 공급자에게 요청)
 */
export function subtractUtcTimeRanges(
  requested: UtcTimeRange,
  covered: readonly UtcTimeRange[],
): UtcTimeRange[] {
  const base = createUtcTimeRange(requested.startMs, requested.endMs);
  const missing: UtcTimeRange[] = [];
  let cursor = base.startMs;
  for (const cover of normalizeUtcTimeRanges(covered)) {
    if (cover.endMs <= cursor) {
      continue;
    }
    if (cover.startMs >= base.endMs) {
      break;
    }
    if (cover.startMs > cursor) {
      missing.push({ startMs: cursor, endMs: cover.startMs });
    }
    cursor = Math.max(cursor, cover.endMs);
    if (cursor >= base.endMs) {
      return missing;
    }
  }
  if (cursor < base.endMs) {
    missing.push({ startMs: cursor, endMs: base.endMs });
  }
  return missing;
}

/** 두 범위의 교집합. 겹치지 않으면 null. */
export function intersectUtcTimeRanges(a: UtcTimeRange, b: UtcTimeRange): UtcTimeRange | null {
  const startMs = Math.max(a.startMs, b.startMs);
  const endMs = Math.min(a.endMs, b.endMs);
  return startMs < endMs ? { startMs, endMs } : null;
}
