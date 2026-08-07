# 프로젝트 문서와 Notion 미러 운영

이 저장소는 Git Markdown을 원본으로 사용하고, 전용 Notion 페이지를 읽기 전용 미러로 사용한다.

## 준비 상태

- 스킬 소스: `Yeon-sik/notion-project-docs`의 `a2371f0` 기준 `maintain-project-docs` (2026-08-08 재확인)
- Canonical branch: `main`
- Publication mode: `manual`
- GitHub Environment: `notion-production`
- 원격 구성: `main` deployment policy, required reviewer, `NOTION_TOKEN`·`NOTION_PAGE_IDS_JSON` secret 이름 확인. 값은 조회하거나 Git에 기록하지 않는다.
- 마지막 확인된 실제 게시: [Actions run 30327719825](https://github.com/Yeon-sik/ChartReminder/actions/runs/30327719825), source `95eeb4459239951327950a053c4a643897df9fb4`
- 문서 원본:
  - `intro` → `docs/Project_Intro.md`
  - `detail` → `docs/Project_Detail.md`

## 저장소와 게시 경계

현재 앱 구현 기준은 Binance 활성 USDT 현물 전체 탐색을 포함한 `main` merge commit `078de188388fe9fdd8c75f4a2ad012fe8ea05ee8`이다. 프로젝트 문서·`project-docs.config.json`·`.github/project-docs`·workflow는 이미 `main`에 추적돼 있으며, 이후 게시도 canonical `main`의 검토된 revision만 사용한다.

현재 게시 대상 저장소는 `Yeon-sik/ChartReminder`다. `notion-production` Environment와 필수 secret 이름, 2026-07-28 실제 게시 성공을 확인했다. 다른 저장소의 page map이나 미러 페이지를 재사용하지 않으며, 페이지 제목·source repository·source commit이 ChartReminder와 일치하지 않으면 게시를 중단한다.

## 권장 초기 설정

새로 연결하거나 page map을 교체할 때만 설치된 스킬 디렉터리에서 다음 설정 도구를 실행한다. `--target`은 스킬 디렉터리가 아니라 자동화가 설치된 ChartReminder 저장소 루트를 명시해야 한다.

```powershell
node <skill-directory>/scripts/setup-project-docs.mjs --target C:\Github\ChartReminder
```

도구는 Notion token과 page ID를 Git에 기록하지 않는다. GitHub CLI 인증과 저장소 관리자 권한이 필요하며, 실제 외부 설정 변경 전에는 표시되는 대상을 확인해야 한다.

기본 선택된 **initial content publication** 옵션은 clean·tracked canonical source와 원격 tip이 일치할 때 미러 목적지·GitHub 설정을 준비한 뒤 `docs/Project_Intro.md`와 `docs/Project_Detail.md` 본문도 한 번 게시한다. 연결만 구성하려면 이 옵션을 해제한다. 최초 연결 이후의 모든 본문 갱신은 `Validate and publish project docs` workflow를 `operation=publish`, `confirmation=PUBLISH`로 실행한다.

`manual` 모드에서는 required reviewer를 우선 설정한다. 비공개 저장소의 GitHub 플랜 제한 때문에 GitHub가 해당 reviewer 설정에 특정 HTTP 422를 반환하면, 도구는 경고와 사용자 확인 후 reviewer 없이 Environment 설정을 계속한다. 이 경우에도 canonical branch 제한과 정확한 `PUBLISH` 확인은 유지되지만, 별도의 Environment 승인 단계는 제공되지 않으므로 보호 수준이 낮다.

## 수동 설정 또는 복구 시 필요한 값

현재 ChartReminder Environment에는 두 secret 이름이 모두 존재한다. 토큰 회전, page map 교체, 새 저장소 설정 때만 `Settings → Environments → notion-production`에서 값을 다시 구성한다.

| Secret | 값 |
| --- | --- |
| `NOTION_TOKEN` | read-content와 update-content 권한을 가진 Notion integration token |
| `NOTION_PAGE_IDS_JSON` | `{"intro":"소개 페이지 ID","detail":"상세 페이지 ID"}` 형식의 JSON |

각 page ID는 수동 메모, child page, database가 없는 전용 미러 페이지여야 한다. 두 페이지를 모두 Notion integration에 공유한다.

Environment의 deployment branch는 `main`만 허용하고, 저장소와 GitHub 플랜이 지원하면 `manual` 모드에서 required reviewer를 지정한다. Secret 값과 실제 page ID는 Git에 커밋하지 않는다.

## 평소 작업 지시

문서만 갱신하고 게시하지 않을 때:

```text
$maintain-project-docs로 현재 저장소의 코드, 테스트, 배포 증거를 다시 확인해
docs/Project_Intro.md와 docs/Project_Detail.md를 갱신하고 검증만 실행해.
Notion에는 게시하지 마.
```

검토가 끝난 canonical revision을 게시할 때:

```text
$maintain-project-docs로 main의 프로젝트 문서를 검증하고,
GitHub Actions의 프로젝트 문서 workflow를 publish / PUBLISH로 실행해.
실행 결과와 두 Notion 페이지의 source fingerprint를 확인해.
```

Codex의 전역 스킬이 없는 다른 머신에서는 `Yeon-sik/notion-project-docs` 저장소의 `skills/maintain-project-docs`를 먼저 설치한다. GitHub Actions는 저장소에 고정된 `.github/project-docs` 런타임을 사용하므로 로컬 스킬 설치와 독립적이다.

## 로컬 검증

```powershell
node .github/project-docs/validate-project-docs.mjs --config project-docs.config.json
node .github/project-docs/sync-project-docs-to-notion.mjs --config project-docs.config.json
```

두 번째 명령은 render-only dry run이며 Notion을 수정하지 않는다. 로컬 대화형 작업에서는 `--apply`를 사용하지 않는다.

Git에 추가된 revision에서는 다음 tracked-file 검증도 통과해야 한다.

```powershell
node .github/project-docs/validate-project-docs.mjs --config project-docs.config.json --require-tracked
```

## 수동 게시

1. 프로젝트 문서, config, workflow, `.github/project-docs` 런타임을 함께 검토하고 `main`에 반영한다.
2. GitHub Actions에서 `Validate and publish project docs` workflow를 연다.
3. `operation=validate`를 실행해 문서·링크·render dry run을 확인한다.
4. `operation=publish`, `confirmation=PUBLISH`로 다시 실행한다.
5. `notion-production` Environment 승인을 완료한다.
6. Actions summary의 source revision·fingerprint와 두 Notion 페이지 전체 내용을 확인한다.

## 실패와 복구

- **페이지 접근 실패**: integration 공유와 page map을 수정한 뒤 같은 revision을 재실행한다. preflight가 실패하면 쓰기는 시작되지 않아야 한다.
- **부분 게시**: Notion을 수동 수정하지 않고 같은 revision을 다시 실행한다. 이미 일치하는 페이지는 건너뛴다.
- **잘못된 내용**: Git Markdown을 수정·검토한 뒤 새 revision을 게시한다.
- **토큰 노출**: 토큰을 즉시 폐기하고 Git history 노출 여부를 확인한 뒤 Environment secret을 교체한다.
- **Unknown block 또는 child content**: 전용 빈 미러 페이지로 옮긴다. 자동 삭제를 허용하지 않는다.
