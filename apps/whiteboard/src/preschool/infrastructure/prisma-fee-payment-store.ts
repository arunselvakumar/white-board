import { randomUUID } from "node:crypto";

import { prisma, type Prisma, type PrismaClient } from "@repo/whiteboard-db";

import type {
  FeePaymentStore,
  ReceiptRecord,
  RecordPaymentInput,
} from "../application/fee-ports";
import type { FeePaymentListView } from "../application/fee-views";
import { fromIsoDate, toIsoDate } from "../domain/dates";
import { notFound } from "../domain/errors";
import { invoiceDuePaise, receiptNumber } from "../domain/fees";

type LockedInvoice = {
  id: string;
  due_on: Date;
  amount_paise: number;
  concession_paise: number;
  paid_paise: number;
  label: string;
};

export class PrismaFeePaymentStore implements FeePaymentStore {
  constructor(private readonly db: PrismaClient = prisma) {}

  async record(
    workspaceId: string,
    input: RecordPaymentInput,
  ): Promise<string> {
    return this.db.$transaction(async (tx) => {
      // Locked oldest first, so two payments for one Child queue in the same
      // order and the second sees what the first paid.
      const locked = await tx.$queryRaw<LockedInvoice[]>`
        SELECT id::text AS id, label, due_on, amount_paise, concession_paise, paid_paise
        FROM preschool.invoices
        WHERE workspace_id = ${workspaceId}
          AND child_id = ${input.childId}::uuid
          AND cancelled_at IS NULL
          AND amount_paise - concession_paise - paid_paise > 0
        ORDER BY due_on, label, id
        FOR UPDATE`;
      let open = locked;
      if (input.invoiceIds != null) {
        const named = await tx.preschoolInvoice.count({
          where: {
            workspaceId,
            childId: input.childId,
            id: { in: [...input.invoiceIds] },
          },
        });
        if (named !== input.invoiceIds.length)
          throw notFound("INVOICE_NOT_FOUND", "Invoice not found.");
        const wanted = new Set(input.invoiceIds);
        open = locked.filter((invoice) => wanted.has(invoice.id));
      }
      const allocations = input.allocate(
        open.map((invoice) => ({
          id: invoice.id,
          label: invoice.label,
          dueOn: toIsoDate(invoice.due_on),
          duePaise: invoiceDuePaise({
            amountPaise: invoice.amount_paise,
            concessionPaise: invoice.concession_paise,
            paidPaise: invoice.paid_paise,
            cancelled: false,
          }),
        })),
      );

      const [centre] = await tx.$queryRaw<{ code: string; seq: number }[]>`
        UPDATE preschool.centres
        SET next_receipt_seq = next_receipt_seq + 1, updated_at = now()
        WHERE id = ${input.centreId}::uuid AND workspace_id = ${workspaceId}
        RETURNING code, next_receipt_seq - 1 AS seq`;
      if (centre == null)
        throw notFound("CENTRE_NOT_FOUND", "Centre not found.");

      const id = randomUUID();
      await tx.preschoolFeePayment.create({
        data: {
          id,
          workspaceId,
          centreId: input.centreId,
          childId: input.childId,
          receiptNumber: receiptNumber(
            centre.code,
            input.academicYearName,
            centre.seq,
          ),
          receivedOn: fromIsoDate(input.receivedOn),
          amountPaise: input.amountPaise,
          method: input.method,
          reference: input.reference,
          note: input.note,
          recordedByUserId: input.recordedByUserId,
          recordedByName: input.recordedByName,
          allocations: {
            create: allocations.map((allocation) => ({
              id: randomUUID(),
              workspaceId,
              invoiceId: allocation.invoiceId,
              amountPaise: allocation.amountPaise,
            })),
          },
        },
      });
      for (const allocation of allocations)
        await tx.preschoolInvoice.update({
          where: { id: allocation.invoiceId },
          data: { paidPaise: { increment: allocation.amountPaise } },
        });
      return id;
    });
  }

  async list(
    workspaceId: string,
    query: {
      centreId: string;
      from: string | null;
      to: string | null;
      limit: number;
      cursor: string | null;
    },
  ): Promise<FeePaymentListView> {
    const where: Prisma.PreschoolFeePaymentWhereInput = {
      workspaceId,
      centreId: query.centreId,
      ...(query.from == null && query.to == null
        ? {}
        : {
            receivedOn: {
              ...(query.from == null ? {} : { gte: fromIsoDate(query.from) }),
              ...(query.to == null ? {} : { lte: fromIsoDate(query.to) }),
            },
          }),
    };
    const [rows, total, sum] = await Promise.all([
      this.db.preschoolFeePayment.findMany({
        where,
        orderBy: [
          { receivedOn: "desc" },
          { createdAt: "desc" },
          { id: "desc" },
        ],
        take: query.limit + 1,
        ...(query.cursor == null
          ? {}
          : { cursor: { id: query.cursor }, skip: 1 }),
        select: {
          id: true,
          receiptNumber: true,
          receivedOn: true,
          amountPaise: true,
          method: true,
          reference: true,
          recordedByName: true,
          child: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              admissionNumber: true,
            },
          },
        },
      }),
      this.db.preschoolFeePayment.count({ where }),
      this.db.preschoolFeePayment.aggregate({
        where,
        _sum: { amountPaise: true },
      }),
    ]);
    const page = rows.slice(0, query.limit);
    return {
      items: page.map(({ child, receivedOn, ...row }) => ({
        ...row,
        receivedOn: toIsoDate(receivedOn),
        childId: child.id,
        childName: [child.firstName, child.lastName]
          .filter((part) => part != null && part !== "")
          .join(" "),
        admissionNumber: child.admissionNumber,
      })),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
      total,
      totalPaise: sum._sum.amountPaise ?? 0,
    };
  }

  async owner(
    workspaceId: string,
    id: string,
  ): Promise<{ centreId: string; childId: string } | null> {
    return this.db.preschoolFeePayment.findFirst({
      where: { id, workspaceId },
      select: { centreId: true, childId: true },
    });
  }

  async receipt(
    workspaceId: string,
    id: string,
  ): Promise<ReceiptRecord | null> {
    const payment = await this.db.preschoolFeePayment.findFirst({
      where: { id, workspaceId },
      select: {
        id: true,
        centreId: true,
        receiptNumber: true,
        receivedOn: true,
        amountPaise: true,
        method: true,
        reference: true,
        note: true,
        recordedByName: true,
        createdAt: true,
        allocations: {
          orderBy: [{ invoice: { dueOn: "asc" } }, { invoiceId: "asc" }],
          select: {
            invoiceId: true,
            amountPaise: true,
            invoice: { select: { label: true } },
          },
        },
        child: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNumber: true,
            fatherName: true,
            motherName: true,
            admissions: {
              orderBy: [{ status: "asc" }, { admittedOn: "desc" }],
              take: 1,
              select: { classroom: { select: { name: true } } },
            },
          },
        },
      },
    });
    if (payment == null) return null;
    const { child } = payment;
    const [centre, invoices, later] = await Promise.all([
      this.db.preschoolCentre.findFirstOrThrow({
        where: { id: payment.centreId, workspaceId },
        select: {
          id: true,
          name: true,
          addressLine: true,
          city: true,
          state: true,
          pincode: true,
          phone: true,
        },
      }),
      this.db.preschoolInvoice.findMany({
        where: { workspaceId, childId: child.id, cancelledAt: null },
        select: { amountPaise: true, concessionPaise: true, paidPaise: true },
      }),
      // What later payments took off, to give the balance as it stood then.
      this.db.preschoolFeePaymentAllocation.aggregate({
        where: {
          workspaceId,
          payment: { childId: child.id, createdAt: { gt: payment.createdAt } },
        },
        _sum: { amountPaise: true },
      }),
    ]);
    const dueNow = invoices.reduce(
      (sum, invoice) => sum + invoiceDuePaise({ ...invoice, cancelled: false }),
      0,
    );
    return {
      id: payment.id,
      receiptNumber: payment.receiptNumber,
      receivedOn: toIsoDate(payment.receivedOn),
      centre,
      child: {
        id: child.id,
        firstName: child.firstName,
        lastName: child.lastName,
        admissionNumber: child.admissionNumber,
        classroomName: child.admissions[0]?.classroom.name ?? null,
        fatherName: child.fatherName,
        motherName: child.motherName,
      },
      lines: payment.allocations.map((allocation) => ({
        invoiceId: allocation.invoiceId,
        label: allocation.invoice.label,
        amountPaise: allocation.amountPaise,
      })),
      amountPaise: payment.amountPaise,
      method: payment.method,
      reference: payment.reference,
      note: payment.note,
      receivedByName: payment.recordedByName,
      balanceDuePaise: dueNow + (later._sum.amountPaise ?? 0),
    };
  }
}
