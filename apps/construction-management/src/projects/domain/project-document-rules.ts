/**
 * Rules for files kept on a Project (CM-414, ADR CM-0010): any type but
 * executables, at most 25 MB each and 50 per Project, filed under the
 * paper they are a copy of.
 */
export const PROJECT_DOCUMENT_KINDS = [
  "tender",
  "quotation",
  "loa",
  "client_order",
  "agreement",
  "other",
] as const;

export type ProjectDocumentKind = (typeof PROJECT_DOCUMENT_KINDS)[number];

export function isProjectDocumentKind(
  value: string,
): value is ProjectDocumentKind {
  return (PROJECT_DOCUMENT_KINDS as readonly string[]).includes(value);
}

const MB = 1024 * 1024;

export const PROJECT_DOCUMENT_MAX_BYTES = 25 * MB;
export const PROJECT_DOCUMENTS_MAX = 50;

/**
 * Programs, refused by name when the upload starts and by content
 * (`MZ`, ELF, Mach-O) when it completes. Zips are allowed; they are not
 * scanned, and the Documents tab says so.
 */
export const BLOCKED_DOCUMENT_EXTENSIONS = [
  // Native programs and installers.
  "exe",
  "msi",
  "com",
  "scr",
  "pif",
  "cpl",
  "msc",
  "apk",
  "dmg",
  "jar",
  "msix",
  "appx",
  "appimage",
  // Scripts Windows or a shell runs on a double-click; the content check
  // cannot tell these from text, so the name is the only guard.
  "bat",
  "cmd",
  "ps1",
  "vbs",
  "vbe",
  "js",
  "jse",
  "wsf",
  "wsh",
  "hta",
  "sh",
  // Shortcuts and settings files that launch or change things.
  "lnk",
  "scf",
  "reg",
] as const;

/** Files at most this size go up in one request; larger ones in parts. */
export const PROJECT_DOCUMENT_MULTIPART_FROM_BYTES = 8 * MB;
