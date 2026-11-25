import { randomUUID } from "node:crypto";

import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import type {
  FeeAccountStore,
  FeeChildRecord,
  InvoiceChange,
  InvoiceRecord,
} from "../application/fee-ports";
import type { FeePaymentSummaryView } from "../application/fee-views";
import { fromIsoDate, toIsoDate } from "../domain/dates";
import { invoiceDuePaise } from "../domain/fees";

export const INVOICE_SELECT = {
  id: true,
  centreId: true,
  childId: true,
  admissionId: true,
  feeHeadId: true,
  label: true,
  dueOn: true,
  amountPaise: true,
  concessionPaise: true,
  concessionReason: true,
  paidPaise: true,
  cancelledAt: true,
  feeHead: { select: { name: true } },
} as const;

type InvoiceRow = {
  id: string;
  centreId: string;
  childId: string;
  admissionId: string;
  feeHeadId: string;
  label: string;
  dueOn: Date;
  amountPaise: number;
  concessionPaise: number;
  concessionReason: string | null;
  paidPaise: number;
  cancelledAt: Date | null;
  feeHead: { name: string };
};

export function invoiceRecord(row: InvoiceRow): InvoiceRecord {
  return {
    id: row.id,
    centreId: row.centreId,
    childId: row.childId,
    admissionId: row.admissionId,
    feeHeadId: row.feeHeadId,
    feeHeadName: row.feeHead.name,
    label: row.label,
    dueOn: toIsoDate(row.dueOn),
    amountPaise: row.amountPaise,
    concessionPaise: row.concessionPaise,
    concessionReason: row.concessionReason,
    paidPaise: row.paidPaise,
    cancelled: row.cancelledAt != null,
  };
}

const INVOICE_ORDER = [
  { dueOn: "asc" },
  { label: "asc" },
  { id: "asc" },
] as const;

export class PrismaFeeAccountStore implements FeeAccountStore {
  constructor(private readonly db: PrismaClient = prisma) {}

  async child(
    workspaceId: string,
    childId: string,
  ): Promise<FeeChildRecord | null> {
    const row = await this.db.preschoolChild.findFirst({
      where: { id: childId, workspaceId, deletedAt: null },
      select: {
        id: true,
        centreId: true,
        firstName: true,
        lastName: true,
        admissionNumber: true,
        status: true,
        fatherName: true,
        fatherPhone: true,
        motherName: true,
        motherPhone: true,
        admissions: {
          where: { status: "active" },
          orderBy: [{ admittedOn: "desc" }, { createdAt: "desc" }],
          take: 1,
          select: {
            id: true,
            classroom: { select: { id: true, name: true } },
            programme: { select: { id: true, name: true } },
            academicYear: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (row == null) return null;
    const { admissions, ...child } = row;
    const admission = admissions[0];
    return {
      ...child,
      classroom: admission?.classroom ?? null,
      programme: admission?.programme ?? null,
      academicYear: admission?.academicYear ?? null,
      activeAdmissionId: admission?.id ?? null,
    };
  }

  async invoices(
    workspaceId: string,
    childId: string,
    activeAdmissionId: string | null,
  ): Promise<InvoiceRecord[]> {
    const rows = await this.db.preschoolInvoice.findMany({
      where: {
        workspaceId,
        childId,
        OR: [
          ...(activeAdmissionId == null
            ? []
            : [{ admissionId: activeAdmissionId }]),
          { cancelledAt: null },
        ],
      },
      orderBy: [...INVOICE_ORDER],
      select: INVOICE_SELECT,
    });
    return rows
      .map(invoiceRecord)
      .filter(
        (invoice) =>
          invoice.admissionId === activeAdmissionId ||
          invoiceDuePaise(invoice) > 0,
      );
  }

  async payments(
    workspaceId: string,
    childId: string,
  ): Promise<FeePaymentSummaryView[]> {
    const rows = await this.db.preschoolFeePayment.findMany({
      where: { workspaceId, childId },
      orderBy: [{ receivedOn: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        receiptNumber: true,
        receivedOn: true,
        amountPaise: true,
        method: true,
        reference: true,
        cancelledAt: true,
      },
    });
    return rows.map(({ cancelledAt, ...row }) => ({
      ...row,
      receivedOn: toIsoDate(row.receivedOn),
      cancelled: cancelledAt != null,
    }));
  }

  async feeHead(
    workspaceId: string,
    id: string,
  ): Promise<{ id: string; name: string; isArchived: boolean } | null> {
    const row = await this.db.preschoolFeeHead.findFirst({
      where: { id, workspaceId },
      select: { id: true, name: true, archivedAt: true },
    });
    return row == null
      ? null
      : { id: row.id, name: row.name, isArchived: row.archivedAt != null };
  }

  async createInvoice(
    workspaceId: string,
    input: {
      centreId: string;
      childId: string;
      admissionId: string;
      feeHeadId: string;
      label: string;
      dueOn: string;
      amountPaise: number;
    },
  ): Promise<string> {
    const id = randomUUID();
    await this.db.preschoolInvoice.create({
      data: {
        id,
        workspaceId,
        ...input,
        dueOn: fromIsoDate(input.dueOn),
      },
    });
    return id;
  }

  async invoice(
    workspaceId: string,
    id: string,
  ): Promise<InvoiceRecord | null> {
    const row = await this.db.preschoolInvoice.findFirst({
      where: { id, workspaceId },
      select: INVOICE_SELECT,
    });
    return row == null ? null : invoiceRecord(row);
  }

  async changeInvoice(
    workspaceId: string,
    id: string,
    change: (invoice: InvoiceRecord) => InvoiceChange,
  ): Promise<InvoiceRecord> {
    return this.db.$transaction(async (tx) => {
      // Payments lock Invoices the same way, so an edit never races one.
      await tx.$queryRaw`SELECT 1 FROM preschool.invoices WHERE id = ${id}::uuid AND workspace_id = ${workspaceId} FOR UPDATE`;
      const current = invoiceRecord(
        await tx.preschoolInvoice.findFirstOrThrow({
          where: { id, workspaceId },
          select: INVOICE_SELECT,
        }),
      );
      const { dueOn, ...rest } = change(current);
      return invoiceRecord(
        await tx.preschoolInvoice.update({
          where: { id },
          data: {
            ...rest,
            ...(dueOn == null ? {} : { dueOn: fromIsoDate(dueOn) }),
          },
          select: INVOICE_SELECT,
        }),
      );
    });
  }
}
