import { Prisma, type PrismaClient } from "@repo/db";

import { recordAudit } from "@/src/shared-kernel/audit";
import { conflict, notFound } from "@/src/shared-kernel/domain-error";
import {
  SEQUENCE_MODULES,
  isSequenceModuleKey,
  type SequenceModuleKey,
  type SequenceRule,
  type SequenceSeparator,
} from "@/src/shared-kernel/sequence";

import type {
  SequenceRuleRecord,
  SequenceRuleStore,
} from "../application/sequence-rule-handlers";

type Row = Prisma.ConstructionOrganizationSequenceRuleGetPayload<{
  include: { _count: { select: { counters: true } } };
}>;

const MODULE_ORDER = new Map<string, number>(
  SEQUENCE_MODULES.map((item, index) => [item.key, index]),
);

function toRecord(row: Row): SequenceRuleRecord | null {
  if (!isSequenceModuleKey(row.module)) return null;
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    module: row.module,
    projectId: row.projectId,
    prefix: row.prefix,
    projectToken: row.projectToken,
    startNumber: row.startNumber,
    padding: row.padding,
    separator: row.separator as SequenceSeparator,
    fiscalYearToken: row.fiscalYearToken,
    issued: row._count.counters > 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** What the audit log keeps of a rule. */
function snapshot(
  rule: Omit<SequenceRule, "id" | "workspaceId" | "module"> & {
    module: string;
  },
) {
  return {
    module: rule.module,
    projectId: rule.projectId,
    prefix: rule.prefix,
    projectToken: rule.projectToken,
    startNumber: rule.startNumber,
    padding: rule.padding,
    separator: rule.separator,
    fiscalYearToken: rule.fiscalYearToken,
  };
}

function settingsData(rule: SequenceRule) {
  return {
    prefix: rule.prefix,
    projectToken: rule.projectToken,
    startNumber: rule.startNumber,
    padding: rule.padding,
    separator: rule.separator,
    fiscalYearToken: rule.fiscalYearToken,
  };
}

const INCLUDE = { _count: { select: { counters: true } } } as const;

export class PrismaSequenceRuleStore implements SequenceRuleStore {
  constructor(private readonly db: PrismaClient) {}

  async list(
    workspaceId: string,
    module: SequenceModuleKey | null,
  ): Promise<SequenceRuleRecord[]> {
    const rows = await this.db.constructionOrganizationSequenceRule.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        ...(module == null ? {} : { module }),
      },
      include: INCLUDE,
      orderBy: { createdAt: "asc" },
    });
    return rows
      .map(toRecord)
      .filter((record): record is SequenceRuleRecord => record != null)
      .sort(
        (a, b) =>
          (MODULE_ORDER.get(a.module) ?? 0) -
            (MODULE_ORDER.get(b.module) ?? 0) ||
          Number(a.projectId != null) - Number(b.projectId != null),
      );
  }

  async find(
    workspaceId: string,
    id: string,
  ): Promise<SequenceRuleRecord | null> {
    const row = await this.db.constructionOrganizationSequenceRule.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: INCLUDE,
    });
    return row == null ? null : toRecord(row);
  }

  async insert(rule: SequenceRule, by: string, now: Date): Promise<void> {
    try {
      await this.db.$transaction(async (tx) => {
        await tx.constructionOrganizationSequenceRule.create({
          data: {
            id: rule.id,
            workspaceId: rule.workspaceId,
            module: rule.module,
            projectId: rule.projectId,
            ...settingsData(rule),
            createdAt: now,
            updatedAt: now,
            createdBy: by,
            updatedBy: by,
          },
        });
        await recordAudit(tx, {
          workspaceId: rule.workspaceId,
          actorUserId: by,
          action: "sequence_rule.created",
          entityType: "sequence_rule",
          entityId: rule.id,
          after: snapshot(rule),
          occurredAt: now,
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw conflict(
          "SEQUENCE_RULE_EXISTS",
          rule.projectId == null
            ? "This module already has a rule for All projects. Edit that rule instead."
            : "This Project already has a rule for this module. Edit that rule instead.",
        );
      throw error;
    }
  }

  async update(
    rule: SequenceRule,
    expectedUpdatedAt: Date,
    by: string,
    now: Date,
  ): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const before = await tx.constructionOrganizationSequenceRule.findFirst({
        where: { id: rule.id, workspaceId: rule.workspaceId, deletedAt: null },
      });
      if (before == null)
        throw notFound(
          "SEQUENCE_RULE_NOT_FOUND",
          "This Sequence ID rule was not found.",
        );
      // Compare-and-set on updatedAt: a stale edit changes no row.
      const updated = await tx.constructionOrganizationSequenceRule.updateMany({
        where: { id: rule.id, deletedAt: null, updatedAt: expectedUpdatedAt },
        data: { ...settingsData(rule), updatedAt: now, updatedBy: by },
      });
      if (updated.count === 0)
        throw conflict(
          "SEQUENCE_RULE_CHANGED",
          "Someone else changed this rule after you opened it. Reload to see their changes.",
        );
      await recordAudit(tx, {
        workspaceId: rule.workspaceId,
        actorUserId: by,
        action: "sequence_rule.updated",
        entityType: "sequence_rule",
        entityId: rule.id,
        before: snapshot({
          ...before,
          separator: before.separator as SequenceSeparator,
        }),
        after: snapshot(rule),
        occurredAt: now,
      });
    });
  }

  async delete(
    workspaceId: string,
    id: string,
    by: string,
    now: Date,
  ): Promise<void> {
    await this.db.$transaction(async (tx) => {
      // FOR UPDATE waits for any number being issued from this rule
      // (`nextSequenceNumber` holds FOR SHARE), so the check below sees it.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM construction_organization.sequence_rules
        WHERE id = ${id}::uuid AND workspace_id = ${workspaceId} AND deleted_at IS NULL
        FOR UPDATE
      `;
      if (locked.length === 0)
        throw notFound(
          "SEQUENCE_RULE_NOT_FOUND",
          "This Sequence ID rule was not found.",
        );
      const issued = await tx.constructionOrganizationSequenceCounter.count({
        where: { ruleId: id },
      });
      if (issued > 0)
        throw conflict(
          "SEQUENCE_RULE_IN_USE",
          "Numbers have been issued from this rule, so it cannot be deleted. Edit it instead.",
        );
      const row = await tx.constructionOrganizationSequenceRule.update({
        where: { id },
        data: { deletedAt: now, updatedAt: now, updatedBy: by },
      });
      await recordAudit(tx, {
        workspaceId,
        actorUserId: by,
        action: "sequence_rule.deleted",
        entityType: "sequence_rule",
        entityId: id,
        before: snapshot({
          ...row,
          separator: row.separator as SequenceSeparator,
        }),
        occurredAt: now,
      });
    });
  }
}
