import { postWorkspacePath } from "./safe-redirect";

export function workspaceEntryPath(redirectUrl: string): string {
  const destination = postWorkspacePath(redirectUrl);
  return destination === "/"
    ? "/select-workspace"
    : `/select-workspace?redirect_url=${encodeURIComponent(destination)}`;
}
