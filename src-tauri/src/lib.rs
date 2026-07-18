/// 사용자가 네이티브 저장 대화상자(dialog plugin)로 고른 경로에만 쓴다.
/// fs 플러그인의 광범위한 scope 대신 이 명령 하나로 쓰기 범위를 정확히 그 경로로 제한한다
/// (docs/09 §3 "파일 시스템 범위 최소화"). 앱 자체 명령이라 capability 등록이 필요 없다.
#[tauri::command]
fn write_export_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // SQLite 연결만 플러그인이 담당한다. 스키마 마이그레이션은 TS 러너가 수행한다 (D-011).
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![write_export_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
