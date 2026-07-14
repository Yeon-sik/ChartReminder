# 설치 및 확인 명령 — Windows PowerShell

현재 설치 상태를 먼저 확인하고, 없는 것만 설치한다.

## 1. 기본 확인

```powershell
node --version
npm --version
rustc --version
cargo --version
claude --version
```

## 2. TypeScript Language Server

```powershell
npm install -g typescript-language-server typescript
typescript-language-server --version
```

Claude Code 내부에서 공식 marketplace에 해당 플러그인이 존재하는 현재 이름을 확인한 뒤 설치한다.

## 3. Rust Analyzer

```powershell
rustup component add rust-analyzer
rust-analyzer --version
```

## 4. Playwright MCP

PowerShell에서 Claude Code 세션 밖에서 실행한다.

```powershell
claude mcp add playwright -- npx -y @playwright/mcp@latest
claude mcp list
```

중요:

- `--`는 Claude CLI 옵션과 MCP 실행 명령을 분리한다.
- `-y`는 npx 설치 확인을 자동 승인한다.
- 처음에는 패키지 다운로드 때문에 연결 확인이 잠시 실패할 수 있다.

Claude Code 세션 내부에서:

```text
/mcp
```

연결 후 간단한 검증:

```text
Playwright를 사용해 https://example.com 을 열고 페이지 제목만 알려줘.
```

## 5. 프로젝트 범위 연결 선택

이 프로젝트에서만 Playwright를 사용할 경우 프로젝트 루트에서 local scope 기본값으로 추가한다.

여러 프로젝트에서 공통 사용하려면 현재 Claude Code 공식 문서의 `--scope user` 사용법을 확인한 뒤 선택한다.

## 6. 과도한 설치 금지

M0 시점에는 다음을 추가하지 않는다.

- Supabase MCP
- SQLite MCP
- 금융 데이터 MCP
- 출처 불명의 Tauri Skill
- 자동 브라우저 도구 여러 개
