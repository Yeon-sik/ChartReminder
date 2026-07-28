# 프로젝트 문서와 Notion 미러 운영

이 저장소는 Git Markdown을 원본으로 사용하고, 전용 Notion 페이지를 읽기 전용 미러로 사용한다.

## 준비 상태

- 스킬 소스: `Yeon-sik/notion-project-docs`의 최신 `main` 기준 `maintain-project-docs` (2026-07-28 재적용)
- Canonical branch: `main`
- Publication mode: `manual`
- GitHub Environment: `notion-production`
- 문서 원본:
  - `intro` → `docs/Project_Intro.md`
  - `detail` → `docs/Project_Detail.md`

## 저장소와 게시 경계

현재 문서가 근거로 삼는 사용자 기능은 feature PR #1을 통해 `main` merge commit `2df37d6`에 먼저 병합됐다. 프로젝트 문서·`project-docs.config.json`·`.github/project-docs`·workflow는 `docs/chart-reminder-project-docs` 브랜치에서 별도로 검토한다. 문서가 `main`에 병합되기 전에는 GitHub Actions workflow를 실행할 수 없다.

현재 게시 대상 저장소는 `Yeon-sik/ChartReminder`다. 이전에 원격이 `Yeon-sik/CashOS`를 가리키던 상태에서 설정 도구를 실행했다면 GitHub Environment와 secret은 CashOS에 구성됐을 수 있으므로, 문서 병합 후 ChartReminder 저장소를 기준으로 설정 도구를 다시 실행해야 한다. 기존 Notion 전용 페이지가 비어 있고 구조 조건을 만족한다면 그 페이지를 다시 연결할 수 있다.

## 권장 초기 설정

설치된 스킬 디렉터리에서 다음 설정 도구를 실행하면 Notion 전용 child page 생성과 GitHub Environment·secret 설정을 한 흐름으로 처리할 수 있다.

```powershell
node <skill-directory>/scripts/setup-project-docs.mjs
```

도구는 Notion token과 page ID를 Git에 기록하지 않는다. GitHub CLI 인증과 저장소 관리자 권한이 필요하며, 실제 외부 설정 변경 전에는 표시되는 대상을 확인해야 한다.

이 명령은 미러 목적지와 GitHub 설정을 준비할 뿐 `docs/Project_Intro.md`와 `docs/Project_Detail.md` 본문을 게시하지 않는다. 따라서 생성 직후 페이지가 비어 있는 것은 정상이다. 실제 본문은 문서 runtime이 `main`에 병합된 뒤 `Validate and publish project docs` workflow를 `operation=publish`, `confirmation=PUBLISH`로 실행할 때 채워진다.

`manual` 모드에서는 required reviewer를 우선 설정한다. 비공개 저장소의 GitHub 플랜 제한 때문에 GitHub가 해당 reviewer 설정에 특정 HTTP 422를 반환하면, 도구는 경고와 사용자 확인 후 reviewer 없이 Environment 설정을 계속한다. 이 경우에도 canonical branch 제한과 정확한 `PUBLISH` 확인은 유지되지만, 별도의 Environment 승인 단계는 제공되지 않으므로 보호 수준이 낮다.

## 수동으로 한 번만 설정할 값

GitHub 저장소의 `Settings → Environments → notion-production`에서 다음 Environment secret을 추가한다.

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

## 첫 게시

1. 프로젝트 문서, config, workflow, `.github/project-docs` 런타임을 함께 review하고 `main`에 병합한다.
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
