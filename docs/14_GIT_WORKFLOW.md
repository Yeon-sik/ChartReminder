# Git 작업 방식

## 브랜치

```text
main
└─ feat/m0-bootstrap
└─ feat/m1-domain-model
└─ feat/m2-crypto-provider
...
```

각 마일스톤은 가능하면 최신 `main`에서 독립 분기한다.

## 커밋

작고 의미 있는 단위로 커밋한다.

예:

- `chore: scaffold tauri react application`
- `test: add golden portfolio fixtures`
- `feat: normalize binance daily candles`
- `feat: add deterministic replay state machine`

## PR

PR 본문에 다음을 포함한다.

- 목표
- 범위
- 주요 설계 선택
- 테스트
- 스크린샷 또는 녹화
- 남은 위험
- 관련 마일스톤

리뷰 수정은 같은 브랜치에 추가 커밋하고 기존 PR을 유지한다.

## 병합 조건

- required checks 통과
- 미해결 P0/P1 리뷰 없음
- 문서와 PROJECT_STATE 갱신
- squash 여부는 저장소 정책에 따름

## Claude 작업 전후

작업 전:

```powershell
git status
git branch --show-current
git pull --ff-only
```

작업 후:

```powershell
git diff --check
git status
```

Claude가 사용자의 기존 미커밋 변경을 임의로 삭제하거나 덮어쓰면 안 된다.
