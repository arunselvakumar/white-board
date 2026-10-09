/**
 * A message for the next screen of one Project, e.g. files that failed to
 * upload after Add Project. It lives in memory, so it survives a client-side
 * navigation and is gone on reload.
 */
const flashes = new Map<string, string>();

export function setProjectFlash(projectId: string, message: string): void {
  flashes.set(projectId, message);
}

export function peekProjectFlash(projectId: string): string | null {
  return flashes.get(projectId) ?? null;
}

export function clearProjectFlash(projectId: string): void {
  flashes.delete(projectId);
}

/** "2 files couldn't upload. Add them again from Documents." */
export function failedUploadsMessage(count: number): string {
  return count === 1
    ? "1 file couldn't upload. Add it again from Documents."
    : `${String(count)} files couldn't upload. Add them again from Documents.`;
}
