import { accounts, companies } from "@repo/auth/construction/server";
import type { Prisma, PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";

import type { AccountDeletionStore } from "../application/account-deletion-handlers";
import type { PrismaTeamMemberRepository } from "./prisma-team-member-repository";

/**
 * What else an erased User loses, run inside the erasure's transaction:
 * the composition root passes messaging's clean-up (push subscriptions,
 * notifications, preferences) so this context never reaches into it.
 */
export type AccountErasureHook = (
  tx: Prisma.TransactionClient,
  userId: string,
) => Promise<void>;

/** Delete My Account in one transaction (CM-907). */
export class PrismaAccountDeletionStore implements AccountDeletionStore {
  constructor(
    private readonly db: PrismaClient,
    private readonly members: PrismaTeamMemberRepository,
    private readonly hooks: readonly AccountErasureHook[] = [],
  ) {}

  async erase(
    input: Parameters<AccountDeletionStore["erase"]>[0],
  ): Promise<void> {
    await this.db.$transaction(
      async (tx) => {
        await companies.leaveAll(input.userId, tx);
        for (const member of input.members)
          await this.members.write(tx, member);
        // Removed (tombstoned) records keep their name but lose the link.
        await tx.constructionOrganizationTeamMember.updateMany({
          where: { userId: input.userId },
          data: { userId: null, inviteToken: null },
        });
        for (const audit of input.audits) await recordAudit(tx, audit);
        for (const hook of this.hooks) await hook(tx, input.userId);
        await accounts.erase(input.userId, tx);
        await tx.constructionOrganizationAccountDeletion.create({
          data: {
            id: input.id,
            userId: input.userId,
            reason: input.reason,
            deletedAt: input.now,
          },
        });
      },
      { timeout: 30_000 },
    );
  }
}
