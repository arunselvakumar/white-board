import { requireWorkspaceSession } from "./require-workspace-session";

export type ApiSession = {
  userId: string;
  workspaceId: string;
};

/** The Owner of the Active Workspace (the register's screens and APIs). */
export async function requireSession(): Promise<ApiSession | Response> {
  const session = await requireWorkspaceSession(
    ["owner"],
    "Owner access is required.",
  );
  if (session instanceof Response) return session;
  return { userId: session.userId, workspaceId: session.workspaceId };
}

export function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}
