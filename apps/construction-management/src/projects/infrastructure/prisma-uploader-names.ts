import type { PrismaClient } from "@repo/construction-db";

import type { UploaderNames } from "../application/project-documents";
import { userNamesInCompany } from "@/src/shared-kernel/user-names";

/**
 * Team Member names by User id, read from
 * `construction_organization.team_members` (the organization context is
 * referred to by id only, so this is a plain read of its table). A removed
 * Team Member's name still says who uploaded a file; a live row wins.
 */
export class PrismaUploaderNames implements UploaderNames {
  constructor(private readonly db: PrismaClient) {}

  async namesOf(
    workspaceId: string,
    userIds: readonly string[],
  ): Promise<Map<string, string>> {
    return userNamesInCompany(this.db, workspaceId, userIds);
  }
}
