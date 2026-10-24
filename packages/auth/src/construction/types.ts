import type { CompanyRole } from "./roles";

export type CompanyAuthUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  /** E.164, when the User signed in by mobile (ADR CM-0002). */
  phoneNumber: string | null;
  image: string | null;
  /**
   * An admin set their password; until they choose their own, pages send
   * them to Change password and the API answers 403 (ADR CM-0029 §8).
   */
  mustChangePassword: boolean;
};

export type SignedInCompanyAuthState = {
  isAuthenticated: true;
  userId: string;
  sessionId: string;
  /** The Active Company (a Workspace id). Null until the User picks one. */
  workspaceId: string | null;
  role: CompanyRole | null;
  user: CompanyAuthUser;
};

export type SignedOutCompanyAuthState = {
  isAuthenticated: false;
  userId: null;
  sessionId: null;
  workspaceId: null;
  role: null;
  user: null;
};

export type CompanyAuthState =
  SignedInCompanyAuthState | SignedOutCompanyAuthState;

/** A Company the signed-in User belongs to. */
export type CompanySummary = {
  id: string;
  name: string;
  role: CompanyRole;
};

/** What the server hands the browser so `useCompanyAuth()` needs no loading state. */
export type CompanyAuthSnapshot = {
  userId: string | null;
  workspaceId: string | null;
  role: CompanyRole | null;
  user: CompanyAuthUser | null;
  companies: CompanySummary[];
};
