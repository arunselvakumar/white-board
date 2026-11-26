import { randomUUID } from "node:crypto";

import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import type {
  InvoiceGenerationResult,
  InvoiceGenerator,
} from "../application/fee-ports";
import { fromIsoDate, toIsoDate } from "../domain/dates";
import { notFound } from "../domain/errors";
import { planInvoices } from "../domain/fees";

/**
 * Raises an Admission's Invoices from the Fee Structure in force: the
 * Centre's own for the Programme and Academic Year, else the Workspace
 * default. Nothing is written when the Admission already has Invoices.
 */
export class PrismaFeeInvoiceGenerator implements InvoiceGenerator {
  constructor(private readonly db: PrismaClient = prisma) {}

  async generate(admissionId: string): Promise<InvoiceGenerationResult> {
    return this.db.$transaction(async (tx) => {
      // Two calls for one Admission take turns, so Invoices are raised once.
      await tx.$queryRaw`SELECT 1 FROM preschool.admissions WHERE id = ${admissionId}::uuid FOR UPDATE`;
      const admission = await tx.preschoolAdmission.findUnique({
        where: { id: admissionId },
        select: {
          id: true,
          workspaceId: true,
          centreId: true,
          childId: true,
          programmeId: true,
          academicYearId: true,
          admittedOn: true,
          academicYear: { select: { startsOn: true, endsOn: true } },
          _count: { select: { invoices: true } },
        },
      });
      if (admission == null)
        throw notFound("ADMISSION_NOT_FOUND", "Admission not found.");
      if (admission._count.invoices > 0) return "already_invoiced";

      const structures = await tx.preschoolFeeStructure.findMany({
        where: {
          workspaceId: admission.workspaceId,
          academicYearId: admission.academicYearId,
          programmeId: admission.programmeId,
          OR: [{ centreId: admission.centreId }, { centreId: null }],
        },
        orderBy: { createdAt: "asc" },
        select: {
          centreId: true,
          items: {
            select: {
              feeHeadId: true,
              amountPaise: true,
              frequency: true,
              feeHead: { select: { name: true } },
            },
          },
        },
      });
      const structure =
        structures.find((row) => row.centreId === admission.centreId) ??
        structures.find((row) => row.centreId == null);
      if (structure == null || structure.items.length === 0)
        return "no_structure";

      const planned = planInvoices({
        admittedOn: toIsoDate(admission.admittedOn),
        academicYear: {
          startsOn: toIsoDate(admission.academicYear.startsOn),
          endsOn: toIsoDate(admission.academicYear.endsOn),
        },
        lines: structure.items.map((item) => ({
          feeHeadId: item.feeHeadId,
          feeHeadName: item.feeHead.name,
          amountPaise: item.amountPaise,
          frequency: item.frequency,
        })),
      });
      await tx.preschoolInvoice.createMany({
        data: planned.map((invoice) => ({
          id: randomUUID(),
          workspaceId: admission.workspaceId,
          centreId: admission.centreId,
          childId: admission.childId,
          admissionId: admission.id,
          feeHeadId: invoice.feeHeadId,
          label: invoice.label,
          dueOn: fromIsoDate(invoice.dueOn),
          amountPaise: invoice.amountPaise,
        })),
      });
      return "created";
    });
  }
}
