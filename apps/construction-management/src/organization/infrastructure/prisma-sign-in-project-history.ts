import { prisma, type PrismaClient } from "@repo/construction-db";

import { readAuditEvents } from "@/src/shared-kernel/audit-reader";

import {
  projectChangesOf,
  type SignInProjectChange,
  type SignInProjectHistory,
} from "../application/sign-in-project-history";

/** A sign-in's Project history from its `team_member.*` audit events (ADR CM-0038 §1). */
export class PrismaSignInProjectHistory implements SignInProjectHistory {
  constructor(private readonly db: PrismaClient = prisma) {}

  async siteEngineerSignIns(workspaceId: string) {
    return this.db.constructionOrganizationTeamMember.findMany({
      where: { workspaceId, siteEngineer: true },
      select: { id: true, name: true },
    });
  }

  async projectChanges(
    workspaceId: string,
    memberIds: readonly string[],
    projectId: string,
  ): Promise<SignInProjectChange[]> {
    const events = await readAuditEvents(this.db, {
      workspaceId,
      entityType: "team_member",
      entityIds: memberIds,
    });
    const byMember = new Map<string, typeof events>();
    for (const event of events) {
      const list = byMember.get(event.entityId) ?? [];
      list.push(event);
      byMember.set(event.entityId, list);
    }
    return [...byMember].flatMap(([memberId, list]) =>
      projectChangesOf(memberId, list).filter(
        (change) => change.projectId === projectId,
      ),
    );
  }
}
