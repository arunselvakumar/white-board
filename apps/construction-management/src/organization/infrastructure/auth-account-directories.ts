import { accounts, companies } from "@repo/auth/construction/server";

import type { AccountCompanies } from "../application/account-deletion-handlers";
import type { SessionDirectory } from "../application/device-handlers";
import type { SignInAccounts } from "../application/sign-in-accounts";

/** The User's Companies in `@repo/auth` (CM-907). */
export const authAccountCompanies: AccountCompanies = {
  owned: async (userId) =>
    (await companies.ownedBy(userId)).map(({ id, name }) => ({ id, name })),
  memberOf: async (userId) =>
    (await companies.listForUser(userId))
      .filter((company) => company.role !== "owner")
      .map(({ id, name }) => ({ id, name })),
};

/** The User's sessions in `@repo/auth` (CM-907). */
export const authSessionDirectory: SessionDirectory = {
  list: (userId) => accounts.listSessions(userId),
  revoke: (userId, ids) => accounts.revokeSessions(userId, ids),
  revokeOthers: (userId, keep) => accounts.revokeOtherSessions(userId, keep),
};

/** Admin-made sign-in accounts in `@repo/auth` (ADR CM-0030). */
export const authSignInAccounts: SignInAccounts = {
  createPasswordAccount: (input) => accounts.createPasswordAccount(input),
  setTemporaryPassword: (userId, password) =>
    accounts.setTemporaryPassword(userId, password),
  inOtherCompanies: (workspaceId, userIds) =>
    accounts.inOtherCompanies(workspaceId, userIds),
};
