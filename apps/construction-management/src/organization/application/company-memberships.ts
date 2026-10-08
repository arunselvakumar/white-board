/** Membership changes in `@repo/auth` (ADR CM-0002). */
export type CompanyMemberships = {
  addMember(input: { workspaceId: string; userId: string }): Promise<void>;
  removeMember(input: { workspaceId: string; userId: string }): Promise<void>;
};
