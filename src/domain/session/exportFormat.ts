import type { CurrencyCode } from "../shared/currency";
import type { UtcTimestampMs } from "../shared/time";
import type { PortfolioSnapshot, SimulationAssumptions } from "../simulation/simulationEngine";
import type {
  ReplaySessionRecord,
  SavedSessionConfiguration,
  SavedSessionDataVersions,
} from "./replaySession";

/**
 * 세션 JSON 내보내기 페이로드. (docs/07 §5 — "가정과 데이터 출처를 함께 기록")
 * 저장된 세션(ReplaySessionRecord)이 없어도 진행 중 재생의 현재 설정으로 만들 수 있다.
 */
export interface SessionExportPayload {
  readonly exportedAtUtcMs: UtcTimestampMs;
  readonly schemaVersion: number;
  readonly name: string;
  readonly configuration: SavedSessionConfiguration;
  readonly dataVersions: SavedSessionDataVersions;
}

export function buildSessionExportPayload(
  exportedAtUtcMs: UtcTimestampMs,
  session: Pick<ReplaySessionRecord, "schemaVersion" | "name" | "configuration" | "dataVersions">,
): SessionExportPayload {
  return {
    exportedAtUtcMs,
    schemaVersion: session.schemaVersion,
    name: session.name,
    configuration: session.configuration,
    dataVersions: session.dataVersions,
  };
}

export function serializeSessionExportPayload(payload: SessionExportPayload): string {
  return JSON.stringify(payload, null, 2);
}

/** CSV에 함께 적을 자산 하나의 출처·가정 헤더 정보. */
export interface PortfolioCsvAssetHeader {
  readonly instrumentId: string;
  readonly label: string;
  readonly providerId: string;
  readonly providerSymbol: string;
  readonly quoteCurrency: CurrencyCode;
  readonly assumptions: SimulationAssumptions;
}

export interface PortfolioCsvAssetInput {
  readonly header: PortfolioCsvAssetHeader;
  /** 미래 데이터 비노출을 위해 호출측이 커서까지 자른 스냅샷만 전달해야 한다 (R6). */
  readonly snapshots: readonly PortfolioSnapshot[];
}

const CSV_COLUMNS = [
  "instrumentId",
  "date",
  "contributedCapital",
  "cash",
  "marketValue",
  "totalValue",
  "profitLoss",
  "returnRate",
  "drawdownRate",
  "priceStatus",
] as const;

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function assetHeaderLines(header: PortfolioCsvAssetHeader): string[] {
  const a = header.assumptions;
  return [
    `# asset: ${header.label} (${header.instrumentId})`,
    `# source: provider=${header.providerId} symbol=${header.providerSymbol} currency=${header.quoteCurrency}`,
    `# assumptions: executionPrice=${a.executionPrice} feeRate=${a.feeRate} ` +
      `allowFractionalQuantity=${a.allowFractionalQuantity} dividendPolicy=${a.dividendPolicy} ` +
      `taxIncluded=${a.taxIncluded} slippageIncluded=${a.slippageIncluded}`,
  ];
}

/**
 * 포트폴리오 시계열 CSV. (docs/07 §5)
 *
 * 각 자산 블록 앞에 `#` 주석으로 데이터 출처와 계산 가정을 기록한다.
 * 호출측이 이미 재생 커서까지 잘라 전달한 스냅샷만 받는다 — 이 함수는 자르지 않는다.
 */
export function buildPortfolioCsv(
  generatedAtUtcMs: UtcTimestampMs,
  assets: readonly PortfolioCsvAssetInput[],
): string {
  const lines: string[] = [
    `# Chart Reminder portfolio export`,
    `# generated_at_utc: ${new Date(generatedAtUtcMs).toISOString()}`,
    CSV_COLUMNS.join(","),
  ];

  for (const asset of assets) {
    lines.push(...assetHeaderLines(asset.header));
    for (const snapshot of asset.snapshots) {
      lines.push(
        [
          asset.header.instrumentId,
          snapshot.date,
          snapshot.contributedCapital.amount,
          snapshot.cash.amount,
          snapshot.marketValue.amount,
          snapshot.totalValue.amount,
          snapshot.profitLoss.amount,
          snapshot.returnRate,
          snapshot.drawdownRate,
          snapshot.priceStatus,
        ]
          .map((value) => csvEscape(String(value)))
          .join(","),
      );
    }
  }

  return lines.join("\n") + "\n";
}
