import { isTauri } from "@tauri-apps/api/core";

import type { AppSettingsStore } from "../application/ports/appSettingsStore";
import type { ApiKeyStore } from "../application/ports/apiKeyStore";
import type { CandleRepository } from "../application/ports/candleRepository";
import type { FileExporter } from "../application/ports/fileExporter";
import type { FxRateProvider } from "../application/ports/fxRateProvider";
import type { MarketDataProvider } from "../application/ports/marketDataProvider";
import type { SessionRepository } from "../application/ports/sessionRepository";
import { ReplayEngine } from "../domain/replay/replayEngine";
import { browserFileExporter } from "../infrastructure/export/browserFileExporter";
import { tauriFileExporter } from "../infrastructure/export/tauriFileExporter";
import { FrankfurterFxRateProvider } from "../infrastructure/fx/frankfurterFxRateProvider";
import { fetchHttpClient } from "../infrastructure/http/httpClient";
import { tauriHttpClient } from "../infrastructure/http/tauriHttpClient";
import { InMemoryAppSettingsStore } from "../infrastructure/persistence/inMemoryAppSettingsStore";
import { InMemoryCandleRepository } from "../infrastructure/persistence/inMemoryCandleRepository";
import { InMemorySessionRepository } from "../infrastructure/persistence/inMemorySessionRepository";
import { runMigrations } from "../infrastructure/persistence/migrationRunner";
import { SqliteAppSettingsStore } from "../infrastructure/persistence/sqliteAppSettingsStore";
import { SqliteCandleRepository } from "../infrastructure/persistence/sqliteCandleRepository";
import { SqliteSessionRepository } from "../infrastructure/persistence/sqliteSessionRepository";
import { openTauriSqlDatabase } from "../infrastructure/persistence/tauriSqlDatabase";
import { BINANCE_PROVIDER_ID } from "../infrastructure/providers/binance/binanceCatalog";
import { BinanceProvider } from "../infrastructure/providers/binance/binanceProvider";
import { KRX_PUBLIC_DATA_PROVIDER_ID } from "../infrastructure/providers/krxPublicData/krxPublicDataCatalog";
import { KrxPublicDataProvider } from "../infrastructure/providers/krxPublicData/krxPublicDataProvider";
import { TiingoProvider } from "../infrastructure/providers/tiingo/tiingoProvider";
import { TIINGO_PROVIDER_ID } from "../infrastructure/providers/tiingo/tiingoCatalog";
import { InMemoryApiKeyStore } from "../infrastructure/security/inMemoryApiKeyStore";
import { tauriApiKeyStore } from "../infrastructure/security/tauriApiKeyStore";
import {
  getEnvProviderEndpoint,
  getEnvProviderKey,
} from "../infrastructure/security/tauriEnvProviderConfig";
import { createTimeoutReplayScheduler } from "../infrastructure/timers/timeoutReplayScheduler";

export type AppRuntime = "tauri" | "browser-preview";

export interface AppComposition {
  /** providerId -> Provider. 자산마다 다른 Provider(암호화폐+주식)를 섞을 수 있다 (M7). */
  readonly providers: ReadonlyMap<string, MarketDataProvider>;
  readonly repository: CandleRepository;
  readonly sessionRepository: SessionRepository;
  readonly fileExporter: FileExporter;
  readonly apiKeyStore: ApiKeyStore;
  /**
   * .env(개발 편의용)에서 자동 적용된 provider (D-018). 이 목록에 있으면 UI는 수동 입력
   * 필드를 보여주지 않는다 — env 값이 keyring보다 우선하며, 값이 없을 때만 수동 입력이다.
   */
  readonly envManagedProviderIds: ReadonlySet<string>;
  /** 표시/입력 통화 변환 전용 현재 USD/KRW 환율 조회 (D-020). 시뮬레이션 엔진과 무관하다. */
  readonly fxRateProvider: FxRateProvider;
  /** 표시 통화 등 앱 수준 UI 선호값 저장 (D-020) — BYOK 비밀정보와 책임을 분리한다. */
  readonly appSettingsStore: AppSettingsStore;
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
  readonly appSettingsStore: AppSettingsStore;
  readonly runtime: AppRuntime;
}

async function buildPersistence(): Promise<PersistenceBundle> {
  if (isTauri()) {
    const db = await openTauriSqlDatabase();
    await runMigrations(db);
    return {
      repository: new SqliteCandleRepository(db),
      sessionRepository: new SqliteSessionRepository(db),
      appSettingsStore: new SqliteAppSettingsStore(db),
      runtime: "tauri",
    };
  }
  return {
    repository: new InMemoryCandleRepository(),
    sessionRepository: new InMemorySessionRepository(),
    appSettingsStore: new InMemoryAppSettingsStore(),
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
      const { repository, sessionRepository, appSettingsStore, runtime } = await buildPersistence();
      const apiKeyStore: ApiKeyStore =
        runtime === "tauri" ? tauriApiKeyStore : new InMemoryApiKeyStore();
      // CORS가 열려 있어(D-020) 두 런타임 모두 기존 fetchHttpClient로 동작한다.
      const fxRateProvider: FxRateProvider = new FrankfurterFxRateProvider({
        httpClient: fetchHttpClient,
      });

      // BYOK 키는 Provider 생성 시점이 아니라 호출 시점에 읽는다 — setApiKey로 저장한
      // 새 키가 Provider 재생성 없이 즉시 반영되도록 이 mutable 홀더를 공유한다 (D-015).
      const apiKeys = new Map<string, string>();
      for (const providerId of [TIINGO_PROVIDER_ID, KRX_PUBLIC_DATA_PROVIDER_ID]) {
        const key = await apiKeyStore.get(providerId);
        if (key !== null) {
          apiKeys.set(providerId, key);
        }
      }

      // .env(개발 편의용)에 값이 있으면 keyring 값보다 우선 적용하고, 그 provider는
      // envManagedProviderIds에 표시해 UI가 수동 입력 필드를 숨기게 한다 (D-018). 값이
      // 없으면 위에서 읽은 keyring 값(또는 미설정)을 그대로 쓴다 — 기존 BYOK 흐름과 동일하다.
      // `invoke`는 Tauri 런타임에서만 동작하므로 브라우저 프리뷰에서는 시도하지 않는다.
      const envManagedProviderIds = new Set<string>();
      let krxEndpointOverride: string | undefined;
      if (runtime === "tauri") {
        for (const providerId of [TIINGO_PROVIDER_ID, KRX_PUBLIC_DATA_PROVIDER_ID]) {
          const envKey = await getEnvProviderKey(providerId);
          if (envKey !== null) {
            apiKeys.set(providerId, envKey);
            envManagedProviderIds.add(providerId);
          }
        }
        krxEndpointOverride =
          (await getEnvProviderEndpoint(KRX_PUBLIC_DATA_PROVIDER_ID)) ?? undefined;
      }

      const providers = new Map<string, MarketDataProvider>();
      providers.set(BINANCE_PROVIDER_ID, new BinanceProvider({ httpClient: fetchHttpClient }));
      // Tiingo·공공데이터포털 모두 CORS를 지원하지 않아 Tauri HTTP 플러그인이 있는 데스크톱
      // 런타임에서만 동작한다(브라우저 프리뷰는 SQLite 영속성이 없는 것과 같은 종류의 제약, M5 §2).
      if (runtime === "tauri") {
        providers.set(
          TIINGO_PROVIDER_ID,
          new TiingoProvider({
            httpClient: tauriHttpClient,
            getApiKey: () => apiKeys.get(TIINGO_PROVIDER_ID) ?? null,
          }),
        );
        providers.set(
          KRX_PUBLIC_DATA_PROVIDER_ID,
          new KrxPublicDataProvider({
            httpClient: tauriHttpClient,
            getApiKey: () => apiKeys.get(KRX_PUBLIC_DATA_PROVIDER_ID) ?? null,
            baseUrl: krxEndpointOverride,
          }),
        );
      }

      return {
        providers,
        repository,
        sessionRepository,
        fileExporter: runtime === "tauri" ? tauriFileExporter : browserFileExporter,
        apiKeyStore,
        envManagedProviderIds,
        fxRateProvider,
        appSettingsStore,
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
