/**
 * A safe file name to show and to send back in `content-disposition`: the
 * last path segment, without control characters or quotes, at most 200
 * characters; `document.<extension>` when nothing is left.
 */
export function cleanFileName(raw: string | null, extension: string): string {
  const last = (raw ?? "").split(/[\\/]/).at(-1) ?? "";
  // No control characters or quotes: the name goes into a header.
  let base = "";
  for (let index = 0; index < last.length; index += 1) {
    const code = last.charCodeAt(index);
    if (code >= 0x20 && code !== 0x7f && code !== 0x22)
      base += last.charAt(index);
  }
  base = base.trim().slice(0, 200);
  return base.length === 0 ? `document.${extension}` : base;
}

/**
 * The name's extension, lowercased, or null. Trailing dots and spaces are
 * ignored, as Windows ignores them: `setup.exe. ` is an `exe`.
 */
export function fileExtension(name: string): string | null {
  const trimmed = name.replace(/[.\s]+$/, "");
  const dot = trimmed.lastIndexOf(".");
  if (dot < 0) return null;
  const extension = trimmed.slice(dot + 1).toLowerCase();
  return extension.length === 0 ? null : extension;
}
