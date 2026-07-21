import type { AppSettingsStore } from "../../application/ports/appSettingsStore";
import type { DisplayCurrency } from "../../domain/shared/fxConversion";

const DEFAULT_DISPLAY_CURRENCY: DisplayCurrency = "KRW";

/** 브라우저 프리뷰 전용 메모리 설정 저장소. (InMemorySessionRepository와 동일 패턴) */
export class InMemoryAppSettingsStore implements AppSettingsStore {
  private displayCurrency: DisplayCurrency = DEFAULT_DISPLAY_CURRENCY;

  getDisplayCurrency(): Promise<DisplayCurrency> {
    return Promise.resolve(this.displayCurrency);
  }

  setDisplayCurrency(value: DisplayCurrency): Promise<void> {
    this.displayCurrency = value;
    return Promise.resolve();
  }
}
