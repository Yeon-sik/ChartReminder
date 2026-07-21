export interface AppInfo {
  readonly name: string;
  readonly tagline: string;
  readonly milestoneId: string;
  readonly milestoneTitle: string;
  /** 사용자가 실제로 쓸 수 있는 기능 목록. 완료되지 않은 기능을 넣지 않는다. */
  readonly implementedFeatures: readonly string[];
}

export const APP_INFO: AppInfo = {
  name: "Chart Reminder",
  tagline:
    "과거의 특정 시점으로 돌아가 여러 자산에 투자 규칙을 적용했을 때, " +
    "가격과 내 자산가치가 시간에 따라 어떻게 전개됐는지 재생·비교하는 Windows 데스크톱 앱",
  milestoneId: "M5",
  milestoneTitle: "MVP UI",
  implementedFeatures: [
    "자산 1~2개 선택과 기간·표시 기준·투자 모드 설정",
    "일시투자 · 정기 정액매수(매주·매월) 시뮬레이션",
    "가격/정규화 수익률 차트와 투자금 변화 차트",
    "재생·일시정지·한 단계·처음으로·속도 조절",
    "결과 요약(원금·평가액·손익·수익률·MDD)과 계산 가정 표시",
  ],
};
