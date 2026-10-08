import { Prisma, type PrismaClient } from "@repo/db";

import { recordAudit } from "@/src/shared-kernel/audit";
import {
  DEFAULT_BACKDATED_POLICY,
  type BackdatedPolicy,
} from "@/src/shared-kernel/backdated-policy";
import { backdatedPolicyFromRow } from "@/src/shared-kernel/backdated-policy-reader";
import { calendarDateToDb } from "@/src/shared-kernel/calendar-date";
import { conflict } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import type {
  BackdatedPolicyStore,
  StoredBackdatedPolicy,
} from "../application/backdated-policy-handlers";

function policyChanged() {
  return conflict(
    "BACKDATED_POLICY_CHANGED",
    "Someone else changed these settings after you opened them. Reload to see their changes.",
  );
}

function columns(policy: BackdatedPolicy) {
  return {
    createDays: policy.create.days,
    createOverrideDesignationIds: [...policy.create.overrideDesignationIds],
    editDays: policy.edit.days,
    editOverrideDesignationIds: [...policy.edit.overrideDesignationIds],
    financialClosingDate:
      policy.financialClosingDate == null
        ? null
        : calendarDateToDb(policy.financialClosingDate),
    modules: JSON.parse(
      JSON.stringify(policy.modules),
    ) as Prisma.InputJsonObject,
  };
}

export class PrismaBackdatedPolicyStore implements BackdatedPolicyStore {
  constructor(private readonly db: PrismaClient) {}

  async find(workspaceId: string): Promise<StoredBackdatedPolicy> {
    const row =
      await this.db.constructionOrganizationBackdatedEntryPolicy.findUnique({
        where: { workspaceId },
      });
    if (row == null)
      return { policy: DEFAULT_BACKDATED_POLICY, updatedAt: null };
    return { policy: backdatedPolicyFromRow(row), updatedAt: row.updatedAt };
  }

  async save(input: {
    workspaceId: string;
    policy: BackdatedPolicy;
    expectedUpdatedAt: Date | null;
    by: string;
    now: Date;
  }): Promise<void> {
    const data = columns(input.policy);
    try {
      await this.db.$transaction(async (tx) => {
        // Lock the row so two saves cannot both pass the check below.
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM construction_organization.backdated_entry_policies
          WHERE workspace_id = ${input.workspaceId}
          FOR UPDATE
        `;
        const row =
          locked.length === 0
            ? null
            : await tx.constructionOrganizationBackdatedEntryPolicy.findUnique({
                where: { workspaceId: input.workspaceId },
              });
        if (
          (row?.updatedAt.getTime() ?? null) !==
          (input.expectedUpdatedAt?.getTime() ?? null)
        )
          throw policyChanged();
        await tx.constructionOrganizationBackdatedEntryPolicy.upsert({
          where: { workspaceId: input.workspaceId },
          create: {
            id: newId(input.now.getTime()),
            workspaceId: input.workspaceId,
            ...data,
            createdAt: input.now,
            updatedAt: input.now,
            createdBy: input.by,
            updatedBy: input.by,
          },
          update: { ...data, updatedAt: input.now, updatedBy: input.by },
        });
        await recordAudit(tx, {
          workspaceId: input.workspaceId,
          actorUserId: input.by,
          action: "backdated_entry_policy.updated",
          entityType: "backdated_entry_policy",
          entityId: input.workspaceId,
          before:
            row == null
              ? DEFAULT_BACKDATED_POLICY
              : backdatedPolicyFromRow(row),
          after: input.policy,
          occurredAt: input.now,
        });
      });
    } catch (error) {
      // Two first saves racing: the loser hits the unique workspace index.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw policyChanged();
      throw error;
    }
  }
}
