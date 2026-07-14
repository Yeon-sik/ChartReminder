# Investment Replay — Claude Code 실행 패키지

이 패키지는 코드가 아니라 **Claude Code가 프로젝트를 일관되게 설계하고 구현하도록 만드는 작업 기준서**다.

## 가장 먼저 할 일

1. 새 프로젝트 폴더를 만든다.
2. 이 ZIP의 내용 전체를 프로젝트 루트에 압축 해제한다. 숨김 폴더인 `.claude`도 포함해야 한다.
3. PowerShell에서 해당 폴더로 이동한다.
4. Git 저장소를 초기화한다.
5. Claude Code를 실행한다.
6. `prompts/00_MASTER_START.md`의 프롬프트를 붙여 넣는다.

```powershell
mkdir investment-replay
cd investment-replay
git init
claude
```

## Claude에게 처음 줄 명령

가장 안전한 방식은 `prompts/00_MASTER_START.md`를 그대로 붙여 넣는 것이다.

Claude가 한 번에 앱 전체를 만들게 하지 않는다. 첫 세션에서는 다음만 수행하게 한다.

- 문서 검토
- 충돌·불명확성 식별
- 기술 전제 검증
- 저장소 스캐폴딩
- 빌드·테스트 기반 구성
- Milestone M0 완료

그 후 각 마일스톤 프롬프트를 순서대로 실행한다.

## 파일 지도

- `GOAL.md`: 제품의 최종 목표와 범위
- `CLAUDE.md`: 모든 Claude Code 세션에 적용되는 핵심 규칙
- `PROJECT_STATE.md`: 현재 진행 상황을 기록하는 단일 상태판
- `docs/`: 제품·아키텍처·기능별 명세
- `prompts/`: Claude에게 단계별로 줄 실행 지시
- `.claude/rules/`: 경로별 개발 규칙
- `.claude/skills/`: 반복 작업용 프로젝트 전용 Skill
- `setup/`: Claude Code, MCP, 플러그인 설치 및 확인 방법

## 중요한 원칙

이 프로젝트의 MVP는 최종적으로 암호화폐와 미국·한국 주식의 일봉 리플레이를 목표로 한다. 그러나 구현 순서는 반드시 다음과 같다.

1. BTC·ETH·SOL만으로 수직 슬라이스 완성
2. 미국 주식 Provider 추가
3. 한국 주식 Provider 추가
4. 통합 MVP 릴리스

이는 범위 축소가 아니라 **위험을 분리한 개발 순서**다.
