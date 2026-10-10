import { fileExtension } from "../files/file-name";

/**
 * Programs, refused by name when an upload starts and by content (`MZ`,
 * ELF, Mach-O) when it completes (ADR CM-0010, CM-0014). Zips are allowed;
 * they are not scanned.
 */
export const PROGRAM_EXTENSIONS = [
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

/** Whether the name's extension is a program's, ignoring case. */
export function isProgramName(fileName: string): boolean {
  const extension = fileExtension(fileName);
  return (
    extension != null &&
    (PROGRAM_EXTENSIONS as readonly string[]).includes(extension)
  );
}
