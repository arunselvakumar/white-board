/**
 * Files a form could not upload after saving ride along to the saved
 * record's page, which names them (as the Daily Worksheet does).
 */

const PARAM = "uploadFailed";
const MAX_NAMES = 20;

/**
 * The query that names the files that did not upload, or "" when every file
 * did; the third argument of `pageHref` for the saved record's page.
 */
export function uploadFailedQuery(
  failed: readonly string[],
): "" | `?${typeof PARAM}=${string}` {
  if (failed.length === 0) return "";
  const names = encodeURIComponent(failed.slice(0, MAX_NAMES).join("\n"));
  return `?${PARAM}=${names}`;
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
