import { createAccessControl } from "better-auth/plugins/access";
import {
  defaultStatements,
  ownerAc,
} from "better-auth/plugins/organization/access";

/**
 * A User's role in a Workspace (ADR-0034). The Owner created the Workspace;
 * Teachers, Students, and Parents join by invitation. There is no other role.
 */
export const WORKSPACE_ROLES = [
  "owner",
  "teacher",
  "student",
  "parent",
] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

/** Roles an Owner may invite. Nobody can be invited as a second Owner. */
export const INVITABLE_ROLES = ["teacher", "student", "parent"] as const;

export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export function parseWorkspaceRole(value: unknown): WorkspaceRole | null {
  return typeof value === "string" &&
    (WORKSPACE_ROLES as readonly string[]).includes(value)
    ? (value as WorkspaceRole)
    : null;
}

export function isInvitableRole(value: unknown): value is InvitableRole {
  return (
    typeof value === "string" &&
    (INVITABLE_ROLES as readonly string[]).includes(value)
  );
}

export function isOwner(role: WorkspaceRole | null | undefined): boolean {
  return role === "owner";
}

export function isStaff(role: WorkspaceRole | null | undefined): boolean {
  return role === "owner" || role === "teacher";
}

export function isFamily(role: WorkspaceRole | null | undefined): boolean {
  return role === "student" || role === "parent";
}

/**
 * Better Auth's organization permissions. Only the Owner may manage the
 * Workspace, its members, and its invitations through Better Auth's own
 * endpoints. Teachers, Students, and Parents get no organization permissions;
 * what they can do in the register is decided by our own routes.
 */
export const accessControl = createAccessControl(defaultStatements);

export const accessRoles = {
  owner: accessControl.newRole(ownerAc.statements),
  teacher: accessControl.newRole({}),
  student: accessControl.newRole({}),
  parent: accessControl.newRole({}),
} satisfies Record<WorkspaceRole, unknown>;
