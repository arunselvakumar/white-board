import type { CompanyProfile } from "../domain/company-profile";

export type CompanyProfileReader = {
  findByWorkspace(workspaceId: string): Promise<CompanyProfile | null>;
};
