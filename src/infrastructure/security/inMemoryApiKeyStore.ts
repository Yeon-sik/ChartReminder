import type { ApiKeyStore } from "../../application/ports/apiKeyStore";

/**
 * 브라우저 프리뷰 전용 메모리 키 저장(영속성 없음). (Playwright 검증 전용 경로,
 * `InMemoryCandleRepository`와 동일한 제약 — M5 §2)
 */
export class InMemoryApiKeyStore implements ApiKeyStore {
  private readonly keys = new Map<string, string>();

  get(providerId: string): Promise<string | null> {
    return Promise.resolve(this.keys.get(providerId) ?? null);
  }

  set(providerId: string, apiKey: string): Promise<void> {
    this.keys.set(providerId, apiKey);
    return Promise.resolve();
  }

  clear(providerId: string): Promise<void> {
    this.keys.delete(providerId);
    return Promise.resolve();
  }
}
