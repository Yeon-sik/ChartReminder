import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    // vitest 4는 environmentMatchGlobs를 지원하지 않는다 — 전역 jsdom으로 통일한다.
    // 순수 도메인 테스트는 DOM API를 쓰지 않으므로 jsdom 위에서도 그대로 통과한다.
    environment: "jsdom",
    setupFiles: ["src/test/setupJsdom.ts"],
  },
});
