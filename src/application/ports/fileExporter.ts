export interface ExportFileRequest {
  readonly suggestedFileName: string;
  readonly content: string;
  readonly mimeType: string;
  readonly filterName: string;
  readonly extension: string;
}

export type ExportFileResult =
  { readonly status: "saved"; readonly path: string } | { readonly status: "cancelled" };

/** 텍스트 파일 내보내기 포트. Tauri/브라우저 프리뷰에서 서로 다르게 구현한다. */
export interface FileExporter {
  exportTextFile(request: ExportFileRequest): Promise<ExportFileResult>;
}
