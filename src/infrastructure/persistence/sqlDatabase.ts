/**
 * SQL 실행 경계. (D-011)
 *
 * 실제 앱에서는 tauri-plugin-sql이, 테스트에서는 better-sqlite3 어댑터가 구현한다.
 * 파라미터 바인딩은 tauri-plugin-sql의 SQLite 규약인 `$1`, `$2`, … 위치 표기를 쓴다.
 *
 * 주의: 구현(연결 풀)에 따라 호출 간 트랜잭션이 보장되지 않는다.
 * 여러 execute에 걸친 쓰기는 실패 시 재실행해도 안전하게(멱등하게) 설계해야 한다.
 */
export interface SqlDatabase {
  execute(sql: string, params?: readonly unknown[]): Promise<void>;
  select<TRow>(sql: string, params?: readonly unknown[]): Promise<TRow[]>;
}
