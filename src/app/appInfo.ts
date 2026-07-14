export interface AppInfo {
  /** 임시 제품명. 최종 제품명은 OQ-001에서 확정한다. */
  readonly name: string;
  readonly tagline: string;
  readonly milestoneId: string;
  readonly milestoneTitle: string;
  /** 사용자가 실제로 쓸 수 있는 기능 목록. 완료되지 않은 기능을 넣지 않는다. */
  readonly implementedFeatures: readonly string[];
}

export const APP_INFO: AppInfo = {
  name: "Investment Replay",
  tagline:
    "과거의 특정 시점으로 돌아가 여러 자산에 투자 규칙을 적용했을 때, " +
    "가격과 내 자산가치가 시간에 따라 어떻게 전개됐는지 재생·비교하는 Windows 데스크톱 앱",
  milestoneId: "M0",
  milestoneTitle: "저장소 기반과 기술 검증",
  implementedFeatures: [],
};
