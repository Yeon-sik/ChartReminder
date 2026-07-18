import {
  REPLAY_SESSION_SCHEMA_VERSION,
  assertValidSessionName,
  type ReplaySessionRecord,
  type SavedSessionConfiguration,
  type SavedSessionDataVersions,
} from "../../domain/session/replaySession";
import { systemClock, type Clock } from "../ports/clock";
import { cryptoIdGenerator, type IdGenerator } from "../ports/idGenerator";
import type { SessionRepository } from "../ports/sessionRepository";

export interface SaveReplaySessionDeps {
  readonly sessionRepository: SessionRepository;
  readonly clock?: Clock;
  readonly idGenerator?: IdGenerator;
}

export interface SaveReplaySessionRequest {
  readonly name: string;
  readonly configuration: SavedSessionConfiguration;
  readonly dataVersions: SavedSessionDataVersions;
}

/** 현재 재생 설정을 새 세션 레코드로 저장한다. (docs/07 §4) 항상 새 id를 발급한다(Save As). */
export async function saveReplaySession(
  deps: SaveReplaySessionDeps,
  request: SaveReplaySessionRequest,
): Promise<ReplaySessionRecord> {
  const name = request.name.trim();
  assertValidSessionName(name);

  const clock = deps.clock ?? systemClock;
  const idGenerator = deps.idGenerator ?? cryptoIdGenerator;
  const now = clock.nowUtcMs();

  const record: ReplaySessionRecord = {
    id: idGenerator.newId(),
    name,
    schemaVersion: REPLAY_SESSION_SCHEMA_VERSION,
    configuration: request.configuration,
    dataVersions: request.dataVersions,
    createdAtUtcMs: now,
    updatedAtUtcMs: now,
  };

  await deps.sessionRepository.save(record);
  return record;
}
