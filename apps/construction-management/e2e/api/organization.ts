import type { ApiClient } from "./ApiClient";
import { PASSWORD, TEMPORARY_PASSWORD, newEmail, unique } from "./session";

const ORGANIZATION = "/api/construction/organization";

/** Flags of the Permission Matrix (`src/shared-kernel/access/flags.ts`). */
export type Flag =
  | "create"
  | "read"
  | "update"
  | "delete"
  | "approve"
  | "reject"
  | "print"
  | "report"
  | "view_all"
  | "notification"
  | "transfer"
  | "financial"
  | "export"
  | "import";

/** Menu key → flags, as a Role stores them (ADR CM-0030). */
export type Grants = Record<string, Flag[]>;

/** Creates a Company with the caller as Owner; it becomes their Active Company. */
export async function createCompany(
  api: ApiClient,
  name: string,
): Promise<{ id: string; name: string }> {
  return api.post(`${ORGANIZATION}/companies`, { name, country: "IN" });
}

/** Makes another of the caller's Companies the Active Company. */
export async function switchCompany(
  api: ApiClient,
  companyId: string,
): Promise<void> {
  await api.post(`${ORGANIZATION}/companies/${companyId}/switch`);
}

export async function roleId(api: ApiClient, name: string): Promise<string> {
  const { items } = await api.get<{ items: { id: string; name: string }[] }>(
    `${ORGANIZATION}/roles`,
  );
  const found = items.find((item) => item.name === name);
  if (found == null) throw new Error(`No Role ${name}`);
  return found.id;
}

/** A Role with exactly these grants, named uniquely. */
export async function createRole(
  api: ApiClient,
  permissions: Grants,
  name = unique("Access"),
): Promise<{ id: string; name: string }> {
  return api.post(`${ORGANIZATION}/roles`, { name, permissions });
}

export type Member = {
  id: string;
  name: string;
  email: string | null;
  mobile: string | null;
  /** What the Owner set; the first sign-in must replace it. */
  temporaryPassword: string;
  /** What they choose on first sign-in (`signInFirstTime`). */
  password: string;
  roleId: string;
};

/**
 * Adds a User with a password (ADR CM-0030 §6), so they can sign in at once
 * as an active member on `roleId`, on the given Projects.
 */
export async function addMember(
  api: ApiClient,
  input: {
    roleId: string;
    name?: string;
    /** null: a member who signs in by mobile only. */
    email?: string | null;
    mobile?: string;
    projectIds?: string[];
    memberType?: "normal" | "hrms";
  },
): Promise<Member> {
  const name = input.name ?? unique("Member");
  const email = input.email === undefined ? newEmail("member") : input.email;
  const created = await api.post<{ id: string }>(
    `${ORGANIZATION}/team-members`,
    {
      name,
      email,
      mobile: input.mobile ?? null,
      memberType: input.memberType ?? "normal",
      roleId: input.roleId,
      projectIds: input.projectIds ?? [],
      password: TEMPORARY_PASSWORD,
    },
  );
  return {
    id: created.id,
    name,
    email,
    mobile: input.mobile ?? null,
    temporaryPassword: TEMPORARY_PASSWORD,
    password: PASSWORD,
    roleId: input.roleId,
  };
}

/** Invites by email without a password: they join through the emailed link. */
export async function inviteMember(
  api: ApiClient,
  input: { roleId: string; name?: string; email?: string },
): Promise<{ id: string; name: string; email: string }> {
  const name = input.name ?? unique("Invitee");
  const email = input.email ?? newEmail("invitee");
  const created = await api.post<{ id: string }>(
    `${ORGANIZATION}/team-members`,
    {
      name,
      email,
      memberType: "normal",
      roleId: input.roleId,
      invite: true,
    },
  );
  return { id: created.id, name, email };
}

/** A Tamil Nadu billing address; the first one becomes the default. */
export async function createBillingAddress(
  api: ApiClient,
  input: { name?: string; gstin?: string | null } = {},
): Promise<{ id: string }> {
  return api.post(`${ORGANIZATION}/settings/billing-addresses`, {
    name: input.name ?? "Head office",
    address: "12 Anna Salai, Chennai 600002",
    stateCode: "33",
    gstin: input.gstin ?? null,
  });
}
