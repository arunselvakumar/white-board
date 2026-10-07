import type { WorkspaceRole } from "./roles";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  username: string | null;
  image: string | null;
};

export type SignedInAuthState = {
  isAuthenticated: true;
  userId: string;
  sessionId: string;
  /** Null until the User picks a Workspace they still belong to. */
  workspaceId: string | null;
  role: WorkspaceRole | null;
  user: AuthUser;
};

export type SignedOutAuthState = {
  isAuthenticated: false;
  userId: null;
  sessionId: null;
  workspaceId: null;
  role: null;
  user: null;
};

export type AuthState = SignedInAuthState | SignedOutAuthState;

/** A Workspace the signed-in User belongs to. */
export type WorkspaceSummary = {
  id: string;
  name: string;
  role: WorkspaceRole;
  institutionType: string;
};

/** What the server hands the browser so `useAuth()` needs no loading state. */
export type AuthSnapshot = {
  userId: string | null;
  workspaceId: string | null;
  role: WorkspaceRole | null;
  user: AuthUser | null;
  workspaces: WorkspaceSummary[];
};
