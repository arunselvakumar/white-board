import { companies } from "@repo/auth/construction/server";

import type { CompanyMemberships } from "../application/company-memberships";

export const authCompanyMemberships: CompanyMemberships = {
  addMember: (input) => companies.addMember(input),
  removeMember: (input) => companies.removeMember(input),
};
