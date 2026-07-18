import { isTauri } from "@tauri-apps/api/core";

import type { CandleRepository } from "../application/ports/candleRepository";
import type { FileExporter } from "../application/ports/fileExporter";
import type { MarketDataProvider } from "../application/ports/marketDataProvider";
import type { SessionRepository } from "../application/ports/sessionRepository";
import { ReplayEngine } from "../domain/replay/replayEngine";
import { browserFileExporter } from "../infrastructure/export/browserFileExporter";
import { tauriFileExporter } from "../infrastructure/export/tauriFileExporter";
import { fetchHttpClient } from "../infrastructure/http/httpClient";
import { InMemoryCandleRepository } from "../infrastructure/persistence/inMemoryCandleRepository";
import { InMemorySessionRepository } from "../infrastructure/persistence/inMemorySessionRepository";
import { runMigrations } from "../infrastructure/persistence/migrationRunner";
import { SqliteCandleRepository } from "../infrastructure/persistence/sqliteCandleRepository";
import { SqliteSessionRepository } from "../infrastructure/persistence/sqliteSessionRepository";
import { openTauriSqlDatabase } from "../infrastructure/persistence/tauriSqlDatabase";
import { BinanceProvider } from "../infrastructure/providers/binance/binanceProvider";
import { createTimeoutReplayScheduler } from "../infrastructure/timers/timeoutReplayScheduler";

export type AppRuntime = "tauri" | "browser-preview";

export interface AppComposition {
  readonly provider: MarketDataProvider;
  readonly repository: CandleRepository;
  readonly sessionRepository: SessionRepository;
  readonly fileExporter: FileExporter;
  /** "browser-preview"면 캐시가 세션 종료 시 소실된다 (M5 §2, Playwright 검증 전용 경로). */
  readonly runtime: AppRuntime;
  buildReplayEngine(): ReplayEngine;
}

interface PersistenceBundle {
  readonly repository: CandleRepository;
  readonly sessionRepository: SessionRepository;
  readonly runtime: AppRuntime;
}

async function buildPersistence(): Promise<PersistenceBundle> {
  if (isTauri()) {
    const db = await openTauriSqlDatabase();
    await runMigrations(db);
    return {
      repository: new SqliteCandleRepository(db),
      sessionRepository: new SqliteSessionRepository(db),
      runtime: "tauri",
    };
  }
  return {
    repository: new InMemoryCandleRepository(),
    sessionRepository: new InMemorySessionRepository(),
    runtime: "browser-preview",
  };
}

let composition: Promise<AppComposition> | null = null;

/**
 * 앱 조합 루트. (docs/01 §7, ui.md)
 *
 * React 컴포넌트는 Provider·SQLite를 직접 생성하지 않는다 — 이 함수가 반환하는
 * 포트 구현만 주입받는다. 결과는 앱 생애주기 동안 1회만 조립한다(idempotent).
 */
export function getAppComposition(): Promise<AppComposition> {
  if (composition === null) {
    composition = (async () => {
      const { repository, sessionRepository, runtime } = await buildPersistence();
      const provider = new BinanceProvider({ httpClient: fetchHttpClient });
      return {
        provider,
        repository,
        sessionRepository,
        fileExporter: runtime === "tauri" ? tauriFileExporter : browserFileExporter,
        runtime,
        buildReplayEngine: () => new ReplayEngine({ scheduler: createTimeoutReplayScheduler() }),
      };
    })();
  }
  return composition;
}
