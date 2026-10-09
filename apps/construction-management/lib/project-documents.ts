import {
  BLOCKED_DOCUMENT_EXTENSIONS,
  PROJECT_DOCUMENT_KINDS,
  PROJECT_DOCUMENT_MAX_BYTES,
  type ProjectDocumentKind,
} from "@/src/projects/domain/project-document-rules";
import { fileExtension } from "@/src/shared-kernel/files/file-name";

/**
 * Pure helpers for Project Documents on screen (CM-414): the papers' names,
 * sizes, file kinds and the checks the browser makes before any byte moves.
 */

/** The paper a file is filed under, as screens name it (CONTEXT.md). */
export const PROJECT_DOCUMENT_KIND_LABELS: Record<ProjectDocumentKind, string> =
  {
    tender: "Tender / RFQ ref.",
    quotation: "Quotation",
    loa: "LOA",
    client_order: "PO / WO",
    agreement: "Agreement",
    other: "Other",
  };

/** Paper order: the order the papers happen in, Other last. */
export const PROJECT_DOCUMENT_KIND_ORDER = PROJECT_DOCUMENT_KINDS;

const KB = 1024;
const MB = 1024 * KB;
const GB = 1024 * MB;

function oneDecimal(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** `1_258_291` → "1.2 MB"; "25 MB", "340 KB", "512 B". */
export function formatBytes(bytes: number): string {
  if (bytes < KB) return `${String(Math.max(0, Math.round(bytes)))} B`;
  if (bytes < MB) return `${String(Math.round(bytes / KB))} KB`;
  if (bytes < GB) return `${oneDecimal(bytes / MB)} MB`;
  return `${oneDecimal(bytes / GB)} GB`;
}

/** "5 files · 6.8 MB", "1 file · 340 KB". */
export function documentsSummary(count: number, totalBytes: number): string {
  const files = count === 1 ? "1 file" : `${String(count)} files`;
  return `${files} · ${formatBytes(totalBytes)}`;
}

export type DocumentFileProblem = {
  code: "FILE_TYPE_NOT_ALLOWED" | "FILE_TOO_LARGE" | "FILE_EMPTY";
  message: string;
};

export function isProgramFileName(fileName: string): boolean {
  const extension = fileExtension(fileName);
  return (
    extension != null &&
    (BLOCKED_DOCUMENT_EXTENSIONS as readonly string[]).includes(extension)
  );
}

/**
 * What the server would refuse at the start of an upload, caught in the
 * browser so an obvious mistake fails at once: a program by its name, an
 * empty file, or one over 25 MB. Null when the file may go up.
 */
export function checkDocumentFile(file: {
  name: string;
  size: number;
}): DocumentFileProblem | null {
  if (isProgramFileName(file.name))
    return {
      code: "FILE_TYPE_NOT_ALLOWED",
      message: "Programs can't be kept on a Project.",
    };
  if (file.size === 0)
    return { code: "FILE_EMPTY", message: "This file is empty." };
  if (file.size > PROJECT_DOCUMENT_MAX_BYTES)
    return {
      code: "FILE_TOO_LARGE",
      message: `Files can be at most ${formatBytes(PROJECT_DOCUMENT_MAX_BYTES)}.`,
    };
  return null;
}

/** Which icon a file gets, by what it is. */
export type DocumentFileType =
  "pdf" | "image" | "archive" | "spreadsheet" | "drawing" | "text" | "file";

const TYPES_BY_EXTENSION: Record<string, DocumentFileType> = {
  pdf: "pdf",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  gif: "image",
  heic: "image",
  heif: "image",
  bmp: "image",
  tif: "image",
  tiff: "image",
  zip: "archive",
  rar: "archive",
  "7z": "archive",
  tar: "archive",
  gz: "archive",
  xls: "spreadsheet",
  xlsx: "spreadsheet",
  xlsm: "spreadsheet",
  ods: "spreadsheet",
  csv: "spreadsheet",
  dwg: "drawing",
  dxf: "drawing",
  skp: "drawing",
  doc: "text",
  docx: "text",
  odt: "text",
  rtf: "text",
  txt: "text",
};

/**
 * A PDF or image by its sniffed content type first (the server's word),
 * then by the name's extension.
 */
export function documentFileType(
  fileName: string,
  contentType?: string,
): DocumentFileType {
  if (contentType === "application/pdf") return "pdf";
  if (contentType?.startsWith("image/") === true) return "image";
  const extension = fileExtension(fileName);
  return (extension != null ? TYPES_BY_EXTENSION[extension] : null) ?? "file";
}

const CALENDAR = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const INSTANT = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

/** "1.2 MB · Karthik R · 4 Mar 2026", or "1.2 MB · 4 Mar 2026" without a name. */
export function documentMeta(document: {
  bytes: number;
  createdAt: string;
  createdByName: string | null;
}): string {
  return [
    formatBytes(document.bytes),
    document.createdByName,
    INSTANT.format(new Date(document.createdAt)),
  ]
    .filter((part) => part != null && part.length > 0)
    .join(" · ");
}

/** The Contract Details a paper's number and date come from. */
export type PaperReferences = {
  tenderRef: string | null;
  quotationNo: string | null;
  quotationDate: string | null;
  loaNo: string | null;
  loaDate: string | null;
  clientOrderNo: string | null;
  clientOrderDate: string | null;
  agreementNo: string | null;
  agreementDate: string | null;
};

function calendar(value: string | null): string | null {
  return value == null ? null : CALENDAR.format(new Date(`${value}T00:00:00Z`));
}

/**
 * The paper's number and date from the Project, e.g.
 * `["SBD/WO/2026/057", "12 Mar 2026"]`; empty for Other or when not filled.
 */
export function paperReference(
  kind: ProjectDocumentKind,
  project: PaperReferences,
): string[] {
  const pairs: Record<ProjectDocumentKind, (string | null)[]> = {
    tender: [project.tenderRef],
    quotation: [project.quotationNo, calendar(project.quotationDate)],
    loa: [project.loaNo, calendar(project.loaDate)],
    client_order: [project.clientOrderNo, calendar(project.clientOrderDate)],
    agreement: [project.agreementNo, calendar(project.agreementDate)],
    other: [],
  };
  return pairs[kind].filter(
    (part): part is string => part != null && part.trim().length > 0,
  );
}

/** Files grouped by paper, in paper order; papers without files are left out. */
export function groupDocumentsByKind<T extends { kind: ProjectDocumentKind }>(
  items: readonly T[],
): { kind: ProjectDocumentKind; items: T[] }[] {
  return PROJECT_DOCUMENT_KIND_ORDER.map((kind) => ({
    kind,
    items: items.filter((item) => item.kind === kind),
  })).filter((group) => group.items.length > 0);
}
