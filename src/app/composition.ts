import { isTauri } from "@tauri-apps/api/core";

import type { ApiKeyStore } from "../application/ports/apiKeyStore";
import type { CandleRepository } from "../application/ports/candleRepository";
import type { FileExporter } from "../application/ports/fileExporter";
import type { MarketDataProvider } from "../application/ports/marketDataProvider";
import type { SessionRepository } from "../application/ports/sessionRepository";
import { ReplayEngine } from "../domain/replay/replayEngine";
import { browserFileExporter } from "../infrastructure/export/browserFileExporter";
import { tauriFileExporter } from "../infrastructure/export/tauriFileExporter";
import { fetchHttpClient } from "../infrastructure/http/httpClient";
import { tauriHttpClient } from "../infrastructure/http/tauriHttpClient";
import { InMemoryCandleRepository } from "../infrastructure/persistence/inMemoryCandleRepository";
import { InMemorySessionRepository } from "../infrastructure/persistence/inMemorySessionRepository";
import { runMigrations } from "../infrastructure/persistence/migrationRunner";
import { SqliteCandleRepository } from "../infrastructure/persistence/sqliteCandleRepository";
import { SqliteSessionRepository } from "../infrastructure/persistence/sqliteSessionRepository";
import { openTauriSqlDatabase } from "../infrastructure/persistence/tauriSqlDatabase";
import { BINANCE_PROVIDER_ID } from "../infrastructure/providers/binance/binanceCatalog";
import { BinanceProvider } from "../infrastructure/providers/binance/binanceProvider";
import { TiingoProvider } from "../infrastructure/providers/tiingo/tiingoProvider";
import { TIINGO_PROVIDER_ID } from "../infrastructure/providers/tiingo/tiingoCatalog";
import { InMemoryApiKeyStore } from "../infrastructure/security/inMemoryApiKeyStore";
import { tauriApiKeyStore } from "../infrastructure/security/tauriApiKeyStore";
import { createTimeoutReplayScheduler } from "../infrastructure/timers/timeoutReplayScheduler";

export type AppRuntime = "tauri" | "browser-preview";

export interface AppComposition {
  /** providerId -> Provider. 자산마다 다른 Provider(암호화폐+주식)를 섞을 수 있다 (M7). */
  readonly providers: ReadonlyMap<string, MarketDataProvider>;
  readonly repository: CandleRepository;
  readonly sessionRepository: SessionRepository;
  readonly fileExporter: FileExporter;
  readonly apiKeyStore: ApiKeyStore;
  /** "browser-preview"면 캐시가 세션 종료 시 소실된다 (M5 §2, Playwright 검증 전용 경로). */
  readonly runtime: AppRuntime;
  buildReplayEngine(): ReplayEngine;
  /**
   * BYOK 키 저장 + 즉시 반영 (D-015). Provider는 `getApiKey` 콜백으로 항상 최신 키를
   * 읽으므로, 저장 후 Provider를 다시 만들 필요가 없다.
   */
  setApiKey(providerId: string, apiKey: string): Promise<void>;
  clearApiKey(providerId: string): Promise<void>;
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
      const apiKeyStore: ApiKeyStore =
        runtime === "tauri" ? tauriApiKeyStore : new InMemoryApiKeyStore();

      // BYOK 키는 Provider 생성 시점이 아니라 호출 시점에 읽는다 — setApiKey로 저장한
      // 새 키가 Provider 재생성 없이 즉시 반영되도록 이 mutable 홀더를 공유한다 (D-015).
      const apiKeys = new Map<string, string>();
      const tiingoKey = await apiKeyStore.get(TIINGO_PROVIDER_ID);
      if (tiingoKey !== null) {
        apiKeys.set(TIINGO_PROVIDER_ID, tiingoKey);
      }

      const providers = new Map<string, MarketDataProvider>();
      providers.set(BINANCE_PROVIDER_ID, new BinanceProvider({ httpClient: fetchHttpClient }));
      // Tiingo는 CORS를 지원하지 않아 Tauri HTTP 플러그인이 있는 데스크톱 런타임에서만 동작한다
      // (브라우저 프리뷰는 SQLite 영속성이 없는 것과 같은 종류의 제약, M5 §2).
      if (runtime === "tauri") {
        providers.set(
          TIINGO_PROVIDER_ID,
          new TiingoProvider({
            httpClient: tauriHttpClient,
            getApiKey: () => apiKeys.get(TIINGO_PROVIDER_ID) ?? null,
          }),
        );
      }

      return {
        providers,
        repository,
        sessionRepository,
        fileExporter: runtime === "tauri" ? tauriFileExporter : browserFileExporter,
        apiKeyStore,
        runtime,
        buildReplayEngine: () => new ReplayEngine({ scheduler: createTimeoutReplayScheduler() }),
        async setApiKey(providerId: string, apiKey: string): Promise<void> {
          await apiKeyStore.set(providerId, apiKey);
          apiKeys.set(providerId, apiKey);
        },
        async clearApiKey(providerId: string): Promise<void> {
          await apiKeyStore.clear(providerId);
          apiKeys.delete(providerId);
        },
      };
    })();
  }
  return composition;
}
