import { prisma, type PrismaClient } from "@repo/construction-db";

import type { FinanceAuthorNames } from "@/src/finance/application/document-thread-ports";
import { userNamesInCompany } from "@/src/shared-kernel/user-names";

/**
 * Names by User id for the finance document thread, from
 * `construction_organization.team_members` (the Owner's row included). A
 * removed Team Member's name still shows; a live row wins.
 */
export function financeAuthorNames(
  db: PrismaClient = prisma,
): FinanceAuthorNames {
  return {
    async namesOf(workspaceId, userIds) {
      return userNamesInCompany(db, workspaceId, userIds);
    },
  };
}
