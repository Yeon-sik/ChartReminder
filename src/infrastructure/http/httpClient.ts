/**
 * 최소 HTTP 클라이언트 경계. Provider adapter가 사용하며,
 * 테스트에서는 fixture 기반 가짜 구현으로 대체한다.
 */
export interface HttpResponse {
  readonly status: number;
  readonly body: string;
  header(name: string): string | null;
}

export interface HttpClient {
  /** 네트워크 수준 실패(연결 불가 등)는 예외를 던진다. HTTP 오류 상태는 응답으로 반환한다. */
  get(url: string): Promise<HttpResponse>;
}

/** 브라우저/webview fetch 기반 구현. CORS가 문제되면 Tauri HTTP 플러그인 구현으로 교체한다. */
export const fetchHttpClient: HttpClient = {
  async get(url: string): Promise<HttpResponse> {
    const response = await fetch(url, { method: "GET" });
    const body = await response.text();
    return {
      status: response.status,
      body,
      header: (name) => response.headers.get(name),
    };
  },
};
