import { Prisma } from "@repo/construction-db";

import type {
  ClientFacts,
  ContractorFacts,
  FinanceDirectory,
  GoodsReceiptFacts,
  NamedFacts,
  SupplierFacts,
  TeamMemberFacts,
} from "@/src/finance/application/ports";

type Db = Prisma.TransactionClient;

function byId<T extends { id: string }>(rows: readonly T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]));
}

const live = (workspaceId: string, ids: readonly string[]) => ({
  workspaceId,
  id: { in: [...new Set(ids)] },
  deletedAt: null,
});

const named = (rows: { id: string; name: string }[]): Map<string, NamedFacts> =>
  byId(rows.map((row) => ({ id: row.id, name: row.name })));

function toMember(row: {
  id: string;
  name: string;
  userId: string | null;
  status: string;
  deletedAt: Date | null;
}): TeamMemberFacts {
  return {
    id: row.id,
    name: row.name,
    userId: row.userId,
    active: row.status === "active" && row.deletedAt == null,
  };
}

type GoodsReceiptRow = {
  id: string;
  number: string;
  supplierId: string;
  supplierName: string;
  locationKind: "project" | "store";
  locationId: string;
  receiptDate: Date;
  invoiceNo: string | null;
  invoiceDate: Date | null;
  invoiceAmount: bigint | null;
  totalValue: bigint;
  paymentTermsDays: number | null;
  updatedBy: string;
};

const GOODS_RECEIPT_COLUMNS = Prisma.sql`g.id::text AS id, g.number,
  g.supplier_id::text AS "supplierId", g.supplier_name AS "supplierName",
  g.location_kind::text AS "locationKind", g.location_id::text AS "locationId",
  g.receipt_date AS "receiptDate", g.invoice_no AS "invoiceNo",
  g.invoice_date AS "invoiceDate", g.invoice_amount AS "invoiceAmount",
  g.total_value AS "totalValue", o.payment_terms_days AS "paymentTermsDays",
  g.updated_by AS "updatedBy"`;

function toGoodsReceipt(row: GoodsReceiptRow): GoodsReceiptFacts {
  const day = (value: Date) => value.toISOString().slice(0, 10);
  return {
    id: row.id,
    number: row.number,
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    location: { kind: row.locationKind, id: row.locationId },
    receiptDate: day(row.receiptDate),
    invoiceNo: row.invoiceNo?.trim() === "" ? null : row.invoiceNo,
    invoiceDate: row.invoiceDate == null ? null : day(row.invoiceDate),
    invoiceAmount: row.invoiceAmount,
    totalValue: row.totalValue,
    paymentTermsDays: row.paymentTermsDays,
    updatedBy: row.updatedBy,
  };
}

/**
 * What finance reads from masters, organization, projects, procurement and
 * labour (ADR CM-0017 §1), by id. Lives in composition because it crosses
 * contexts; finance only sees the `FinanceDirectory` port.
 */
export const financeDirectory: FinanceDirectory = {
  async contractors(db: Db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    const rows = await db.constructionMastersContractor.findMany({
      where: live(workspaceId, ids),
      include: {
        projects: { select: { projectId: true } },
        departments: { select: { departmentId: true } },
      },
    });
    return byId(
      rows.map((row): ContractorFacts => ({
        id: row.id,
        name: row.name,
        pan: row.pan,
        gstin: row.gstin,
        stateCode: row.stateCode ?? row.gstin?.slice(0, 2) ?? null,
        isActive: row.isActive,
        tdsApplicable: row.tdsApplicable,
        tdsLowerRate: row.tdsLowerRate?.toFixed(2) ?? null,
        tdsNote: row.tdsNote,
        projectIds: row.projects.map((project) => project.projectId),
        departmentIds: row.departments.map((item) => item.departmentId),
      })),
    );
  },

  async suppliers(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    const rows = await db.constructionMastersSupplier.findMany({
      where: live(workspaceId, ids),
      include: { projects: { select: { projectId: true } } },
    });
    return byId(
      rows.map((row): SupplierFacts => ({
        id: row.id,
        name: row.name,
        pan: row.pan,
        gstin: row.gstin,
        stateCode: row.stateCode ?? row.gstin?.slice(0, 2) ?? null,
        isActive: row.isActive,
        projectIds: row.projects.map((project) => project.projectId),
      })),
    );
  },

  async clients(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    const unique = [...new Set(ids)];
    const [rows, projects] = await Promise.all([
      db.constructionMastersClient.findMany({ where: live(workspaceId, ids) }),
      db.constructionProjectsProject.findMany({
        where: { workspaceId, deletedAt: null, clientId: { in: unique } },
        select: { id: true, clientId: true },
      }),
    ]);
    return byId(
      rows.map((row): ClientFacts => ({
        id: row.id,
        name: row.name,
        pan: row.pan,
        gstin: row.gstin,
        stateCode: row.stateCode ?? row.gstin?.slice(0, 2) ?? null,
        isActive: row.isActive,
        projectIds: projects
          .filter((project) => project.clientId === row.id)
          .map((project) => project.id),
      })),
    );
  },

  async projects(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    return named(
      await db.constructionProjectsProject.findMany({
        where: live(workspaceId, ids),
        select: { id: true, name: true },
      }),
    );
  },

  async stores(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    return named(
      await db.constructionProcurementStore.findMany({
        where: live(workspaceId, ids),
        select: { id: true, name: true },
      }),
    );
  },

  async teamMembers(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    const rows = await db.constructionOrganizationTeamMember.findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] } },
      select: {
        id: true,
        name: true,
        userId: true,
        status: true,
        deletedAt: true,
      },
    });
    return byId(rows.map(toMember));
  },

  async memberOfUser(db, workspaceId, userId) {
    const row = await db.constructionOrganizationTeamMember.findFirst({
      where: { workspaceId, userId, deletedAt: null },
      select: {
        id: true,
        name: true,
        userId: true,
        status: true,
        deletedAt: true,
      },
    });
    return row == null ? null : toMember(row);
  },

  async labours(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    return named(
      await db.constructionLabourLabour.findMany({
        where: live(workspaceId, ids),
        select: { id: true, name: true },
      }),
    );
  },

  async vendors(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    return named(
      await db.constructionLabourVendor.findMany({
        where: live(workspaceId, ids),
        select: { id: true, name: true },
      }),
    );
  },

  async departments(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    return named(
      await db.constructionMastersDepartment.findMany({
        where: { workspaceId, id: { in: [...new Set(ids)] } },
        select: { id: true, name: true },
      }),
    );
  },

  async listParties(db, workspaceId, kind, projectId) {
    const select = { id: true, name: true } as const;
    const orderBy = { name: "asc" } as const;
    const base = { workspaceId, deletedAt: null };
    switch (kind) {
      case "contractor":
        return db.constructionMastersContractor.findMany({
          where: {
            ...base,
            isActive: true,
            ...(projectId == null ? {} : { projects: { some: { projectId } } }),
          },
          select,
          orderBy,
        });
      case "supplier":
        return db.constructionMastersSupplier.findMany({
          where: {
            ...base,
            isActive: true,
            ...(projectId == null ? {} : { projects: { some: { projectId } } }),
          },
          select,
          orderBy,
        });
      case "labour":
        return db.constructionLabourLabour.findMany({
          where: {
            ...base,
            isActive: true,
            ...(projectId == null ? {} : { currentProjectId: projectId }),
          },
          select,
          orderBy,
        });
      case "vendor":
        return db.constructionLabourVendor.findMany({
          where: {
            ...base,
            isActive: true,
            ...(projectId == null ? {} : { projects: { some: { projectId } } }),
          },
          select,
          orderBy,
        });
      case "client": {
        // The Project's Client (CM-1107); every active Client Company-wide.
        if (projectId == null)
          return db.constructionMastersClient.findMany({
            where: { ...base, isActive: true },
            select,
            orderBy,
          });
        const project = await db.constructionProjectsProject.findFirst({
          where: { ...base, id: projectId },
          select: { clientId: true },
        });
        if (project?.clientId == null) return [];
        return db.constructionMastersClient.findMany({
          where: { ...base, id: project.clientId },
          select,
          orderBy,
        });
      }
      case "team_member":
        return db.constructionOrganizationTeamMember.findMany({
          where: { ...base, status: "active" },
          select,
          orderBy,
        });
    }
  },

  async goodsReceipts(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    const rows = await db.$queryRaw<GoodsReceiptRow[]>(
      Prisma.sql`SELECT ${GOODS_RECEIPT_COLUMNS}
        FROM construction_procurement.goods_receipts g
        LEFT JOIN construction_procurement.purchase_orders o
          ON o.id = g.purchase_order_id
        WHERE g.workspace_id = ${workspaceId}
          AND g.id = ANY(${[...new Set(ids)]}::uuid[])
          AND g.deleted_at IS NULL`,
    );
    return byId(rows.map(toGoodsReceipt));
  },

  async awaitingInvoiceGoodsReceipts(db, workspaceId, location, supplierId) {
    const rows = await db.$queryRaw<GoodsReceiptRow[]>(
      Prisma.sql`SELECT ${GOODS_RECEIPT_COLUMNS}
        FROM construction_procurement.goods_receipts g
        LEFT JOIN construction_procurement.purchase_orders o
          ON o.id = g.purchase_order_id
        WHERE g.workspace_id = ${workspaceId}
          AND g.location_kind = ${location.kind}::construction_procurement.location_kind
          AND g.location_id = ${location.id}::uuid
          AND g.deleted_at IS NULL
          AND (${supplierId}::uuid IS NULL OR g.supplier_id = ${supplierId}::uuid)
          AND NOT EXISTS (
            SELECT 1 FROM construction_finance.invoice_goods_receipts l
            JOIN construction_finance.invoices i ON i.id = l.invoice_id
            WHERE l.goods_receipt_id = g.id AND l.deleted_at IS NULL
              AND i.deleted_at IS NULL
          )
        ORDER BY g.receipt_date, g.number
        LIMIT 500`,
    );
    return rows.map(toGoodsReceipt);
  },

  async contractAdvances(db, workspaceId, paymentIds) {
    const ids = [...new Set(paymentIds)];
    if (ids.length === 0) return new Map();
    const rows = await db.$queryRaw<
      {
        paymentId: string;
        kind: "mobilisation" | "secured";
        direction: "given" | "received";
        workOrderNumber: string | null;
      }[]
    >(
      Prisma.sql`SELECT a.payment_id::text AS "paymentId", a.kind::text AS kind,
          a.direction::text AS direction, w.number AS "workOrderNumber"
        FROM construction_contracts.advances a
        LEFT JOIN construction_contracts.work_orders w ON w.id = a.work_order_id
        WHERE a.workspace_id = ${workspaceId} AND a.deleted_at IS NULL
          AND a.payment_id = ANY(${ids}::uuid[])`,
    );
    return new Map(
      rows.map((row) => [
        row.paymentId,
        {
          label: `${row.kind === "mobilisation" ? "mobilisation" : "secured"} advance ${
            row.direction === "given"
              ? `on Work Order ${row.workOrderNumber ?? "(draft)"}`
              : "received on the client contract"
          }`,
        },
      ]),
    );
  },

  async raBillTypes(db, workspaceId, billIds) {
    const ids = [...new Set(billIds)];
    if (ids.length === 0) return new Map();
    const rows = await db.constructionContractsBill.findMany({
      where: { workspaceId, id: { in: ids } },
      select: { id: true, type: true },
    });
    return new Map(rows.map((row) => [row.id, row.type]));
  },

  async retentionReleases(db, workspaceId, releaseIds) {
    const ids = [...new Set(releaseIds)];
    if (ids.length === 0) return new Map();
    const rows = await db.$queryRaw<
      {
        id: string;
        side: "contractor" | "client";
        workOrderId: string | null;
        workOrderNumber: string | null;
      }[]
    >(
      Prisma.sql`SELECT r.id::text AS id, r.side::text AS side,
          r.work_order_id::text AS "workOrderId", w.number AS "workOrderNumber"
        FROM construction_contracts.retention_releases r
        LEFT JOIN construction_contracts.work_orders w ON w.id = r.work_order_id
        WHERE r.workspace_id = ${workspaceId} AND r.id = ANY(${ids}::uuid[])`,
    );
    return new Map(
      rows.map((row) => [
        row.id,
        {
          side: row.side,
          workOrderId: row.workOrderId,
          workOrderNumber: row.workOrderNumber,
        },
      ]),
    );
  },

  async userNames(db, workspaceId, userIds) {
    if (userIds.length === 0) return new Map();
    const rows = await db.constructionOrganizationTeamMember.findMany({
      where: { workspaceId, userId: { in: [...new Set(userIds)] } },
      select: { userId: true, name: true },
    });
    return new Map(
      rows.flatMap((row) =>
        row.userId == null ? [] : [[row.userId, row.name] as const],
      ),
    );
  },

  async wagesPaid(db, workspaceId, projectId, range) {
    const rows = await db.constructionLabourWagePayment.groupBy({
      by: ["partyType"],
      where: {
        workspaceId,
        projectId,
        deletedAt: null,
        paymentDate: {
          gte: new Date(`${range.from}T00:00:00.000Z`),
          lte: new Date(`${range.to}T00:00:00.000Z`),
        },
      },
      _sum: { amount: true },
    });
    const paid = (type: "labour" | "vendor") =>
      BigInt(rows.find((row) => row.partyType === type)?._sum.amount ?? 0);
    return { labour: paid("labour"), vendor: paid("vendor") };
  },
};
