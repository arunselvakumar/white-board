import type { Prisma, PrismaClient } from "@repo/db";

import { recordAudit } from "@/src/shared-kernel/audit";
import type { BackdatedLimit } from "@/src/shared-kernel/backdated-policy";
import {
  loadBackdatedActor,
  loadBackdatedPolicy,
} from "@/src/shared-kernel/backdated-policy-reader";
import {
  addDays,
  calendarDateFromDb,
  calendarDateToDb,
  daysBetween,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import {
  conflict,
  DomainError,
  notFound,
} from "@/src/shared-kernel/domain-error";
import {
  markStoredFileDeleted,
  recordStoredFile,
} from "@/src/shared-kernel/files/stored-files";

import type {
  PaymentParty,
  StoredWagePayment,
  WagePaymentActor,
  WagePaymentBackdatedGuard,
  WagePaymentListPage,
  WagePaymentListParams,
  WagePaymentStore,
} from "../application/wage-payment-handlers";
import type { PartyType } from "../domain/ledger";
import { paymentLedgerEntries } from "../domain/wage-payment";
import { companyToday } from "./prisma-labour-queries";
import { prismaLedger } from "./prisma-ledger";

type Row = Prisma.ConstructionLabourWagePaymentGetPayload<object>;

function toStored(row: Row): StoredWagePayment {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    partyType: row.partyType,
    partyId: row.partyId,
    projectId: row.projectId,
    paymentDate: calendarDateFromDb(row.paymentDate),
    kind: row.kind,
    mode: row.mode,
    amount: row.amount,
    reference: row.reference,
    paidByMemberId: row.paidByMemberId,
    remarks: row.remarks,
    documentKey: row.documentKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

/** What the audit log keeps of a payment. */
function snapshot(payment: StoredWagePayment) {
  return {
    partyType: payment.partyType,
    partyId: payment.partyId,
    projectId: payment.projectId,
    paymentDate: payment.paymentDate,
    kind: payment.kind,
    mode: payment.mode,
    amount: payment.amount,
    reference: payment.reference,
    paidByMemberId: payment.paidByMemberId,
    remarks: payment.remarks,
  };
}

/**
 * Wage payments in `construction_labour.wage_payments` (CM-215), each
 * write in one transaction with its ledger entries and audit event.
 */
export class PrismaWagePaymentStore implements WagePaymentStore {
  constructor(private readonly db: PrismaClient) {}

  async find(workspaceId: string, id: string) {
    const row = await this.db.constructionLabourWagePayment.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toStored(row);
  }

  async list(params: WagePaymentListParams): Promise<WagePaymentListPage> {
    const filters: Prisma.ConstructionLabourWagePaymentWhereInput[] = [
      {
        workspaceId: params.workspaceId,
        projectId: params.projectId,
        deletedAt: null,
        partyType: { in: [...params.partyTypes] },
      },
    ];
    if (params.partyId != null) filters.push({ partyId: params.partyId });
    if (params.kind != null) filters.push({ kind: params.kind });
    if (params.from != null)
      filters.push({ paymentDate: { gte: calendarDateToDb(params.from) } });
    if (params.to != null)
      filters.push({ paymentDate: { lte: calendarDateToDb(params.to) } });
    // Newest first; `after` pages forward (older), `before` pages back.
    const backwards = params.before != null;
    const cursor = params.after ?? params.before;
    const page = await this.db.constructionLabourWagePayment.findMany({
      where: {
        AND:
          cursor == null
            ? filters
            : [
                ...filters,
                {
                  OR: backwards
                    ? [
                        { createdAt: { gt: cursor.createdAt } },
                        { createdAt: cursor.createdAt, id: { gt: cursor.id } },
                      ]
                    : [
                        { createdAt: { lt: cursor.createdAt } },
                        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                      ],
                },
              ],
      },
      orderBy: backwards
        ? [{ createdAt: "asc" }, { id: "asc" }]
        : [{ createdAt: "desc" }, { id: "desc" }],
      take: params.limit + 1,
    });
    const hasMore = page.length > params.limit;
    const rows = page.slice(0, params.limit);
    if (backwards) rows.reverse();
    const totals = await this.db.constructionLabourWagePayment.aggregate({
      where: { AND: filters },
      _count: { _all: true },
      _sum: { amount: true },
    });
    return {
      items: rows.map(toStored),
      total: totals._count._all,
      hasMore,
      totalAmount: totals._sum.amount ?? 0,
    };
  }

  async party(
    workspaceId: string,
    partyType: PartyType,
    partyId: string,
  ): Promise<PaymentParty | null> {
    const where = { id: partyId, workspaceId, deletedAt: null };
    if (partyType === "labour") {
      const row = await this.db.constructionLabourLabour.findFirst({
        where,
        select: { id: true, name: true, currentProjectId: true },
      });
      return row == null
        ? null
        : { id: row.id, name: row.name, projectIds: [row.currentProjectId] };
    }
    const row = await this.db.constructionLabourVendor.findFirst({
      where,
      select: {
        id: true,
        name: true,
        projects: { select: { projectId: true } },
      },
    });
    return row == null
      ? null
      : {
          id: row.id,
          name: row.name,
          projectIds: row.projects.map((item) => item.projectId),
        };
  }

  async partyNames(
    workspaceId: string,
    partyType: PartyType,
    ids: readonly string[],
  ): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const where = { workspaceId, id: { in: [...new Set(ids)] } };
    const select = { id: true, name: true } as const;
    const rows =
      partyType === "labour"
        ? await this.db.constructionLabourLabour.findMany({ where, select })
        : await this.db.constructionLabourVendor.findMany({ where, select });
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  async insert(payment: StoredWagePayment): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await tx.constructionLabourWagePayment.create({
        data: {
          id: payment.id,
          workspaceId: payment.workspaceId,
          partyType: payment.partyType,
          partyId: payment.partyId,
          projectId: payment.projectId,
          paymentDate: calendarDateToDb(payment.paymentDate),
          kind: payment.kind,
          mode: payment.mode,
          reference: payment.reference,
          amount: payment.amount,
          paidByMemberId: payment.paidByMemberId,
          remarks: payment.remarks,
          documentKey: payment.documentKey,
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
          createdBy: payment.createdBy,
          updatedBy: payment.updatedBy,
        },
      });
      await prismaLedger.post(
        tx,
        payment.workspaceId,
        payment.createdBy,
        paymentLedgerEntries(payment, payment.id),
      );
      await recordAudit(tx, {
        workspaceId: payment.workspaceId,
        actorUserId: payment.createdBy,
        action: "wage_payment.recorded",
        entityType: "wage_payment",
        entityId: payment.id,
        after: snapshot(payment),
        occurredAt: payment.createdAt,
      });
    });
  }

  async cancel(input: Parameters<WagePaymentStore["cancel"]>[0]) {
    const { payment, by, now } = input;
    await this.db.$transaction(async (tx) => {
      const updated = await tx.constructionLabourWagePayment.updateMany({
        where: {
          id: payment.id,
          workspaceId: payment.workspaceId,
          deletedAt: null,
          updatedAt: input.expectedUpdatedAt,
        },
        data: { deletedAt: now, deletedBy: by, updatedAt: now, updatedBy: by },
      });
      if (updated.count === 0) {
        const live = await tx.constructionLabourWagePayment.count({
          where: { id: payment.id, deletedAt: null },
        });
        if (live === 0)
          throw notFound("PAYMENT_NOT_FOUND", "This payment was not found.");
        throw conflict(
          "PAYMENT_CHANGED",
          "Someone changed this payment after you opened it. Reload to see the latest.",
        );
      }
      await prismaLedger.reverseSource(
        tx,
        payment.workspaceId,
        by,
        "wage_payment",
        payment.id,
      );
      await recordAudit(tx, {
        workspaceId: payment.workspaceId,
        actorUserId: by,
        action: "wage_payment.cancelled",
        entityType: "wage_payment",
        entityId: payment.id,
        before: snapshot(payment),
        occurredAt: now,
      });
    });
  }

  async setReceipt(input: Parameters<WagePaymentStore["setReceipt"]>[0]) {
    const { payment } = input;
    await this.db.$transaction(async (tx) => {
      // `updated_at` stays: it guards cancelling, not the receipt.
      const written = await tx.constructionLabourWagePayment.updateMany({
        where: {
          id: payment.id,
          workspaceId: payment.workspaceId,
          deletedAt: null,
          documentKey: input.loadedKey,
        },
        data: { documentKey: input.key },
      });
      if (written.count === 0)
        throw conflict(
          "RECEIPT_CHANGED",
          "The receipt was changed somewhere else, or the payment was cancelled. Reload and try again.",
        );
      if (input.removedKey != null)
        await markStoredFileDeleted(
          tx,
          payment.workspaceId,
          input.removedKey,
          input.now,
        );
      if (input.added != null) await recordStoredFile(tx, input.added);
      await recordAudit(tx, input.audit);
    });
  }

  async payers(workspaceId: string) {
    return this.db.constructionOrganizationTeamMember.findMany({
      where: { workspaceId, deletedAt: null, status: "active" },
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  }

  async memberIdOf(workspaceId: string, userId: string) {
    const row = await this.db.constructionOrganizationTeamMember.findFirst({
      where: { workspaceId, userId, deletedAt: null, status: "active" },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  today(workspaceId: string): Promise<CalendarDate> {
    return companyToday(this.db, workspaceId);
  }
}

const LABELS: Record<PartyType, string> = {
  labour: "Labour payment",
  vendor: "Vendor payment",
};

function limitFor(
  limit: BackdatedLimit,
  actor: { designationId: string | null; isOwner: boolean },
): number {
  if (actor.isOwner) return 0;
  if (
    actor.designationId != null &&
    limit.overrideDesignationIds.includes(actor.designationId)
  )
    return 0;
  return limit.days;
}

/**
 * The back-dated guard for wage payments (`modules/08`: "otherwise the
 * Labour & Vendor group default"). The kernel catalogue has no payment
 * module and no per-group limits, so this applies the Company's default
 * create/edit limits (what a Labour & Vendor module uses in global mode)
 * and the Financial Closing Date, with the kernel's error codes.
 */
export class PrismaWagePaymentBackdatedGuard implements WagePaymentBackdatedGuard {
  constructor(private readonly db: PrismaClient) {}

  async assert(
    action: "create" | "edit",
    actor: WagePaymentActor,
    partyType: PartyType,
    date: CalendarDate,
  ): Promise<void> {
    const [policy, who, today] = await Promise.all([
      loadBackdatedPolicy(this.db, actor.workspaceId),
      loadBackdatedActor(this.db, actor),
      companyToday(this.db, actor.workspaceId),
    ]);
    const verb = action === "create" ? "created" : "edited";
    const closing = policy.financialClosingDate;
    if (closing != null && daysBetween(date, closing) >= 0)
      throw new DomainError(
        "FINANCIAL_PERIOD_CLOSED",
        `The books are closed up to ${closing}. Entries dated on or before it cannot be ${verb}.`,
        {
          kind: "forbidden",
          details: {
            module: `${partyType}_payment`,
            entryDate: date,
            financialClosingDate: closing,
          },
        },
      );
    const days = limitFor(policy[action], who);
    if (days === 0 || daysBetween(date, today) <= days) return;
    const oldestAllowedDate = addDays(today, -days);
    throw new DomainError(
      action === "create"
        ? "BACKDATED_CREATE_BLOCKED"
        : "BACKDATED_EDIT_BLOCKED",
      `${LABELS[partyType]} entries older than ${String(days)} ${days === 1 ? "day" : "days"} cannot be ${verb}. The earliest date allowed is ${oldestAllowedDate}.`,
      {
        kind: "forbidden",
        details: {
          module: `${partyType}_payment`,
          entryDate: date,
          limitDays: days,
          oldestAllowedDate,
        },
      },
    );
  }
}
