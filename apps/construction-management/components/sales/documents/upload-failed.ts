/**
 * Files a form could not upload after saving ride along to the saved
 * record's page, which names them (as the Daily Worksheet does, CM-602).
 */

const PARAM = "uploadFailed";
const MAX_NAMES = 20;

/** `path` with the names of the files that did not upload, if any. */
export function withUploadFailed(
  path: string,
  failed: readonly string[],
): string {
  if (failed.length === 0) return path;
  const names = encodeURIComponent(failed.slice(0, MAX_NAMES).join("\n"));
  return `${path}?${PARAM}=${names}`;
}

/** The names a page's `uploadFailed` search parameter carries. */
export function uploadFailedNames(value: string | string[] | undefined) {
  if (typeof value !== "string") return [];
  return value
    .split("\n")
    .map((name) => name.trim())
    .filter((name) => name !== "")
    .slice(0, MAX_NAMES);
}

/** "The booking was saved, but form.pdf did not upload. Add it below." */
export function uploadFailedNotice(
  what: string,
  failed: readonly string[],
): string | null {
  if (failed.length === 0) return null;
  return `The ${what} was saved, but ${failed.join(", ")} did not upload. Add ${failed.length === 1 ? "it" : "them"} below.`;
}
