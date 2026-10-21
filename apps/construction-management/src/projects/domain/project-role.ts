import { DomainError } from "@/src/shared-kernel/domain-error";

import type { ProjectModuleKey } from "./project-modules";

/**
 * A Project's Role (ADR CM-0023 §2): Contract work is built for a Client,
 * who is billed; Own development is built by the Company to sell or keep.
 * The Role drives the ITC defaults, the promoter scheme and which modules a
 * new Project starts with.
 */
export const PROJECT_ROLES = [
  {
    key: "contract",
    label: "Contract work",
    help: "Built for a Client, who you bill against a BOQ.",
  },
  {
    key: "own",
    label: "Own development",
    help: "Built by the Company to sell or keep; no Client to bill.",
  },
] as const;

export type ProjectRole = (typeof PROJECT_ROLES)[number]["key"];

export const PROJECT_ROLE_KEYS: readonly ProjectRole[] = PROJECT_ROLES.map(
  (role) => role.key,
);

export function isProjectRole(value: string): value is ProjectRole {
  return (PROJECT_ROLE_KEYS as readonly string[]).includes(value);
}

export function projectRoleLabel(role: ProjectRole): string {
  return PROJECT_ROLES.find((item) => item.key === role)?.label ?? role;
}

/** A Role as sent; blank or null is "not chosen". */
export function cleanProjectRole(
  raw: string | null | undefined,
): ProjectRole | null {
  const value = raw?.trim() ?? "";
  if (value === "") return null;
  if (!isProjectRole(value))
    throw new DomainError(
      "PROJECT_ROLE_INVALID",
      "Choose Contract work or Own development.",
      { details: { field: "role" } },
    );
  return value;
}

/**
 * A new Project's Role when none is chosen: Contract work when it names a
 * Client (a Client record or a client name), else Own development.
 */
export function defaultProjectRole(hasClient: boolean): ProjectRole {
  return hasClient ? "contract" : "own";
}

/**
 * The modules a new Project starts with hidden (ADR CM-0023 §22). Own
 * development has no Client to bill, so Client Bills starts hidden;
 * Contract work starts with every Contracts module shown. Changing the Role
 * later leaves the hidden modules as they are; the owner hides and shows
 * them on the Project home. Collections and RERA, hidden on Contract work,
 * join this list when their modules arrive (M11 part 3).
 */
export function defaultHiddenModules(role: ProjectRole): ProjectModuleKey[] {
  return role === "own" ? ["client_bills"] : [];
}
