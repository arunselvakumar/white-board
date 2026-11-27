/**
 * Live Employees per Role (labour context, ADR CM-0055 §2): a Role with
 * Employees on it cannot be deleted. Roles with none are absent.
 */
export type RoleEmployees = {
  counts(workspaceId: string): Promise<Map<string, number>>;
};

/** For tests and seeds that have no Employees. */
export const NO_ROLE_EMPLOYEES: RoleEmployees = {
  counts: () => Promise.resolve(new Map()),
};
