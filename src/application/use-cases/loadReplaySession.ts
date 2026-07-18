import {
  REPLAY_SESSION_SCHEMA_VERSION,
  type ReplaySessionRecord,
} from "../../domain/session/replaySession";
import { DomainValidationError } from "../../domain/shared/errors";
import type { SessionRepository } from "../ports/sessionRepository";

/**
 * 저장된 세션을 불러온다. (docs/07 §3 "앱 시작 시 현재 버전과 호환성을 검사한다")
 *
 * MVP는 스키마 버전이 정확히 일치할 때만 불러오기를 허용한다 — 호환 마이그레이션은
 * 스키마 버전이 실제로 늘어날 때 추가한다.
 */
export async function loadReplaySession(
  sessionRepository: SessionRepository,
  id: string,
): Promise<ReplaySessionRecord> {
  const record = await sessionRepository.findById(id);
  if (record === null) {
    throw new DomainValidationError(`저장된 세션을 찾을 수 없다: ${id}`);
  }
  if (record.schemaVersion !== REPLAY_SESSION_SCHEMA_VERSION) {
    throw new DomainValidationError(
      `지원하지 않는 세션 스키마 버전이다(저장: ${record.schemaVersion}, 현재: ${REPLAY_SESSION_SCHEMA_VERSION})`,
    );
  }
  return record;
}
