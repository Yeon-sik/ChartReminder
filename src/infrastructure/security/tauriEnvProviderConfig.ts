import { invoke } from "@tauri-apps/api/core";

/**
 * .env(개발 편의용)에서 자동 적용되는 BYOK 설정을 조회한다.
 *
 * Rust(`get_env_provider_key`/`get_env_provider_endpoint`)가 provider_id를 고정된
 * 허용 목록(`TIINGO_API_KEY`, `OPEN_API_KEY`, `OPEN_API_ENDPOINT`)으로만 매핑하므로
 * 임의 환경변수를 읽지 않는다. `.env`는 Git에 커밋되지 않고(docs/09 §2), 배포된 실행
 * 파일 곁에는 존재하지 않으므로 다른 사용자의 앱에서는 항상 null을 반환한다 — 값이 있을
 * 때만 자동 적용하고, 없으면 기존 수동 입력(keyring 저장, D-015) UI로 폴백한다.
 */
export async function getEnvProviderKey(providerId: string): Promise<string | null> {
  return await invoke<string | null>("get_env_provider_key", { providerId });
}

export async function getEnvProviderEndpoint(providerId: string): Promise<string | null> {
  return await invoke<string | null>("get_env_provider_endpoint", { providerId });
}
