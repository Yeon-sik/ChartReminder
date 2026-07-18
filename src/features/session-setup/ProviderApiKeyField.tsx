import { useEffect, useState } from "react";

import type { AppComposition } from "../../app/composition";
import { formatProviderError } from "../replay-workspace/format";
import "./ProviderApiKeyField.css";

export interface ProviderApiKeyFieldProps {
  readonly composition: AppComposition;
  readonly providerId: string;
  readonly label: string;
  readonly signupUrl: string;
}

type Status =
  | { readonly kind: "loading" }
  | { readonly kind: "configured" }
  | { readonly kind: "missing" }
  | { readonly kind: "error"; readonly message: string };

/**
 * BYOK API 키 입력. (D-015, docs/06 §6 "라이선스 또는 인증 설정 필요")
 *
 * 앱은 이 공급자의 데이터를 재배포하지 않는다 — 각자 자신의 무료 키로 직접 조회한다.
 * 외부 URL은 클릭 가능한 링크가 아니라 텍스트로만 보여준다(capability 최소화, docs/09 §3).
 */
export function ProviderApiKeyField({
  composition,
  providerId,
  label,
  signupUrl,
}: ProviderApiKeyFieldProps) {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    composition.apiKeyStore
      .get(providerId)
      .then((key) => {
        if (!cancelled) {
          setStatus({ kind: key === null ? "missing" : "configured" });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setStatus({ kind: "error", message: formatProviderError(error) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [composition, providerId]);

  async function handleSave(): Promise<void> {
    if (input.trim() === "") {
      return;
    }
    setBusy(true);
    try {
      await composition.setApiKey(providerId, input.trim());
      setInput("");
      setStatus({ kind: "configured" });
    } catch (error) {
      setStatus({ kind: "error", message: formatProviderError(error) });
    } finally {
      setBusy(false);
    }
  }

  async function handleClear(): Promise<void> {
    setBusy(true);
    try {
      await composition.clearApiKey(providerId);
      setStatus({ kind: "missing" });
    } catch (error) {
      setStatus({ kind: "error", message: formatProviderError(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="provider-api-key">
      <legend>{label}</legend>
      <p className="provider-api-key__hint">
        무료 개인 키를 발급받아 입력하세요 ({signupUrl}). 앱은 이 키를 이 기기의 OS 보안 저장소에만
        저장하고, 서버로 전송하거나 다른 사용자와 공유하지 않습니다.
      </p>

      {status.kind === "loading" && <p role="status">확인하는 중입니다…</p>}

      {status.kind === "configured" && (
        <p className="provider-api-key__status provider-api-key__status--ok">
          키가 설정되어 있습니다.
        </p>
      )}
      {status.kind === "missing" && (
        <p className="provider-api-key__status provider-api-key__status--missing">
          키가 설정되지 않았습니다.
        </p>
      )}
      {status.kind === "error" && (
        <p role="alert" className="provider-api-key__status provider-api-key__status--missing">
          {status.message}
        </p>
      )}

      <label className="provider-api-key__input-row">
        API 키
        <input
          type="password"
          autoComplete="off"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={busy}
        />
      </label>
      <div className="provider-api-key__actions">
        <button type="button" onClick={handleSave} disabled={busy || input.trim() === ""}>
          저장
        </button>
        <button type="button" onClick={handleClear} disabled={busy || status.kind !== "configured"}>
          삭제
        </button>
      </div>
    </fieldset>
  );
}
