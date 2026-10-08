/**
 * Companies as `@repo/auth` sees them (ADR CM-0002): the Workspace row and
 * memberships. The organization context never touches identity tables.
 */
export type CompanyDirectory = {
  /** Creates the Workspace with `ownerUserId` as its `owner` member. */
  createWorkspace(input: {
    name: string;
    ownerUserId: string;
  }): Promise<{ workspaceId: string }>;
  /** Compensation when the rest of company creation fails. */
  deleteWorkspace(workspaceId: string): Promise<void>;
};

/** Keeps the Workspace name (the switcher's) in step with the profile (CM-115). */
export type CompanyNames = {
  renameWorkspace(workspaceId: string, name: string): Promise<void>;
};
