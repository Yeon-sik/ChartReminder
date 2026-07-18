import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

import type {
  ExportFileRequest,
  ExportFileResult,
  FileExporter,
} from "../../application/ports/fileExporter";

/**
 * Tauri 데스크톱 파일 내보내기. (docs/09 §3 "파일 시스템 범위 최소화")
 *
 * fs 플러그인의 광범위한 scope 권한 대신, 사용자가 네이티브 대화상자로 고른 경로에만
 * `write_export_file` 앱 명령으로 쓴다 — 앱이 임의 경로에 접근할 capability를 갖지 않는다.
 */
export const tauriFileExporter: FileExporter = {
  async exportTextFile(request: ExportFileRequest): Promise<ExportFileResult> {
    const path = await save({
      defaultPath: request.suggestedFileName,
      filters: [{ name: request.filterName, extensions: [request.extension] }],
    });
    if (path === null) {
      return { status: "cancelled" };
    }
    await invoke("write_export_file", { path, contents: request.content });
    return { status: "saved", path };
  },
};
