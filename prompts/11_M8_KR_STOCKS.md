# M8 — 한국 주식 Provider

```text
@CLAUDE.md, @docs/03_MARKET_DATA_SPEC.md, @docs/09_SECURITY_AND_DATA_LICENSING.md, @docs/10_MILESTONES.md의 M8, @docs/OPEN_QUESTIONS.md를 읽어라.

한국 주식 데이터 공급자와 API 이용조건을 현재 공식 문서로 검증하라. 특히 개인 계정 사용과 제3자에게 배포되는 앱의 시세 표시·캐시·재배포 조건을 분리해 판단하라.

이용조건이 공개 배포를 허용하는지 확인되지 않으면 기능을 개인 개발 모드 뒤 feature flag에 두고 공개 릴리스 대상으로 표시하지 마라.

M8 범위:
- 한국 종목코드와 시장 metadata
- KST 거래일과 휴장일
- KRW 표시
- 안전한 사용자 인증정보 입력·보관 방식
- Provider adapter와 계약 테스트
- 수정주가 또는 기업행동 정책 표시
- 기존 리플레이·시뮬레이션 엔진 변경 최소화

비밀키를 코드, .env 배포본, 로그, SQLite 평문에 저장하지 마라.

완료 후 공개 가능 범위와 개인용 범위를 명확히 보고하고 PROJECT_STATE와 데이터 이용조건 문서를 갱신하라.
```
