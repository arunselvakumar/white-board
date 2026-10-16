import { prisma, type PrismaClient } from "@repo/construction-db";

import type { SiteWorkAuthorNames } from "@/src/site-work/application/document-thread-ports";
import { userNamesInCompany } from "@/src/shared-kernel/user-names";

/**
 * Names by User id for the site-work document thread, from
 * `construction_organization.team_members` (the Owner's row included). A
 * removed Team Member's name still shows; a live row wins.
 */
export function siteWorkAuthorNames(
  db: PrismaClient = prisma,
): SiteWorkAuthorNames {
  return {
    async namesOf(workspaceId, userIds) {
      return userNamesInCompany(db, workspaceId, userIds);
    },
  };
}
