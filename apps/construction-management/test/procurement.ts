import { randomUUID } from "node:crypto";

import { Prisma, prisma } from "@repo/construction-db";

import type { StockLocation } from "@/src/procurement/domain/stock-location";
import { PrismaStockLedger } from "@/src/procurement/infrastructure/prisma-stock-ledger";

// Direct inserts for procurement HTTP tests (M5). Masters, billing
// addresses and Stores are written straight to their tables so a test of
// one document does not depend on another ticket's routes.

function audit(by: string) {
  const now = new Date();
  return { createdAt: now, updatedAt: now, createdBy: by, updatedBy: by };
}

export async function addUnit(
  workspaceId: string,
  by: string,
  name = `Unit ${randomUUID().slice(0, 6)}`,
): Promise<string> {
  const id = randomUUID();
  await prisma.constructionMastersMeasurementUnit.create({
    data: { id, workspaceId, name, ...audit(by) },
  });
  return id;
}

/** The Company's live unit of this name (a seed one if present), else a new one. */
export async function unitNamed(
  workspaceId: string,
  by: string,
  name: string,
): Promise<string> {
  const found = await prisma.constructionMastersMeasurementUnit.findFirst({
    where: {
      workspaceId,
      name: { equals: name, mode: "insensitive" },
      deletedAt: null,
    },
    select: { id: true },
  });
  return found?.id ?? addUnit(workspaceId, by, name);
}

export async function addMaterialCategory(
  workspaceId: string,
  by: string,
  name = `Category ${randomUUID().slice(0, 6)}`,
): Promise<string> {
  const id = randomUUID();
  await prisma.constructionMastersMaterialCategory.create({
    data: { id, workspaceId, name, ...audit(by) },
  });
  return id;
}

export type MaterialFixture = {
  name?: string;
  uomId?: string;
  categoryId?: string | null;
  /** Paise per unit. */
  unitRate?: bigint | null;
  gstRate?: string | null;
  hsnCode?: string | null;
  minStockQty?: string | null;
};

/** A Material (and a unit for it unless `uomId` is given). */
export async function addMaterial(
  workspaceId: string,
  by: string,
  fixture: MaterialFixture = {},
): Promise<{ id: string; uomId: string; name: string }> {
  const id = randomUUID();
  const uomId = fixture.uomId ?? (await unitNamed(workspaceId, by, "Bag"));
  const name = fixture.name ?? `Cement OPC 53 ${randomUUID().slice(0, 6)}`;
  await prisma.constructionMastersMaterial.create({
    data: {
      id,
      workspaceId,
      name,
      uomId,
      categoryId: fixture.categoryId ?? null,
      unitRate: fixture.unitRate === undefined ? 38_500n : fixture.unitRate,
      gstRate:
        fixture.gstRate === undefined
          ? new Prisma.Decimal("28")
          : fixture.gstRate == null
            ? null
            : new Prisma.Decimal(fixture.gstRate),
      hsnCode: fixture.hsnCode === undefined ? "2523" : fixture.hsnCode,
      minStockQty:
        fixture.minStockQty == null
          ? null
          : new Prisma.Decimal(fixture.minStockQty),
      ...audit(by),
    },
  });
  return { id, uomId, name };
}

/** A Supplier on the given Projects; GST state from `gstin` (Tamil Nadu by default). */
export async function addSupplier(
  workspaceId: string,
  by: string,
  options: {
    name?: string;
    gstin?: string | null;
    stateCode?: string | null;
    projectIds?: readonly string[];
    isActive?: boolean;
  } = {},
): Promise<string> {
  const id = randomUUID();
  const gstin = options.gstin === undefined ? "33AABCU9603R1ZM" : options.gstin;
  await prisma.constructionMastersSupplier.create({
    data: {
      id,
      workspaceId,
      name: options.name ?? `Sri Murugan Traders ${randomUUID().slice(0, 6)}`,
      gstin,
      stateCode:
        options.stateCode === undefined
          ? (gstin?.slice(0, 2) ?? null)
          : options.stateCode,
      isActive: options.isActive ?? true,
      ...audit(by),
      projects: {
        create: (options.projectIds ?? []).map((projectId) => ({
          projectId,
        })),
      },
    },
  });
  return id;
}

export async function addContractor(
  workspaceId: string,
  by: string,
  projectIds: readonly string[] = [],
): Promise<string> {
  const id = randomUUID();
  await prisma.constructionMastersContractor.create({
    data: {
      id,
      workspaceId,
      name: `Velan Constructions ${randomUUID().slice(0, 6)}`,
      ...audit(by),
      projects: { create: projectIds.map((projectId) => ({ projectId })) },
    },
  });
  return id;
}

export async function addBillingAddress(
  workspaceId: string,
  by: string,
  options: {
    stateCode?: string;
    gstin?: string | null;
    isDefault?: boolean;
  } = {},
): Promise<string> {
  const id = randomUUID();
  await prisma.constructionOrganizationBillingAddress.create({
    data: {
      id,
      workspaceId,
      name: `Head office ${randomUUID().slice(0, 6)}`,
      address: "12, Anna Salai, Chennai 600002",
      stateCode: options.stateCode ?? "33",
      gstin: options.gstin === undefined ? "33AAACA1234A1Z5" : options.gstin,
      isDefault: options.isDefault ?? false,
      ...audit(by),
    },
  });
  return id;
}

export async function addTerms(
  workspaceId: string,
  by: string,
  title = `Delivery ${randomUUID().slice(0, 6)}`,
): Promise<string> {
  const id = randomUUID();
  await prisma.constructionMastersTermsCondition.create({
    data: {
      id,
      workspaceId,
      title,
      body: "Material to be delivered at site between 9 am and 6 pm.",
      ...audit(by),
    },
  });
  return id;
}

/** A Central Store serving the given Projects. */
export async function addStore(
  workspaceId: string,
  by: string,
  projectIds: readonly string[],
  options: {
    name?: string;
    stateCode?: string | null;
    keeperIds?: readonly string[];
  } = {},
): Promise<string> {
  const id = randomUUID();
  await prisma.constructionProcurementStore.create({
    data: {
      id,
      workspaceId,
      name: options.name ?? `Central Store ${randomUUID().slice(0, 6)}`,
      address: "Plot 4, SIDCO Industrial Estate, Ambattur",
      stateCode: options.stateCode === undefined ? "33" : options.stateCode,
      ...audit(by),
      projects: { create: projectIds.map((projectId) => ({ projectId })) },
      keepers: {
        create: (options.keeperIds ?? []).map((teamMemberId) => ({
          teamMemberId,
        })),
      },
    },
  });
  return id;
}

/** Opening stock through the ledger, as Import would post it. */
export async function addOpeningStock(
  workspaceId: string,
  by: string,
  location: StockLocation,
  materialId: string,
  quantity: string,
  entryDate = "2026-04-01",
): Promise<void> {
  const movementId = randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.constructionProcurementStockMovement.create({
      data: {
        id: movementId,
        workspaceId,
        locationKind: location.kind,
        locationId: location.id,
        kind: "opening",
        movementDate: new Date(`${entryDate}T00:00:00.000Z`),
        materialId,
        quantity: new Prisma.Decimal(quantity),
        ...audit(by),
      },
    });
    await new PrismaStockLedger().post(tx, { workspaceId, by }, [
      {
        location,
        materialId,
        entryDate,
        type: "opening",
        quantity,
        source: { type: "stock_movement", id: movementId },
      },
    ]);
  });
}
