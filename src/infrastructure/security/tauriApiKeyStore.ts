import { invoke } from "@tauri-apps/api/core";

import type { ApiKeyStore } from "../../application/ports/apiKeyStore";

/**
 * Tauri 데스크톱 API 키 저장. (D-015)
 *
 * Rust `keyring` crate로 Windows 자격 증명 관리자(OS 보안 저장소)에 저장한다
 * (docs/09 §2). 앱은 평문 SQLite에 키를 저장하지 않는다.
 */
export const tauriApiKeyStore: ApiKeyStore = {
  async get(providerId: string): Promise<string | null> {
    return await invoke<string | null>("load_provider_api_key", { providerId });
  },
  async set(providerId: string, apiKey: string): Promise<void> {
    await invoke("save_provider_api_key", { providerId, apiKey });
  },
  async clear(providerId: string): Promise<void> {
    await invoke("clear_provider_api_key", { providerId });
  },
};
