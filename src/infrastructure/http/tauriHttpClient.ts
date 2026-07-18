import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

import type { HttpClient, HttpResponse } from "./httpClient";

/**
 * Tauri HTTP 플러그인 기반 구현. (D-015)
 *
 * Tiingo는 CORS를 허용하지 않아(`Access-Control-Allow-Origin` 미응답, curl로 확인)
 * webview `fetch`(`fetchHttpClient`)로는 호출할 수 없다 — 이 플러그인은 네이티브에서
 * 요청을 실행해 CORS 제약을 받지 않는다. capability로 허용 도메인만 열어둔다
 * (`src-tauri/capabilities/default.json`의 `http:default`).
 */
export const tauriHttpClient: HttpClient = {
  async get(url: string, headers?: Readonly<Record<string, string>>): Promise<HttpResponse> {
    const response = await tauriFetch(url, { method: "GET", headers });
    const body = await response.text();
    return {
      status: response.status,
      body,
      header: (name) => response.headers.get(name),
    };
  },
};
