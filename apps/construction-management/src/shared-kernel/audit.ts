import { Prisma, type PrismaClient } from "@repo/construction-db";

import { newId } from "./ids";

/**
 * Who changed what (`03-target-architecture.md §3`). Application services
 * append one per command that changes state; the row is never updated.
 */
export type AuditEvent = {
  workspaceId: string;
  actorUserId: string;
  /** What happened, past tense: `company.created`, `team_member.invited`. */
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  occurredAt?: Date;
};

type AuditWriter = Pick<PrismaClient, "constructionOrganizationAuditEvent">;

function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (value === undefined || value === null) return Prisma.DbNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Appends to `construction_organization.audit_events`. Pass a transaction to keep it atomic with the change. */
export async function recordAudit(
  db: AuditWriter,
  event: AuditEvent,
): Promise<void> {
  await db.constructionOrganizationAuditEvent.create({
    data: {
      id: newId(),
      workspaceId: event.workspaceId,
      actorUserId: event.actorUserId,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      before: toJson(event.before),
      after: toJson(event.after),
      occurredAt: event.occurredAt ?? new Date(),
    },
  });
}
