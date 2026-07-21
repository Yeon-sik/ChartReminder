import { useState } from "react";

import type { AppComposition } from "../../app/composition";
import type { DisplayCurrency, UsdKrwRate } from "../../domain/shared/fxConversion";
import { ProviderApiKeyField } from "../session-setup/ProviderApiKeyField";
import { KRX_PUBLIC_DATA_PROVIDER_ID } from "../../infrastructure/providers/krxPublicData/krxPublicDataCatalog";
import { TIINGO_PROVIDER_ID } from "../../infrastructure/providers/tiingo/tiingoCatalog";
import "./SettingsScreen.css";

export interface SettingsScreenProps {
  readonly composition: AppComposition;
  readonly displayCurrency: DisplayCurrency;
  readonly usdKrwRate: UsdKrwRate | null;
  readonly rateError: string | null;
  readonly rateLoading: boolean;
  readonly onDisplayCurrencyChange: (value: DisplayCurrency) => void;
  readonly onRefreshRate: () => void;
}

const DISPLAY_CURRENCY_LABELS: Record<DisplayCurrency, string> = {
  KRW: "KRW (원)",
  USD: "USD (USDT는 1:1로 간주)",
};

/** 설정 탭: 표시 통화, 현재 환율, BYOK API 키. (D-020) */
export function SettingsScreen({
  composition,
  displayCurrency,
  usdKrwRate,
  rateError,
  rateLoading,
  onDisplayCurrencyChange,
  onRefreshRate,
}: SettingsScreenProps) {
  const [savingCurrency, setSavingCurrency] = useState(false);
  const hasTiingo = composition.providers.has(TIINGO_PROVIDER_ID);
  const hasKrxPublicData = composition.providers.has(KRX_PUBLIC_DATA_PROVIDER_ID);

  async function handleCurrencyChange(value: DisplayCurrency): Promise<void> {
    setSavingCurrency(true);
    try {
      await composition.appSettingsStore.setDisplayCurrency(value);
      onDisplayCurrencyChange(value);
    } finally {
      setSavingCurrency(false);
    }
  }

  return (
    <div className="settings-screen">
      <h1>설정</h1>

      <fieldset className="settings-screen__currency">
        <legend>표시 통화</legend>
        <p className="settings-screen__hint">
          투자 금액 입력과 결과 화면(투자금 변화·결과 요약)에 쓰이는 통화입니다. 자산의 실제 계산은
          항상 그 자산 고유 통화로 이뤄지고, 이 값은 표시/입력 시에만 환산에 쓰입니다.
        </p>
        {(Object.keys(DISPLAY_CURRENCY_LABELS) as DisplayCurrency[]).map((currency) => (
          <label key={currency} className="settings-screen__radio">
            <input
              type="radio"
              name="display-currency"
              checked={displayCurrency === currency}
              disabled={savingCurrency}
              onChange={() => void handleCurrencyChange(currency)}
            />
            {DISPLAY_CURRENCY_LABELS[currency]}
          </label>
        ))}

        <div className="settings-screen__rate">
          {rateLoading && <p role="status">환율을 조회하는 중입니다…</p>}
          {!rateLoading && usdKrwRate !== null && (
            <p>
              1 USD = {usdKrwRate.krwPerUsd} KRW (
              {new Date(usdKrwRate.asOfUtcMs).toISOString().slice(0, 10)} 기준, 출처: Frankfurter)
            </p>
          )}
          {!rateLoading && rateError !== null && (
            <p role="alert" className="settings-screen__rate-error">
              {rateError}
            </p>
          )}
          <button type="button" onClick={onRefreshRate} disabled={rateLoading}>
            환율 새로고침
          </button>
        </div>
      </fieldset>

      {hasTiingo && (
        <ProviderApiKeyField
          composition={composition}
          providerId={TIINGO_PROVIDER_ID}
          label="Tiingo(미국 주식) API 키"
          signupUrl="tiingo.com"
          envManaged={composition.envManagedProviderIds.has(TIINGO_PROVIDER_ID)}
        />
      )}
      {hasKrxPublicData && (
        <ProviderApiKeyField
          composition={composition}
          providerId={KRX_PUBLIC_DATA_PROVIDER_ID}
          label="공공데이터포털(한국 주식) API 키"
          signupUrl="data.go.kr"
          note="마이페이지에서 발급된 두 키 중 '일반 인증키(Decoding)' 값을 입력하세요. 'Encoding' 값을 넣으면 인증에 실패합니다."
          envManaged={composition.envManagedProviderIds.has(KRX_PUBLIC_DATA_PROVIDER_ID)}
        />
      )}
      {!hasTiingo && !hasKrxPublicData && (
        <p className="settings-screen__hint">
          미국·한국 주식 Provider는 Tauri 데스크톱 런타임에서만 활성화됩니다(브라우저 미리보기에서는
          표시되지 않습니다).
        </p>
      )}
    </div>
  );
}
