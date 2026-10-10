import type { Prisma } from "@repo/construction-db";

import { calendarDateFromDb } from "@/src/shared-kernel/calendar-date";

import { pendingQuantity } from "../domain/purchase-request";
import type { StockLocation } from "../domain/stock-location";

type Db = Prisma.TransactionClient;

export type PurchaseOrderFormOptions = {
  suppliers: {
    id: string;
    name: string;
    gstin: string | null;
    stateCode: string | null;
    mobile: string | null;
    contactPerson: string | null;
  }[];
  billingAddresses: {
    id: string;
    name: string;
    address: string;
    stateCode: string;
    gstin: string | null;
    isDefault: boolean;
  }[];
  terms: { id: string; title: string; body: string }[];
  purchaseRequests: {
    id: string;
    number: string;
    requestDate: string;
    requiredDate: string | null;
    items: {
      id: string;
      materialId: string;
      materialName: string;
      uomName: string;
      quantity: string;
      orderedQty: string;
      pendingQty: string;
    }[];
  }[];
};

/**
 * What the PO form picks from at a Project or Store (CM-504): its active
 * Suppliers (Project Resources, or the Store's suppliers), the Company's
 * billing addresses and enabled Terms & Conditions, and the Project's
 * orderable Purchase Requests with their pending items. Plain reads of the
 * masters and organization tables, like the other by-id reads; procurement
 * never imports those contexts.
 */
export async function readPurchaseOrderFormOptions(
  db: Db,
  workspaceId: string,
  location: StockLocation,
): Promise<PurchaseOrderFormOptions> {
  const supplierWhere: Prisma.ConstructionMastersSupplierWhereInput =
    location.kind === "project"
      ? { projects: { some: { projectId: location.id } } }
      : {
          id: {
            in: (
              await db.constructionProcurementStoreSupplier.findMany({
                where: { storeId: location.id },
                select: { supplierId: true },
              })
            ).map((row) => row.supplierId),
          },
        };
  const [suppliers, billingAddresses, terms, requests] = await Promise.all([
    db.constructionMastersSupplier.findMany({
      where: { workspaceId, deletedAt: null, isActive: true, ...supplierWhere },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        gstin: true,
        stateCode: true,
        mobile: true,
        contactPerson: true,
      },
    }),
    db.constructionOrganizationBillingAddress.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        address: true,
        stateCode: true,
        gstin: true,
        isDefault: true,
      },
    }),
    db.constructionMastersTermsCondition.findMany({
      where: { workspaceId, deletedAt: null, disabledAt: null },
      orderBy: { title: "asc" },
      select: { id: true, title: true, body: true },
    }),
    location.kind === "project"
      ? db.constructionProcurementPurchaseRequest.findMany({
          where: {
            workspaceId,
            projectId: location.id,
            deletedAt: null,
            approvalStatus: "approved",
            markedOrderedAt: null,
            orderStatus: { in: ["not_ordered", "partially_ordered"] },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 100,
          include: { items: { orderBy: { position: "asc" } } },
        })
      : Promise.resolve([]),
  ]);
  return {
    suppliers: suppliers.map((row) => ({
      ...row,
      stateCode: row.stateCode ?? row.gstin?.slice(0, 2) ?? null,
    })),
    billingAddresses,
    terms,
    purchaseRequests: requests.map((pr) => ({
      id: pr.id,
      number: pr.number,
      requestDate: calendarDateFromDb(pr.requestDate),
      requiredDate:
        pr.requiredDate == null ? null : calendarDateFromDb(pr.requiredDate),
      items: pr.items.map((item) => {
        const quantity = item.quantity.toFixed(3);
        const orderedQty = item.orderedQty.toFixed(3);
        return {
          id: item.id,
          materialId: item.materialId,
          materialName: item.materialName,
          uomName: item.uomName,
          quantity,
          orderedQty,
          pendingQty: pendingQuantity(quantity, orderedQty),
        };
      }),
    })),
  };
}

/** A Supplier's address and contact as the PO PDF prints them (live). */
export async function readSupplierContact(
  db: Db,
  workspaceId: string,
  supplierId: string,
): Promise<{ address: string | null; mobile: string | null } | null> {
  return db.constructionMastersSupplier.findFirst({
    where: { id: supplierId, workspaceId },
    select: { address: true, mobile: true },
  });
}
