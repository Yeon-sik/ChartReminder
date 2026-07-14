---
paths:
  - "src/infrastructure/**/*.ts"
  - "src-tauri/**/*"
---

# 인프라 경로 규칙

- 외부 응답을 런타임 검증 없이 신뢰하지 않는다.
- 공급자 오류를 도메인/애플리케이션 오류로 매핑한다.
- 비밀정보와 Authorization 값을 로그에 남기지 않는다.
- SQLite 스키마 변경은 마이그레이션으로 수행한다.
- Tauri capability는 최소 권한으로 유지한다.
- 네트워크 테스트는 기본 CI를 불안정하게 만들지 않도록 fixture와 분리한다.
