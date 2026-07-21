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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // SQLite 연결만 플러그인이 담당한다. 스키마 마이그레이션은 TS 러너가 수행한다 (D-011).
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            write_export_file,
            save_provider_api_key,
            load_provider_api_key,
            clear_provider_api_key
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
