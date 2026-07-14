import { describe, expect, it } from "vitest";

import { APP_INFO } from "./appInfo";

// M0 시점의 스모크 테스트: 테스트 인프라가 동작하는지와
// 시작 화면이 표시하는 앱 정보의 불변조건을 검증한다.
describe("APP_INFO", () => {
  it("이름과 설명이 비어 있지 않다", () => {
    expect(APP_INFO.name.trim()).not.toBe("");
    expect(APP_INFO.tagline.trim()).not.toBe("");
  });

  it("마일스톤 ID가 M<숫자> 형식이다", () => {
    expect(APP_INFO.milestoneId).toMatch(/^M\d+$/);
    expect(APP_INFO.milestoneTitle.trim()).not.toBe("");
  });

  it("M0에서는 구현 완료로 표시된 기능이 없다", () => {
    expect(APP_INFO.implementedFeatures).toHaveLength(0);
  });
});
