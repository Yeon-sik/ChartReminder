import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AppComposition } from "../../app/composition";
import type { ApiKeyStore } from "../../application/ports/apiKeyStore";
import type { CandleRepository } from "../../application/ports/candleRepository";
import type { FileExporter } from "../../application/ports/fileExporter";
import type { FxRateProvider } from "../../application/ports/fxRateProvider";
import type { MarketDataProvider } from "../../application/ports/marketDataProvider";
import { ReplayEngine } from "../../domain/replay/replayEngine";
import { InMemoryAppSettingsStore } from "../../infrastructure/persistence/inMemoryAppSettingsStore";
import { InMemorySessionRepository } from "../../infrastructure/persistence/inMemorySessionRepository";
import { InMemoryApiKeyStore } from "../../infrastructure/security/inMemoryApiKeyStore";
import { FakeReplayScheduler } from "../../test/fakeReplayScheduler";
import { ProviderApiKeyField } from "./ProviderApiKeyField";

const unusedProvider: MarketDataProvider = {
  id: "unused",
  searchInstruments: () => Promise.reject(new Error("not used")),
  getCandles: () => Promise.reject(new Error("not used")),
};

const unusedRepository: CandleRepository = {
  findRange: () => Promise.reject(new Error("not used")),
  upsertBatch: () => Promise.reject(new Error("not used")),
};

const unusedFileExporter: FileExporter = {
  exportTextFile: () => Promise.reject(new Error("not used")),
};

const unusedFxRateProvider: FxRateProvider = {
  getUsdKrwRate: () => Promise.reject(new Error("not used")),
};

/** setApiKey/clearApiKey를 실제로 apiKeyStore에 위임하는 composition (composition.ts와 동일 계약). */
function buildComposition(apiKeyStore: ApiKeyStore = new InMemoryApiKeyStore()): AppComposition {
  return {
    providers: new Map([[unusedProvider.id, unusedProvider]]),
    repository: unusedRepository,
    sessionRepository: new InMemorySessionRepository(),
    fileExporter: unusedFileExporter,
    apiKeyStore,
    envManagedProviderIds: new Set(),
    fxRateProvider: unusedFxRateProvider,
    appSettingsStore: new InMemoryAppSettingsStore(),
    runtime: "browser-preview",
    buildReplayEngine: () => new ReplayEngine({ scheduler: new FakeReplayScheduler() }),
    async setApiKey(providerId, apiKey) {
      await apiKeyStore.set(providerId, apiKey);
    },
    async clearApiKey(providerId) {
      await apiKeyStore.clear(providerId);
    },
  };
}

describe("ProviderApiKeyField", () => {
  it("키가 없으면 미설정 상태를 보여준다", async () => {
    render(
      <ProviderApiKeyField
        composition={buildComposition()}
        providerId="tiingo"
        label="Tiingo(미국 주식) API 키"
        signupUrl="tiingo.com"
      />,
    );
    await waitFor(() => expect(screen.getByText("키가 설정되지 않았습니다.")).toBeInTheDocument());
  });

  it("이미 저장된 키가 있으면 설정됨 상태를 보여준다", async () => {
    const apiKeyStore = new InMemoryApiKeyStore();
    await apiKeyStore.set("tiingo", "existing-key");
    render(
      <ProviderApiKeyField
        composition={buildComposition(apiKeyStore)}
        providerId="tiingo"
        label="Tiingo(미국 주식) API 키"
        signupUrl="tiingo.com"
      />,
    );
    await waitFor(() => expect(screen.getByText("키가 설정되어 있습니다.")).toBeInTheDocument());
  });

  it("키를 입력하고 저장하면 설정됨으로 바뀌고 입력창이 비워진다", async () => {
    const apiKeyStore = new InMemoryApiKeyStore();
    render(
      <ProviderApiKeyField
        composition={buildComposition(apiKeyStore)}
        providerId="tiingo"
        label="Tiingo(미국 주식) API 키"
        signupUrl="tiingo.com"
      />,
    );
    await waitFor(() => expect(screen.getByText("키가 설정되지 않았습니다.")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("API 키"), { target: { value: "my-secret-key" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(screen.getByText("키가 설정되어 있습니다.")).toBeInTheDocument());
    expect(await apiKeyStore.get("tiingo")).toBe("my-secret-key");
    expect((screen.getByLabelText("API 키") as HTMLInputElement).value).toBe("");
  });

  it("삭제를 누르면 미설정으로 돌아간다", async () => {
    const apiKeyStore = new InMemoryApiKeyStore();
    await apiKeyStore.set("tiingo", "existing-key");
    render(
      <ProviderApiKeyField
        composition={buildComposition(apiKeyStore)}
        providerId="tiingo"
        label="Tiingo(미국 주식) API 키"
        signupUrl="tiingo.com"
      />,
    );
    await waitFor(() => expect(screen.getByText("키가 설정되어 있습니다.")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "삭제" }));

    await waitFor(() => expect(screen.getByText("키가 설정되지 않았습니다.")).toBeInTheDocument());
    expect(await apiKeyStore.get("tiingo")).toBeNull();
  });

  it("빈 입력으로는 저장 버튼이 비활성화된다", async () => {
    render(
      <ProviderApiKeyField
        composition={buildComposition()}
        providerId="tiingo"
        label="Tiingo(미국 주식) API 키"
        signupUrl="tiingo.com"
      />,
    );
    await waitFor(() => expect(screen.getByText("키가 설정되지 않았습니다.")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
  });

  it("envManaged면 .env 자동 적용 안내만 보여주고 입력 UI는 렌더링하지 않는다 (D-018)", () => {
    render(
      <ProviderApiKeyField
        composition={buildComposition()}
        providerId="tiingo"
        label="Tiingo(미국 주식) API 키"
        signupUrl="tiingo.com"
        envManaged
      />,
    );
    expect(
      screen.getByText(
        "환경변수(.env)에서 자동으로 적용되었습니다. 별도 입력이 필요하지 않습니다.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("API 키")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "저장" })).not.toBeInTheDocument();
  });
});
