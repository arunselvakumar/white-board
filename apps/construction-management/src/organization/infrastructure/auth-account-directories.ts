import { accounts, companies } from "@repo/auth/construction/server";

import type { AccountCompanies } from "../application/account-deletion-handlers";
import type { SessionDirectory } from "../application/device-handlers";

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
