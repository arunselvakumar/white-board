import { companies } from "@repo/auth/construction/server";
import type { PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";

import type { OwnershipTransferStore } from "../application/ownership-handlers";
import type { PrismaRoleRepository } from "./prisma-role-repository";
import type { PrismaTeamMemberRepository } from "./prisma-team-member-repository";

/**
 * Transfer ownership in one transaction (CM-907): both Team Members, the
 * Role made for the old Owner when the Company has no Admin Role, the
 * `owner` ↔ `member` roles in `identity.workspace_members`, and the audit.
 */
export class PrismaOwnershipTransferStore implements OwnershipTransferStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly members: PrismaTeamMemberRepository,
    private readonly roles: PrismaRoleRepository,
  ) {}

  async commit(
    input: Parameters<OwnershipTransferStore["commit"]>[0],
  ): Promise<void> {
    const fromUserId = input.from.userId;
    const toUserId = input.to.userId;
    if (fromUserId == null || toUserId == null)
      throw new Error("Both Team Members must be linked to a User.");
    await this.db.$transaction(async (tx) => {
      if (input.newRole != null) await this.roles.write(tx, input.newRole);
      await this.members.write(tx, input.from);
      await this.members.write(tx, input.to);
      await companies.transferOwnership(
        { workspaceId: input.workspaceId, fromUserId, toUserId },
        tx,
      );
      for (const audit of input.audits) await recordAudit(tx, audit);
    });
  }
}
