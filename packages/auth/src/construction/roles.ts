import { createAccessControl } from "better-auth/plugins/access";
import {
  defaultStatements,
  ownerAc,
} from "better-auth/plugins/organization/access";

/**
 * A User's role in a Company (ADR CM-0002). The Owner created the Company;
 * everyone else is a Member, and what a Member may do comes from the
 * Permission Matrix in the `organization` context, not from the role.
 */
export const COMPANY_ROLES = ["owner", "member"] as const;

export type CompanyRole = (typeof COMPANY_ROLES)[number];

export function parseCompanyRole(value: unknown): CompanyRole | null {
  return typeof value === "string" &&
    (COMPANY_ROLES as readonly string[]).includes(value)
    ? (value as CompanyRole)
    : null;
}

/**
 * What `identity.workspaces.institution_type` holds for a Company. The column
 * is Whiteboard's (root ADR-0025); the construction app sets this constant.
 */
export const COMPANY_WORKSPACE_KIND = "construction_company";

/**
 * Better Auth's organization permissions. Only the Owner may manage the
 * Company through Better Auth's own endpoints; Members get none, and every
 * construction route checks the Permission Matrix itself.
 */
export const companyAccessControl = createAccessControl(defaultStatements);

export const companyAccessRoles = {
  owner: companyAccessControl.newRole(ownerAc.statements),
  member: companyAccessControl.newRole({}),
} satisfies Record<CompanyRole, unknown>;
