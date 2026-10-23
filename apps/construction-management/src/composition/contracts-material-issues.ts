import type { ContractsTx } from "@/src/contracts/application/ports";
import type {
  ContractorIssue,
  MaterialIssues,
} from "@/src/contracts/application/reconciliation-ports";
import { calendarDateFromDb } from "@/src/shared-kernel/calendar-date";

/**
 * Material issued to a Contractor (CM-1110), read from procurement's
 * tables for contracts' material reconciliation. Procurement never
 * imports contracts and contracts never imports procurement; this adapter
 * crosses in composition.
 *
 * An **issue** is a line of a **delivered** Delivery Note of a live
 * Material Request raised for the Contractor on the Project, dated the
 * note's "delivered on": the material reached the site for that
 * Contractor. A note approved but still in transit is not yet issued.
 * The request's Work Order (if named) says which Work Order it counts
 * towards; the rule for the rest is contracts' (`attributeIssue`).
 *
 * **Returns:** procurement has no return flow (stock movements are
 * consumed, missing and adjustment; transfers move between stores and
 * sites), so `returnsFrom` answers none until one exists.
 */
export const contractsMaterialIssues: MaterialIssues = {
  async issuesTo(db: ContractsTx, workspaceId, query) {
    if (query.materialIds.length === 0) return [];
    const rows = await db.constructionProcurementDeliveryNoteItem.findMany({
      where: {
        materialId: { in: [...query.materialIds] },
        deliveryNote: {
          workspaceId,
          projectId: query.projectId,
          deletedAt: null,
          deliveredOn: { not: null },
          materialRequest: {
            workspaceId,
            contractorId: query.contractorId,
            deletedAt: null,
          },
        },
      },
      select: {
        id: true,
        materialId: true,
        quantity: true,
        deliveryNote: {
          select: {
            id: true,
            number: true,
            deliveredOn: true,
            materialRequest: {
              select: { id: true, number: true, workOrderId: true },
            },
          },
        },
      },
    });
    return rows
      .flatMap((row): ContractorIssue[] => {
        const note = row.deliveryNote;
        if (note.deliveredOn == null) return [];
        return [
          {
            id: row.id,
            deliveryNoteId: note.id,
            deliveryNoteNumber: note.number,
            materialRequestId: note.materialRequest.id,
            materialRequestNumber: note.materialRequest.number,
            date: calendarDateFromDb(note.deliveredOn),
            materialId: row.materialId,
            quantity: BigInt(row.quantity.toFixed(3).replace(".", "")),
            workOrderId: note.materialRequest.workOrderId,
          },
        ];
      })
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          a.deliveryNoteNumber.localeCompare(b.deliveryNoteNumber),
      );
  },

  returnsFrom: () => Promise.resolve([]),
};
