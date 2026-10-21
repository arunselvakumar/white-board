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
