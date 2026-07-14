---
paths:
  - "src/features/**/*.tsx"
  - "src/components/**/*.tsx"
  - "src/**/*.css"
---

# UI 경로 규칙

- React 컴포넌트에서 API와 SQLite를 직접 호출하지 않는다.
- 미래 시점 데이터를 렌더링·tooltip·접근성 텍스트에 노출하지 않는다.
- 키보드 접근과 focus-visible을 유지한다.
- 로딩, 오류, 빈 상태를 정상 상태만큼 명시적으로 구현한다.
- 금융 가정과 데이터 출처를 사용자에게 보인다.
- 차트 색상만으로 의미를 전달하지 않는다.
