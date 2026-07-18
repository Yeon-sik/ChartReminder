import { describe, expect, it } from "vitest";

import { InMemoryApiKeyStore } from "./inMemoryApiKeyStore";

describe("InMemoryApiKeyStore", () => {
  it("저장한 키를 provider별로 왕복 조회한다", async () => {
    const store = new InMemoryApiKeyStore();
    await store.set("tiingo", "secret-key");
    expect(await store.get("tiingo")).toBe("secret-key");
  });

  it("설정하지 않은 provider는 null을 반환한다", async () => {
    const store = new InMemoryApiKeyStore();
    expect(await store.get("tiingo")).toBeNull();
  });

  it("provider별로 독립적으로 저장한다", async () => {
    const store = new InMemoryApiKeyStore();
    await store.set("tiingo", "tiingo-key");
    await store.set("other", "other-key");
    expect(await store.get("tiingo")).toBe("tiingo-key");
    expect(await store.get("other")).toBe("other-key");
  });

  it("clear 이후에는 null을 반환한다", async () => {
    const store = new InMemoryApiKeyStore();
    await store.set("tiingo", "secret-key");
    await store.clear("tiingo");
    expect(await store.get("tiingo")).toBeNull();
  });

  it("덮어쓰면 최신 값을 반환한다", async () => {
    const store = new InMemoryApiKeyStore();
    await store.set("tiingo", "old-key");
    await store.set("tiingo", "new-key");
    expect(await store.get("tiingo")).toBe("new-key");
  });
});
