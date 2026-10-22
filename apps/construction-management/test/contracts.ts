import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";

/**
 * Contracts test helpers (M11). The Measurement Book is CM-1105, so a
 * measurement that names a BOQ item is written straight to its tables.
 */

/**
 * A measurement sheet on the Project with one row naming `boqItemId`:
 * `checked` by default (a joint measurement), which locks the item's
 * quantity and rate (CM-1103).
 */
export async function measureBoqItem(
  workspaceId: string,
  by: string,
  input: {
    projectId: string;
    boqItemId: string;
    quantity: string;
    status?: "draft" | "submitted" | "checked";
    deleted?: boolean;
  },
): Promise<{ sheetId: string; rowId: string }> {
  const sheetId = randomUUID();
  const rowId = randomUUID();
  const now = new Date();
  await prisma.constructionContractsMeasurementSheet.create({
    data: {
      id: sheetId,
      workspaceId,
      projectId: input.projectId,
      side: "client",
      measuredOn: new Date("2026-10-20"),
      status: input.status ?? "checked",
      checkedAt:
        input.status == null || input.status === "checked" ? now : null,
      checkedBy: input.status == null || input.status === "checked" ? by : null,
      createdBy: by,
      updatedBy: by,
      ...(input.deleted === true ? { deletedAt: now, deletedBy: by } : {}),
    },
  });
  await prisma.constructionContractsMeasurementRow.create({
    data: {
      id: rowId,
      workspaceId,
      sheetId,
      boqItemId: input.boqItemId,
      direct: true,
      quantity: input.quantity,
      position: 0,
    },
  });
  return { sheetId, rowId };
}

/** An Item of the Company's library (CM-1102), written straight to its table. */
export async function addLibraryItem(
  workspaceId: string,
  by: string,
  input: {
    code: string;
    uomId: string;
    adoptedRate: bigint;
    shortDescription?: string;
    description?: string | null;
    sacHsn?: string | null;
  },
): Promise<string> {
  const id = randomUUID();
  await prisma.constructionContractsItem.create({
    data: {
      id,
      workspaceId,
      code: input.code,
      shortDescription: input.shortDescription ?? `Item ${input.code}`,
      description: input.description ?? null,
      uomId: input.uomId,
      sacHsn: input.sacHsn ?? null,
      adoptedRate: input.adoptedRate,
      createdBy: by,
      updatedBy: by,
    },
  });
  return id;
}

/**
 * A contractor RA bill on a Work Order (CM-1106 builds bills), written
 * straight to its tables: `approved` by default, with one bill line per
 * Work Order line given.
 */
export async function addContractorBill(
  workspaceId: string,
  by: string,
  input: {
    projectId: string;
    workOrderId: string;
    status?:
      "draft" | "pending_approval" | "approved" | "rejected" | "reversed";
    ordinal?: number;
    lines?: readonly {
      workOrderLineId: string;
      uomId: string;
      quantity: string;
    }[];
  },
): Promise<string> {
  const id = randomUUID();
  await prisma.constructionContractsBill.create({
    data: {
      id,
      workspaceId,
      projectId: input.projectId,
      side: "contractor",
      type: "running",
      workOrderId: input.workOrderId,
      number: `RA-${randomUUID().slice(0, 6)}`,
      ordinal: input.ordinal ?? 1,
      billDate: new Date("2026-10-20"),
      status: input.status ?? "approved",
      createdBy: by,
      updatedBy: by,
      lines: {
        create: (input.lines ?? []).map((line, position) => ({
          id: randomUUID(),
          workspaceId,
          workOrderLineId: line.workOrderLineId,
          description: "Billed work",
          uomId: line.uomId,
          rate: 0n,
          cumulativeQuantity: line.quantity,
          previousQuantity: "0",
          quantity: line.quantity,
          amount: 0n,
          position,
        })),
      },
    },
  });
  return id;
}

/** A material line on a library Item's rate analysis (CM-1102). */
export async function addAnalysisMaterial(
  workspaceId: string,
  input: { itemId: string; materialId: string; coefficient: string },
): Promise<void> {
  await prisma.constructionContractsItemAnalysisLine.create({
    data: {
      id: randomUUID(),
      workspaceId,
      itemId: input.itemId,
      position: 0,
      kind: "material",
      materialId: input.materialId,
      coefficient: input.coefficient,
      rate: 0n,
      amount: 0n,
    },
  });
}
