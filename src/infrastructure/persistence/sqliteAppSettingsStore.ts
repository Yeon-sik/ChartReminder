import type { AppSettingsStore } from "../../application/ports/appSettingsStore";
import type { DisplayCurrency } from "../../domain/shared/fxConversion";
import type { SqlDatabase } from "./sqlDatabase";

const DISPLAY_CURRENCY_KEY = "displayCurrency";
const DEFAULT_DISPLAY_CURRENCY: DisplayCurrency = "KRW";

function isDisplayCurrency(value: string): value is DisplayCurrency {
  return value === "KRW" || value === "USD";
}

/**
 * SQLite 앱 설정 저장소. (docs/07 §2 app_settings, D-020)
 *
 * SqliteSessionRepository와 동일한 패턴 — 단순 key/value 한 행.
 */
export class SqliteAppSettingsStore implements AppSettingsStore {
  constructor(private readonly db: SqlDatabase) {}

  async getDisplayCurrency(): Promise<DisplayCurrency> {
    const rows = await this.db.select<{ value: string }>(
      `SELECT value FROM app_settings WHERE key = $1`,
      [DISPLAY_CURRENCY_KEY],
    );
    const value = rows[0]?.value;
    return value !== undefined && isDisplayCurrency(value) ? value : DEFAULT_DISPLAY_CURRENCY;
  }

  async setDisplayCurrency(value: DisplayCurrency): Promise<void> {
    await this.db.execute(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ($1, $2)`, [
      DISPLAY_CURRENCY_KEY,
      value,
    ]);
  }
}
