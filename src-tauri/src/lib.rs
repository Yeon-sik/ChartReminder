/// 사용자가 네이티브 저장 대화상자(dialog plugin)로 고른 경로에만 쓴다.
/// fs 플러그인의 광범위한 scope 대신 이 명령 하나로 쓰기 범위를 정확히 그 경로로 제한한다
/// (docs/09 §3 "파일 시스템 범위 최소화"). 앱 자체 명령이라 capability 등록이 필요 없다.
#[tauri::command]
fn write_export_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|error| error.to_string())
}

/// BYOK Provider API 키를 Windows 자격 증명 관리자(OS 보안 저장소)에 저장한다 (D-015, docs/09 §2).
/// 앱은 이 키를 평문 SQLite나 파일에 저장하지 않는다.
/// 저장 키 접두사는 표시명이 아니라 안정적 내부 식별자(investment-replay, D-007/D-014)를 쓴다 —
/// 그래야 표시명이 바뀌어도(D-016) 이미 저장된 키가 유실되지 않는다.
fn api_key_entry(provider_id: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(
        &format!("investment-replay.provider-api-key.{provider_id}"),
        "default",
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_provider_api_key(provider_id: String, api_key: String) -> Result<(), String> {
    api_key_entry(&provider_id)?
        .set_password(&api_key)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn load_provider_api_key(provider_id: String) -> Result<Option<String>, String> {
    match api_key_entry(&provider_id)?.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn clear_provider_api_key(provider_id: String) -> Result<(), String> {
    match api_key_entry(&provider_id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

/// provider별로 자동 적용을 허용하는 .env 변수 이름의 허용 목록. 임의 변수를
/// 프런트엔드에 노출하지 않기 위해 provider_id를 고정된 변수명에만 매핑한다.
fn env_api_key_var(provider_id: &str) -> Option<&'static str> {
    match provider_id {
        "tiingo" => Some("TIINGO_API_KEY"),
        "krx-public-data" => Some("OPEN_API_KEY"),
        _ => None,
    }
}

fn env_endpoint_var(provider_id: &str) -> Option<&'static str> {
    match provider_id {
        "krx-public-data" => Some("OPEN_API_ENDPOINT"),
        _ => None,
    }
}

fn read_nonempty_env(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|value| !value.trim().is_empty())
}

/// .env(개발 편의용, docs/09 §2 — 배포 바이너리에는 값이 없어 아무 효과가 없다)에서
/// BYOK 키를 자동으로 읽는다. 값이 없으면 None을 반환해 프런트엔드가 기존 수동 입력
/// UI(keyring 저장, D-015)로 폴백하게 한다.
#[tauri::command]
fn get_env_provider_key(provider_id: String) -> Option<String> {
    env_api_key_var(&provider_id).and_then(read_nonempty_env)
}

/// 위와 동일한 원칙으로 provider별 엔드포인트 오버라이드(.env)를 읽는다(예: KRX 공공데이터
/// API의 `OPEN_API_ENDPOINT`). 없으면 Provider의 기본 엔드포인트를 그대로 쓴다.
#[tauri::command]
fn get_env_provider_endpoint(provider_id: String) -> Option<String> {
    env_endpoint_var(&provider_id).and_then(read_nonempty_env)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 현재 디렉토리 또는 상위 디렉토리에서 .env를 찾는다(dotenvy 공식 동작) — 저장소 루트의
    // .env가 `src-tauri`를 cwd로 실행돼도 발견된다. 배포된 실행 파일 곁에는 .env가 없으므로
    // 이 호출은 아무 효과가 없다(개발 전용 편의 기능, .env는 Git에 커밋되지 않는다).
    dotenvy::dotenv().ok();

    tauri::Builder::default()
        // SQLite 연결만 플러그인이 담당한다. 스키마 마이그레이션은 TS 러너가 수행한다 (D-011).
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            write_export_file,
            save_provider_api_key,
            load_provider_api_key,
            clear_provider_api_key,
            get_env_provider_key,
            get_env_provider_endpoint
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
