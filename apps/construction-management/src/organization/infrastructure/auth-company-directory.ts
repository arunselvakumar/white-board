import { companies } from "@repo/auth/construction/server";

import type {
  CompanyDirectory,
  CompanyNames,
} from "../application/company-directory";

/** `CompanyDirectory` over `@repo/auth` (ADR CM-0002). */
export class AuthCompanyDirectory implements CompanyDirectory, CompanyNames {
  createWorkspace(input: {
    name: string;
    ownerUserId: string;
  }): Promise<{ workspaceId: string }> {
    return companies.create(input);
  }

  deleteWorkspace(workspaceId: string): Promise<void> {
    return companies.deleteCreated(workspaceId);
  }

  renameWorkspace(workspaceId: string, name: string): Promise<void> {
    return companies.rename(workspaceId, name);
  }
}
