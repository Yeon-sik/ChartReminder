# Claude Code Project Instructions

## 제품

이 저장소는 Tauri 2 + React + TypeScript 기반의 Windows 데스크톱 투자 리플레이 앱이다. 제품의 기준은 `GOAL.md`다.

## 작업 시작 전

1. `GOAL.md`와 `PROJECT_STATE.md`를 읽는다.
2. 현재 마일스톤의 관련 명세만 읽는다.
3. 기존 코드·테스트·Git 상태를 조사한다.
4. 불명확한 부분은 임의 구현하지 말고 `docs/OPEN_QUESTIONS.md`에 기록한다.
5. 외부 라이브러리 API는 기억으로 추측하지 말고 현재 공식 문서를 확인한다.

## 불변 규칙

- 한 번에 하나의 마일스톤 또는 하나의 명확한 기능만 변경한다.
- 요청받지 않은 기능, 서버, 로그인, AI, Supabase를 추가하지 않는다.
- React 컴포넌트에서 외부 시장 API나 SQLite를 직접 호출하지 않는다.
- Provider 응답을 UI에서 직접 사용하지 않는다. 공통 도메인 모델로 정규화한다.
- 리플레이와 투자 계산은 UI·Tauri·데이터 공급자에 독립적이어야 한다.
- 투자 계산은 결정론적 순수 함수 중심으로 작성한다.
- 금액·가격·수량 계산에서 JavaScript 부동소수점 오차를 방치하지 않는다.
- 도메인 경계에서는 Decimal 또는 문자열 기반 정밀 값을 사용하고, 차트 렌더링 경계에서만 number 변환을 허용한다.
- API 키·토큰·비밀정보를 코드, 로그, 문서, Git에 저장하지 않는다.
- 오류를 삼키지 않는다. 사용자 오류와 시스템 오류를 구분한다.
- 테스트를 통과하지 않은 기능을 완료로 표시하지 않는다.

## 아키텍처 방향

초기에는 단일 저장소의 모듈형 구조를 사용한다. 웹 앱이 실제로 시작되기 전까지 모노레포로 확장하지 않는다.

권장 경계:

- `src/domain`: 순수 타입, 값 객체, 규칙
- `src/application`: 유스케이스와 포트
- `src/infrastructure`: Provider, SQLite, Tauri adapter
- `src/features`: 화면 단위 조합
- `src/components`: 재사용 UI
- `src-tauri`: Tauri 설정과 필요한 최소 네이티브 코드

실제 스캐폴드가 다르면 기존 구조를 존중하되 경계의 의미를 유지한다.

## 검증 명령

프로젝트가 채택한 패키지 매니저와 실제 스크립트를 우선한다. 작업 완료 전 최소한 다음 범주의 검증을 실행한다.

- format
- lint
- typecheck
- unit tests
- integration tests when relevant
- `cargo check`
- production build when milestone requires it

명령이 아직 없다면 해당 마일스톤에서 명시적으로 추가한다.

## 완료 보고 형식

작업 종료 시 다음을 보고한다.

1. 변경한 목표
2. 변경 파일
3. 핵심 설계 선택과 이유
4. 실행한 검증 명령과 결과
5. 남은 위험·미해결 사항
6. `PROJECT_STATE.md` 갱신 내용

## 금지

- 전체 앱을 한 번에 구현
- 테스트 삭제 또는 완화로 통과 처리
- `any`, 무분별한 타입 단언, 임의의 mock 결과로 문제 은폐
- 문서와 구현이 불일치한 상태에서 완료 선언
- 라이선스가 불명확한 시장 데이터를 앱에 내장·재배포
