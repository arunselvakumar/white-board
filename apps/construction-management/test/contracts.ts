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
    /** `YYYY-MM-DD`; 2026-10-20 by default. */
    billDate?: string;
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
      billDate: new Date(input.billDate ?? "2026-10-20"),
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

/**
 * A contractor-side measurement sheet on a Work Order (CM-1105), written
 * straight to its tables: `checked` by default, one direct row per line
 * given. Contractor Bills (CM-1106) take checked rows.
 */
export async function measureWorkOrderLines(
  workspaceId: string,
  by: string,
  input: {
    projectId: string;
    workOrderId: string;
    measuredOn: string;
    status?: "draft" | "submitted" | "checked";
    rows: readonly { workOrderLineId: string; quantity: string }[];
  },
): Promise<{ sheetId: string; rowIds: string[] }> {
  const sheetId = randomUUID();
  const now = new Date();
  const checked = (input.status ?? "checked") === "checked";
  await prisma.constructionContractsMeasurementSheet.create({
    data: {
      id: sheetId,
      workspaceId,
      projectId: input.projectId,
      side: "contractor",
      workOrderId: input.workOrderId,
      measuredOn: new Date(input.measuredOn),
      status: input.status ?? "checked",
      checkedAt: checked ? now : null,
      checkedBy: checked ? by : null,
      createdBy: by,
      updatedBy: by,
    },
  });
  const rowIds = input.rows.map(() => randomUUID());
  await prisma.constructionContractsMeasurementRow.createMany({
    data: input.rows.map((row, position) => ({
      id: rowIds[position] ?? randomUUID(),
      workspaceId,
      sheetId,
      workOrderLineId: row.workOrderLineId,
      description: `Measured ${String(position + 1)}`,
      direct: true,
      quantity: row.quantity,
      position,
    })),
  });
  return { sheetId, rowIds };
}

/**
 * A Client of the Company (CM-1101), written straight to its table: a
 * Tamil Nadu GSTIN by default.
 */
export async function addClient(
  workspaceId: string,
  by: string,
  input: {
    name?: string;
    gstin?: string | null;
    stateCode?: string | null;
    address?: string | null;
  } = {},
): Promise<string> {
  const id = randomUUID();
  const gstin = input.gstin === undefined ? "33AABCT1332L1ZU" : input.gstin;
  await prisma.constructionMastersClient.create({
    data: {
      id,
      workspaceId,
      name: input.name ?? "Tamil Nadu Housing Board",
      gstin,
      stateCode:
        input.stateCode === undefined
          ? (gstin?.slice(0, 2) ?? null)
          : input.stateCode,
      address:
        input.address === undefined ? "Nandanam, Chennai" : input.address,
      pinCode: "600035",
      createdBy: by,
      updatedBy: by,
    },
  });
  return id;
}

/**
 * A client-side measurement sheet on the Project (CM-1105), written
 * straight to its tables: `checked` by default, one direct row per BOQ
 * item given. Client Bills (CM-1107) take checked rows.
 */
export async function measureClientItems(
  workspaceId: string,
  by: string,
  input: {
    projectId: string;
    measuredOn: string;
    status?: "draft" | "submitted" | "checked";
    rows: readonly { boqItemId: string; quantity: string }[];
  },
): Promise<{ sheetId: string; rowIds: string[] }> {
  const sheetId = randomUUID();
  const now = new Date();
  const checked = (input.status ?? "checked") === "checked";
  await prisma.constructionContractsMeasurementSheet.create({
    data: {
      id: sheetId,
      workspaceId,
      projectId: input.projectId,
      side: "client",
      measuredOn: new Date(input.measuredOn),
      status: input.status ?? "checked",
      checkedAt: checked ? now : null,
      checkedBy: checked ? by : null,
      createdBy: by,
      updatedBy: by,
    },
  });
  const rowIds = input.rows.map(() => randomUUID());
  await prisma.constructionContractsMeasurementRow.createMany({
    data: input.rows.map((row, position) => ({
      id: rowIds[position] ?? randomUUID(),
      workspaceId,
      sheetId,
      boqItemId: row.boqItemId,
      description: `Measured ${String(position + 1)}`,
      direct: true,
      quantity: row.quantity,
      position,
    })),
  });
  return { sheetId, rowIds };
}

/**
 * A running (RA) bill of either side with a given gross and bill date,
 * written straight to `bills` (CM-1109 escalation tests take R from it):
 * approved by default, with no lines or invoice.
 */
export async function addRunningBill(
  workspaceId: string,
  by: string,
  input: {
    projectId: string;
    side: "contractor" | "client";
    workOrderId?: string | null;
    clientId?: string | null;
    billDate: string;
    gross: bigint;
    status?:
      "draft" | "pending_approval" | "approved" | "rejected" | "reversed";
    ordinal?: number | null;
  },
): Promise<string> {
  const id = randomUUID();
  const status = input.status ?? "approved";
  await prisma.constructionContractsBill.create({
    data: {
      id,
      workspaceId,
      projectId: input.projectId,
      side: input.side,
      type: "running",
      workOrderId: input.workOrderId ?? null,
      clientId: input.clientId ?? null,
      number: status === "draft" ? null : `RA-${randomUUID().slice(0, 8)}`,
      ordinal: status === "draft" ? null : (input.ordinal ?? null),
      billDate: new Date(input.billDate),
      measuredUpTo: new Date(input.billDate),
      status,
      gross: input.gross,
      cumulativeValue: input.gross,
      net: input.gross,
      createdBy: by,
      updatedBy: by,
    },
  });
  return id;
}

/**
 * Material delivered to a Contractor on a Project (CM-1110), written
 * straight to procurement's tables: a Material Request for the Contractor
 * (naming `workOrderId` when given) and one Delivery Note, approved and
 * delivered on `deliveredOn`, with one line.
 */
export async function issueToContractor(
  workspaceId: string,
  by: string,
  input: {
    projectId: string;
    storeId: string;
    contractorId: string;
    workOrderId?: string | null;
    material: { id: string; name: string; uomId: string };
    quantity: string;
    deliveredOn: string;
  },
): Promise<{ requestId: string; noteId: string; noteLineId: string }> {
  const requestId = randomUUID();
  const requestItemId = randomUUID();
  const noteId = randomUUID();
  const noteLineId = randomUUID();
  const tag = randomUUID().slice(0, 8);
  const on = new Date(input.deliveredOn);
  await prisma.constructionProcurementMaterialRequest.create({
    data: {
      id: requestId,
      workspaceId,
      projectId: input.projectId,
      storeId: input.storeId,
      number: `MR-${tag}`,
      requestDate: on,
      contractorId: input.contractorId,
      workOrderId: input.workOrderId ?? null,
      status: "delivered",
      createdBy: by,
      updatedBy: by,
      items: {
        create: {
          id: requestItemId,
          position: 0,
          materialId: input.material.id,
          materialName: input.material.name,
          uomId: input.material.uomId,
          uomName: "Bag",
          askQty: input.quantity,
          deliveredQty: input.quantity,
        },
      },
    },
  });
  await prisma.constructionProcurementDeliveryNote.create({
    data: {
      id: noteId,
      workspaceId,
      number: `DN-${tag}`,
      materialRequestId: requestId,
      storeId: input.storeId,
      projectId: input.projectId,
      deliveryDate: on,
      approvalStatus: "approved",
      decidedAt: on,
      decidedBy: by,
      deliveredOn: on,
      deliveredAt: on,
      deliveredBy: by,
      createdBy: by,
      updatedBy: by,
      items: {
        create: {
          id: noteLineId,
          materialRequestItemId: requestItemId,
          position: 0,
          materialId: input.material.id,
          materialName: input.material.name,
          uomId: input.material.uomId,
          uomName: "Bag",
          quantity: input.quantity,
        },
      },
    },
  });
  return { requestId, noteId, noteLineId };
}
