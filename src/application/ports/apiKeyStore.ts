/**
 * 사용자 소유 Provider API 키 저장 포트. (BYOK, D-015)
 *
 * 앱이 공급자 데이터를 재배포하지 않고, 각 사용자가 자신의 무료 키를 직접 공급자에게
 * 사용하게 한다. 키는 OS 보안 저장소에 보관한다 (docs/09 §2).
 */
export interface ApiKeyStore {
  get(providerId: string): Promise<string | null>;
  set(providerId: string, apiKey: string): Promise<void>;
  clear(providerId: string): Promise<void>;
}
