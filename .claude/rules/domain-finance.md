---
paths:
  - "src/domain/**/*.ts"
  - "src/application/**/*.ts"
---

# 금융 도메인 경로 규칙

- 순수 함수와 불변 데이터를 우선한다.
- React, Tauri, SQLite, fetch를 import하지 않는다.
- 금액·가격·수량 누적 계산에 일반 number를 사용하지 않는다.
- 반올림 시점과 방식은 명시한다.
- 같은 입력은 같은 출력을 만들어야 한다.
- 정상, 경계, 오류 테스트를 함께 추가한다.
