import { fileExtension } from "@/src/shared-kernel/files/file-name";
import { isProgramName } from "@/src/shared-kernel/attachments/program-names";
import {
  DRAWING_MAX_BYTES,
  TESTING_REPORT_MAX_BYTES,
} from "@/src/projects/domain/project-upload-policies";

import { formatBytes } from "./project-documents";

/**
 * What the browser can refuse before a drawing or testing report file
 * starts uploading (CM-408, CM-409): the same names and sizes the server
 * checks first.
 */

export type ProjectUploadKind = "drawing" | "testing_report";

const RULES: Record<
  ProjectUploadKind,
  { extensions: readonly string[]; maxBytes: number; words: string }
> = {
  drawing: {
    extensions: ["pdf", "png", "jpg", "jpeg", "webp", "dwg", "dxf"],
    maxBytes: DRAWING_MAX_BYTES,
    words: "Choose a PDF, an image, a DWG or a DXF file.",
  },
  testing_report: {
    extensions: ["pdf", "png", "jpg", "jpeg", "webp"],
    maxBytes: TESTING_REPORT_MAX_BYTES,
    words: "Choose a PDF or an image (PNG, JPEG, WebP).",
  },
};

/** The `accept` attribute for a file picker. */
export function acceptOf(kind: ProjectUploadKind): string {
  return RULES[kind].extensions.map((extension) => `.${extension}`).join(",");
}

export function maxBytesOf(kind: ProjectUploadKind): number {
  return RULES[kind].maxBytes;
}

export type UploadFileProblem = {
  code: "FILE_TYPE_NOT_ALLOWED" | "FILE_TOO_LARGE" | "FILE_EMPTY";
  message: string;
};

/** Null when the file may go up. */
export function checkUploadFile(
  kind: ProjectUploadKind,
  file: { name: string; size: number },
): UploadFileProblem | null {
  const rule = RULES[kind];
  const extension = fileExtension(file.name);
  if (
    isProgramName(file.name) ||
    extension == null ||
    !rule.extensions.includes(extension)
  )
    return { code: "FILE_TYPE_NOT_ALLOWED", message: rule.words };
  if (file.size === 0)
    return { code: "FILE_EMPTY", message: "This file is empty." };
  if (file.size > rule.maxBytes)
    return {
      code: "FILE_TOO_LARGE",
      message: `Files can be at most ${formatBytes(rule.maxBytes)}.`,
    };
  return null;
}
