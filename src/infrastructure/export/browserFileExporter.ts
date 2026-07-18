import type {
  ExportFileRequest,
  ExportFileResult,
  FileExporter,
} from "../../application/ports/fileExporter";

/**
 * 브라우저 프리뷰 전용 다운로드 내보내기. (M5/M6 브라우저 프리뷰 경로와 동일 목적)
 * Blob + 임시 anchor 다운로드만 사용한다 — 실제 데스크톱 실행 경로는 tauriFileExporter를 쓴다.
 */
export const browserFileExporter: FileExporter = {
  exportTextFile(request: ExportFileRequest): Promise<ExportFileResult> {
    const blob = new Blob([request.content], { type: request.mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = request.suggestedFileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return Promise.resolve({ status: "saved", path: request.suggestedFileName });
  },
};
