import { Prisma, type PrismaClient } from "@repo/construction-db";

import { recordAudit, type AuditEvent } from "@/src/shared-kernel/audit";

import type { CompanyDeletionStore } from "../application/company-deletion-handlers";
import { CompanyDeletion } from "../domain/company-deletion";

type Row = Prisma.ConstructionOrganizationCompanyDeletionGetPayload<object>;

function toDomain(row: Row): CompanyDeletion {
  return CompanyDeletion.reconstitute({
    id: row.id,
    workspaceId: row.deletedWorkspaceId,
    companyName: row.companyName,
    ownerUserId: row.ownerUserId,
    requestedAt: row.requestedAt,
    scheduledFor: row.scheduledFor,
    cancelledAt: row.cancelledAt,
    cancelledBy: row.cancelledBy,
    completedAt: row.completedAt,
    summary:
      row.summary == null ? null : (row.summary as Record<string, number>),
  });
}

/** `construction_organization.company_deletions` (CM-907). */
export class PrismaCompanyDeletionStore implements CompanyDeletionStore {
  constructor(private readonly db: PrismaClient) {}

  async findPending(workspaceId: string): Promise<CompanyDeletion | null> {
    const row = await this.db.constructionOrganizationCompanyDeletion.findFirst(
      {
        where: {
          deletedWorkspaceId: workspaceId,
          cancelledAt: null,
          completedAt: null,
        },
        orderBy: { requestedAt: "desc" },
      },
    );
    return row == null ? null : toDomain(row);
  }

  async save(deletion: CompanyDeletion, audit?: AuditEvent): Promise<void> {
    const data = {
      deletedWorkspaceId: deletion.workspaceId,
      companyName: deletion.companyName,
      ownerUserId: deletion.ownerUserId,
      requestedAt: deletion.requestedAt,
      scheduledFor: deletion.scheduledFor,
      cancelledAt: deletion.cancelledAt,
      cancelledBy: deletion.cancelledBy,
      completedAt: deletion.completedAt,
      summary:
        deletion.summary == null
          ? Prisma.DbNull
          : (deletion.summary as Prisma.InputJsonObject),
    };
    await this.db.$transaction(async (tx) => {
      await tx.constructionOrganizationCompanyDeletion.upsert({
        where: { id: deletion.id },
        create: { id: deletion.id, ...data },
        update: data,
      });
      // The audit goes with the Company when it is purged; the deletion
      // row itself is the lasting record.
      if (audit != null) await recordAudit(tx, audit);
    });
  }

  async listDue(now: Date, limit: number): Promise<CompanyDeletion[]> {
    const rows = await this.db.constructionOrganizationCompanyDeletion.findMany(
      {
        where: {
          cancelledAt: null,
          completedAt: null,
          scheduledFor: { lte: now },
        },
        orderBy: { scheduledFor: "asc" },
        take: limit,
      },
    );
    return rows.map(toDomain);
  }
}
