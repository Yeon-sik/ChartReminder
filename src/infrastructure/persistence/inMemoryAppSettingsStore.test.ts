import { describe, expect, it } from "vitest";

import { InMemoryAppSettingsStore } from "./inMemoryAppSettingsStore";

describe("InMemoryAppSettingsStore", () => {
  it("기본값은 KRW다", async () => {
    const store = new InMemoryAppSettingsStore();
    expect(await store.getDisplayCurrency()).toBe("KRW");
  });

  it("저장한 값을 다시 읽을 수 있다", async () => {
    const store = new InMemoryAppSettingsStore();
    await store.setDisplayCurrency("USD");
    expect(await store.getDisplayCurrency()).toBe("USD");
  });
});
