import { Prisma } from "@repo/construction-db";

import {
  calendarDateFromDb,
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";

import type {
  FinanceTx,
  InvoiceListFilter,
  OtherPartyFacts,
  Page,
  PageParams,
  PartyKindTotals,
  PartyStore,
  PaymentListFilter,
  StoredAllocation,
  StoredInvoice,
  StoredOpening,
  StoredPartyEntry,
  StoredPartyPayment,
  StoredSettlement,
} from "../application/party-ports";
import type { PartyEntryKind, PartyType } from "../domain/ledger";
import { placeColumns, placeOf, type PartyPlace } from "../domain/party";

type InvoiceRow = Prisma.ConstructionFinanceInvoiceGetPayload<object>;
type PaymentRow = Prisma.ConstructionFinancePartyPaymentGetPayload<object>;
type SettlementRow = Prisma.ConstructionFinanceSettlementGetPayload<object>;
type OpeningRow = Prisma.ConstructionFinancePartyOpeningGetPayload<object>;

const day = (value: Date | null): CalendarDate | null =>
  value == null ? null : calendarDateFromDb(value);

const toDay = (value: CalendarDate | null): Date | null =>
  value == null ? null : calendarDateToDb(value);

function toInvoice(row: InvoiceRow): StoredInvoice {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    partyType: row.partyType,
    partyId: row.partyId,
    place: placeOf(row),
    direction: row.direction,
    origin: row.origin,
    sourceId: row.sourceId,
    invoiceNumber: row.invoiceNumber,
    invoiceDate: calendarDateFromDb(row.invoiceDate),
    dueDate: day(row.dueDate),
    departmentId: row.departmentId,
    taxableAmount: row.taxableAmount,
    gstAmount: row.gstAmount,
    amount: row.amount,
    remarks: row.remarks,
    settledAt: row.settledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

function toPayment(row: PaymentRow): StoredPartyPayment {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    number: row.number,
    partyType: row.partyType,
    partyId: row.partyId,
    place: placeOf(row),
    direction: row.direction,
    paymentDate: calendarDateFromDb(row.paymentDate),
    accountId: row.accountId,
    mode: row.mode,
    chequeNumber: row.chequeNumber,
    reference: row.reference,
    modeDate: day(row.modeDate),
    amount: row.amount,
    tdsSection: row.tdsSection,
    tdsBase: row.tdsBase,
    tdsRate: row.tdsRate?.toFixed(2) ?? null,
    tdsAmount: row.tdsAmount,
    tdsSuggested: row.tdsSuggested,
    tdsOverrideReason: row.tdsOverrideReason,
    paymentCategoryId: row.paymentCategoryId,
    paidByMemberId: row.paidByMemberId,
    remarks: row.remarks,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

function toSettlement(row: SettlementRow): StoredSettlement {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    invoiceId: row.invoiceId,
    amount: row.amount,
    reason: row.reason,
    approvalStatus: row.approvalStatus,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt,
    rejectReason: row.rejectReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
  };
}

function toOpening(row: OpeningRow): StoredOpening {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    partyType: row.partyType,
    partyId: row.partyId,
    place: placeOf(row),
    asOfDate: calendarDateFromDb(row.asOfDate),
    amount: row.amount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function placeSql(place: PartyPlace, alias = ""): Prisma.Sql {
  const column = (name: string) => Prisma.raw(`${alias}${name}`);
  return place.kind === "project"
    ? Prisma.sql`${column("project_id")} = ${place.id}::uuid`
    : Prisma.sql`${column("store_id")} = ${place.id}::uuid`;
}

function placeWhere(place: PartyPlace) {
  return place.kind === "project"
    ? { projectId: place.id }
    : { storeId: place.id };
}

const partyTypeSql = (type: PartyType) =>
  Prisma.sql`${type}::construction_finance.party_type`;

/** Cursor paging on `(created_at, id)`, newest first (root ADR-0020). */
function cursorSql(page: PageParams, alias: string): Prisma.Sql {
  const cursor = page.after ?? page.before;
  if (cursor == null) return Prisma.sql`TRUE`;
  const created = Prisma.raw(`${alias}created_at`);
  const id = Prisma.raw(`${alias}id`);
  return page.before != null
    ? Prisma.sql`(${created}, ${id}) > (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
    : Prisma.sql`(${created}, ${id}) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`;
}

async function pageOf(
  db: FinanceTx,
  base: Prisma.Sql,
  page: PageParams,
): Promise<Page<{ id: string; createdAt: Date }>> {
  const backwards = page.before != null;
  const order = Prisma.raw(backwards ? "ASC" : "DESC");
  const [rows, counted] = await Promise.all([
    db.$queryRaw<{ id: string; createdAt: Date }[]>(
      Prisma.sql`SELECT id, created_at AS "createdAt" FROM (${base}) AS q
        WHERE ${cursorSql(page, "q.")}
        ORDER BY created_at ${order}, id ${order}
        LIMIT ${page.limit + 1}`,
    ),
    db.$queryRaw<{ total: bigint }[]>(
      Prisma.sql`SELECT COUNT(*)::bigint AS total FROM (${base}) AS q`,
    ),
  ]);
  const hasMore = rows.length > page.limit;
  const items = rows.slice(0, page.limit);
  if (backwards) items.reverse();
  return { items, hasMore, total: Number(counted[0]?.total ?? 0n) };
}

/** Invoices with their live allocations and approved write-offs. */
function invoiceFiguresSql(filter: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`SELECT i.id::text AS id, i.created_at, i.amount, i.due_date,
      i.settled_at, i.invoice_number,
      COALESCE((SELECT SUM(a.amount) FROM construction_finance.payment_allocations a
        WHERE a.invoice_id = i.id AND a.deleted_at IS NULL), 0)::bigint AS allocated,
      COALESCE((SELECT SUM(s.amount) FROM construction_finance.settlements s
        WHERE s.invoice_id = i.id AND s.deleted_at IS NULL
          AND s.approval_status = 'approved'), 0)::bigint AS written_off
    FROM construction_finance.invoices i
    WHERE i.deleted_at IS NULL AND ${filter}`;
}

const OUTSTANDING = Prisma.sql`settled_at IS NULL AND amount - allocated - written_off > 0`;

/** Live party entries, reversal pairs left out. */
const LIVE_ENTRY = Prisma.sql`e.reverses_entry_id IS NULL AND NOT EXISTS (
  SELECT 1 FROM construction_finance.party_entries r WHERE r.reverses_entry_id = e.id)`;

/** The finance party store over Prisma (CM-705). */
export const prismaPartyStore: PartyStore = {
  async otherParties(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    const rows = await db.constructionFinanceOtherParty.findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] }, deletedAt: null },
      include: { projects: { select: { projectId: true } } },
    });
    return new Map(
      rows.map((row): [string, OtherPartyFacts] => [
        row.id,
        {
          id: row.id,
          name: row.name,
          pan: row.pan,
          projectIds: row.projects.map((project) => project.projectId),
        },
      ]),
    );
  },

  async otherPartiesOn(db, workspaceId, projectId) {
    const rows = await db.constructionFinanceOtherParty.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        ...(projectId == null ? {} : { projects: { some: { projectId } } }),
      },
      include: { projects: { select: { projectId: true } } },
      orderBy: { name: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      pan: row.pan,
      projectIds: row.projects.map((project) => project.projectId),
    }));
  },

  async paymentCategoryLive(db, workspaceId, id) {
    return db.constructionFinancePaymentCategory.findFirst({
      where: { id, workspaceId, deletedAt: null, disabledAt: null },
      select: { id: true, name: true },
    });
  },

  async paymentCategoryNames(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    const rows = await db.constructionFinancePaymentCategory.findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row.name]));
  },

  async accountNames(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    const rows = await db.constructionFinanceAccount.findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] } },
      select: { id: true, name: true, kind: true },
    });
    return new Map(
      rows.map((row) => [row.id, { name: row.name, kind: row.kind }]),
    );
  },

  async companyName(db, workspaceId) {
    const row = await db.constructionOrganizationCompanyProfile.findUnique({
      where: { workspaceId },
      select: { name: true },
    });
    return row?.name ?? "";
  },

  // Invoices ---------------------------------------------------------------

  async findInvoice(db, workspaceId, id) {
    const row = await db.constructionFinanceInvoice.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toInvoice(row);
  },

  async findInvoices(db, workspaceId, ids) {
    if (ids.length === 0) return [];
    const rows = await db.constructionFinanceInvoice.findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] }, deletedAt: null },
    });
    return rows.map(toInvoice);
  },

  async lockInvoices(tx, workspaceId, ids) {
    const unique = [...new Set(ids)].sort();
    if (unique.length === 0) return [];
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM construction_finance.invoices
        WHERE workspace_id = ${workspaceId} AND id = ANY(${unique}::uuid[])
          AND deleted_at IS NULL
        ORDER BY id FOR UPDATE`,
    );
    const rows = await tx.constructionFinanceInvoice.findMany({
      where: { workspaceId, id: { in: unique }, deletedAt: null },
    });
    return rows.map(toInvoice);
  },

  async invoiceFigures(db, ids) {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const [allocated, writtenOff] = await Promise.all([
      db.constructionFinancePaymentAllocation.groupBy({
        by: ["invoiceId"],
        where: { invoiceId: { in: unique }, deletedAt: null },
        _sum: { amount: true },
      }),
      db.constructionFinanceSettlement.groupBy({
        by: ["invoiceId"],
        where: {
          invoiceId: { in: unique },
          deletedAt: null,
          approvalStatus: "approved",
        },
        _sum: { amount: true },
      }),
    ]);
    const alloc = new Map(
      allocated.map((row) => [row.invoiceId, row._sum.amount ?? 0n]),
    );
    const off = new Map(
      writtenOff.map((row) => [row.invoiceId, row._sum.amount ?? 0n]),
    );
    return new Map(
      unique.map((id) => [
        id,
        { allocated: alloc.get(id) ?? 0n, writtenOff: off.get(id) ?? 0n },
      ]),
    );
  },

  async payableNumberTaken(db, workspaceId, party, invoiceNumber, exceptId) {
    const rows = await db.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id::text FROM construction_finance.invoices
        WHERE workspace_id = ${workspaceId}
          AND party_type = ${partyTypeSql(party.type)}
          AND party_id = ${party.id}::uuid
          AND direction = 'payable' AND deleted_at IS NULL
          AND lower(invoice_number) = lower(${invoiceNumber})
          AND (${exceptId}::uuid IS NULL OR id <> ${exceptId}::uuid)
        LIMIT 1`,
    );
    return rows.length > 0;
  },

  async insertInvoice(tx, row) {
    await tx.constructionFinanceInvoice.create({
      data: {
        id: row.id,
        workspaceId: row.workspaceId,
        partyType: row.partyType,
        partyId: row.partyId,
        ...placeColumns(row.place),
        direction: row.direction,
        origin: row.origin,
        sourceId: row.sourceId,
        invoiceNumber: row.invoiceNumber,
        invoiceDate: calendarDateToDb(row.invoiceDate),
        dueDate: toDay(row.dueDate),
        departmentId: row.departmentId,
        taxableAmount: row.taxableAmount,
        gstAmount: row.gstAmount,
        amount: row.amount,
        remarks: row.remarks,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        createdBy: row.createdBy,
        updatedBy: row.updatedBy,
      },
    });
  },

  async updateInvoice(tx, id, patch) {
    await tx.constructionFinanceInvoice.update({
      where: { id },
      data: {
        ...(patch.invoiceNumber === undefined
          ? {}
          : { invoiceNumber: patch.invoiceNumber }),
        ...(patch.invoiceDate === undefined
          ? {}
          : { invoiceDate: calendarDateToDb(patch.invoiceDate) }),
        ...(patch.dueDate === undefined
          ? {}
          : { dueDate: toDay(patch.dueDate) }),
        ...(patch.departmentId === undefined
          ? {}
          : { departmentId: patch.departmentId }),
        ...(patch.taxableAmount === undefined
          ? {}
          : { taxableAmount: patch.taxableAmount }),
        ...(patch.gstAmount === undefined
          ? {}
          : { gstAmount: patch.gstAmount }),
        ...(patch.amount === undefined ? {} : { amount: patch.amount }),
        ...(patch.remarks === undefined ? {} : { remarks: patch.remarks }),
        ...(patch.settledAt === undefined
          ? {}
          : { settledAt: patch.settledAt }),
        updatedAt: patch.updatedAt,
        updatedBy: patch.updatedBy,
      },
    });
  },

  async tombstoneInvoice(tx, id, by, at) {
    await tx.constructionFinanceInvoice.update({
      where: { id },
      data: { deletedAt: at, deletedBy: by, updatedAt: at, updatedBy: by },
    });
  },

  async listInvoiceIds(db, filter: InvoiceListFilter, page) {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`i.workspace_id = ${filter.workspaceId}`,
      placeSql(filter.place, "i."),
    ];
    if (filter.partyType != null)
      conditions.push(
        Prisma.sql`i.party_type = ${partyTypeSql(filter.partyType)}`,
      );
    if (filter.partyId != null)
      conditions.push(Prisma.sql`i.party_id = ${filter.partyId}::uuid`);
    if (filter.direction != null)
      conditions.push(
        Prisma.sql`i.direction = ${filter.direction}::construction_finance.invoice_direction`,
      );
    const search = filter.search?.trim() ?? "";
    if (search !== "")
      conditions.push(
        Prisma.sql`i.invoice_number ILIKE ${`%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`}`,
      );
    const figures = invoiceFiguresSql(Prisma.join(conditions, " AND "));
    const outer: Prisma.Sql[] = [Prisma.sql`TRUE`];
    switch (filter.status) {
      case "settled":
        outer.push(Prisma.sql`settled_at IS NOT NULL`);
        break;
      case "paid":
        outer.push(
          Prisma.sql`settled_at IS NULL AND amount - allocated - written_off <= 0`,
        );
        break;
      case "partly_paid":
        outer.push(Prisma.sql`${OUTSTANDING} AND allocated > 0`);
        break;
      case "open":
        outer.push(Prisma.sql`${OUTSTANDING} AND allocated = 0`);
        break;
      default:
        break;
    }
    if (filter.outstanding === true) outer.push(OUTSTANDING);
    if (filter.overdue === true)
      outer.push(
        Prisma.sql`${OUTSTANDING} AND due_date < ${filter.today}::date`,
      );
    const base = Prisma.sql`SELECT id, created_at FROM (${figures}) AS f
      WHERE ${Prisma.join(outer, " AND ")}`;
    return pageOf(db, base, page);
  },

  async outstandingInvoices(db, workspaceId, party, place, direction) {
    const rows = await db.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM (${invoiceFiguresSql(
        Prisma.sql`i.workspace_id = ${workspaceId}
          AND ${placeSql(place, "i.")}
          AND i.party_type = ${partyTypeSql(party.type)}
          AND i.party_id = ${party.id}::uuid
          AND i.direction = ${direction}::construction_finance.invoice_direction`,
      )}) AS f
        WHERE ${OUTSTANDING}
        ORDER BY due_date ASC NULLS LAST, created_at ASC
        LIMIT 500`,
    );
    const ids = rows.map((row) => row.id);
    const found = await prismaPartyStore.findInvoices(db, workspaceId, ids);
    const byId = new Map(found.map((row) => [row.id, row]));
    return ids.flatMap((id) => {
      const row = byId.get(id);
      return row == null ? [] : [row];
    });
  },

  // GRN links --------------------------------------------------------------

  async linksOfInvoices(db, invoiceIds) {
    if (invoiceIds.length === 0) return [];
    const rows = await db.constructionFinanceInvoiceGoodsReceipt.findMany({
      where: { invoiceId: { in: [...new Set(invoiceIds)] }, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      invoiceId: row.invoiceId,
      goodsReceiptId: row.goodsReceiptId,
      grnValue: row.grnValue,
    }));
  },

  async liveLinkOfGoodsReceipt(db, goodsReceiptId) {
    const row = await db.constructionFinanceInvoiceGoodsReceipt.findFirst({
      where: { goodsReceiptId, deletedAt: null, invoice: { deletedAt: null } },
    });
    return row == null
      ? null
      : {
          id: row.id,
          invoiceId: row.invoiceId,
          goodsReceiptId: row.goodsReceiptId,
          grnValue: row.grnValue,
        };
  },

  async insertLinks(tx, workspaceId, links) {
    if (links.length === 0) return;
    await tx.constructionFinanceInvoiceGoodsReceipt.createMany({
      data: links.map((link) => ({
        id: newId(),
        workspaceId,
        invoiceId: link.invoiceId,
        goodsReceiptId: link.goodsReceiptId,
        grnValue: link.grnValue,
      })),
    });
  },

  async updateLinkValue(tx, id, grnValue) {
    await tx.constructionFinanceInvoiceGoodsReceipt.update({
      where: { id },
      data: { grnValue },
    });
  },

  async tombstoneLinks(tx, where, at) {
    await tx.constructionFinanceInvoiceGoodsReceipt.updateMany({
      where: { ...where, deletedAt: null },
      data: { deletedAt: at },
    });
  },

  // Settlements ------------------------------------------------------------

  async findSettlement(db, workspaceId, id) {
    const row = await db.constructionFinanceSettlement.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toSettlement(row);
  },

  async lockSettlements(tx, workspaceId, ids) {
    const unique = [...new Set(ids)].sort();
    if (unique.length === 0) return [];
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM construction_finance.settlements
        WHERE workspace_id = ${workspaceId} AND id = ANY(${unique}::uuid[])
          AND deleted_at IS NULL
        ORDER BY id FOR UPDATE`,
    );
    const rows = await tx.constructionFinanceSettlement.findMany({
      where: { workspaceId, id: { in: unique }, deletedAt: null },
    });
    return rows.map(toSettlement);
  },

  async settlementsOfInvoices(db, invoiceIds) {
    if (invoiceIds.length === 0) return [];
    const rows = await db.constructionFinanceSettlement.findMany({
      where: { invoiceId: { in: [...new Set(invoiceIds)] }, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toSettlement);
  },

  async insertSettlement(tx, row) {
    await tx.constructionFinanceSettlement.create({
      data: {
        id: row.id,
        workspaceId: row.workspaceId,
        invoiceId: row.invoiceId,
        amount: row.amount,
        reason: row.reason,
        approvalStatus: row.approvalStatus,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        createdBy: row.createdBy,
        updatedBy: row.updatedBy,
      },
    });
  },

  async decideSettlement(tx, id, decision) {
    await tx.constructionFinanceSettlement.update({
      where: { id },
      data: {
        approvalStatus: decision.approvalStatus,
        ...(decision.amount == null ? {} : { amount: decision.amount }),
        rejectReason: decision.rejectReason,
        decidedBy: decision.by,
        decidedAt: decision.at,
        updatedBy: decision.by,
        updatedAt: decision.at,
      },
    });
  },

  async listSettlements(db, filter) {
    const placeFilter: Prisma.ConstructionFinanceInvoiceWhereInput[] = [];
    if (filter.projectIds == null)
      placeFilter.push({ projectId: { not: null } });
    else placeFilter.push({ projectId: { in: [...filter.projectIds] } });
    if (filter.includeStores) placeFilter.push({ storeId: { not: null } });
    const rows = await db.constructionFinanceSettlement.findMany({
      where: {
        workspaceId: filter.workspaceId,
        deletedAt: null,
        ...(filter.status == null ? {} : { approvalStatus: filter.status }),
        invoice: {
          deletedAt: null,
          OR: placeFilter,
          ...(filter.partyType == null ? {} : { partyType: filter.partyType }),
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 500,
    });
    return rows.map(toSettlement);
  },

  // Payments ---------------------------------------------------------------

  async findPayment(db, workspaceId, id) {
    const row = await db.constructionFinancePartyPayment.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toPayment(row);
  },

  async lockPayment(tx, workspaceId, id) {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM construction_finance.party_payments
        WHERE id = ${id}::uuid AND workspace_id = ${workspaceId}
          AND deleted_at IS NULL FOR UPDATE`,
    );
    return prismaPartyStore.findPayment(tx, workspaceId, id);
  },

  async insertPayment(tx, row) {
    await tx.constructionFinancePartyPayment.create({
      data: {
        id: row.id,
        workspaceId: row.workspaceId,
        number: row.number,
        partyType: row.partyType,
        partyId: row.partyId,
        ...placeColumns(row.place),
        direction: row.direction,
        paymentDate: calendarDateToDb(row.paymentDate),
        accountId: row.accountId,
        mode: row.mode,
        chequeNumber: row.chequeNumber,
        reference: row.reference,
        modeDate: toDay(row.modeDate),
        amount: row.amount,
        tdsSection: row.tdsSection,
        tdsBase: row.tdsBase,
        tdsRate: row.tdsRate == null ? null : new Prisma.Decimal(row.tdsRate),
        tdsAmount: row.tdsAmount,
        tdsSuggested: row.tdsSuggested,
        tdsOverrideReason: row.tdsOverrideReason,
        paymentCategoryId: row.paymentCategoryId,
        paidByMemberId: row.paidByMemberId,
        remarks: row.remarks,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        createdBy: row.createdBy,
        updatedBy: row.updatedBy,
      },
    });
  },

  async touchPayment(tx, id, by, at) {
    await tx.constructionFinancePartyPayment.update({
      where: { id },
      data: { updatedAt: at, updatedBy: by },
    });
  },

  async tombstonePayment(tx, id, by, at) {
    await tx.constructionFinancePartyPayment.update({
      where: { id },
      data: { deletedAt: at, deletedBy: by, updatedAt: at, updatedBy: by },
    });
  },

  async listPaymentIds(db, filter: PaymentListFilter, page) {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`p.workspace_id = ${filter.workspaceId}`,
      Prisma.sql`p.deleted_at IS NULL`,
      placeSql(filter.place, "p."),
    ];
    if (filter.partyType != null)
      conditions.push(
        Prisma.sql`p.party_type = ${partyTypeSql(filter.partyType)}`,
      );
    if (filter.partyId != null)
      conditions.push(Prisma.sql`p.party_id = ${filter.partyId}::uuid`);
    if (filter.direction != null)
      conditions.push(
        Prisma.sql`p.direction = ${filter.direction}::construction_finance.payment_direction`,
      );
    if (filter.from != null)
      conditions.push(Prisma.sql`p.payment_date >= ${filter.from}::date`);
    if (filter.to != null)
      conditions.push(Prisma.sql`p.payment_date <= ${filter.to}::date`);
    const search = filter.search?.trim() ?? "";
    if (search !== "") {
      const like = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      conditions.push(
        Prisma.sql`(p.number ILIKE ${like} OR p.reference ILIKE ${like} OR p.cheque_number ILIKE ${like})`,
      );
    }
    const base = Prisma.sql`SELECT p.id::text AS id, p.created_at
      FROM construction_finance.party_payments p
      WHERE ${Prisma.join(conditions, " AND ")}`;
    return pageOf(db, base, page);
  },

  async findPayments(db, workspaceId, ids) {
    if (ids.length === 0) return [];
    const rows = await db.constructionFinancePartyPayment.findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] }, deletedAt: null },
    });
    return rows.map(toPayment);
  },

  async allocationsOfPayments(db, paymentIds) {
    if (paymentIds.length === 0) return [];
    const rows = await db.constructionFinancePaymentAllocation.findMany({
      where: { paymentId: { in: [...new Set(paymentIds)] }, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row): StoredAllocation => ({
      id: row.id,
      paymentId: row.paymentId,
      invoiceId: row.invoiceId,
      amount: row.amount,
      createdAt: row.createdAt,
    }));
  },

  async allocationsOfInvoices(db, invoiceIds) {
    if (invoiceIds.length === 0) return [];
    const rows = await db.constructionFinancePaymentAllocation.findMany({
      where: { invoiceId: { in: [...new Set(invoiceIds)] }, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row): StoredAllocation => ({
      id: row.id,
      paymentId: row.paymentId,
      invoiceId: row.invoiceId,
      amount: row.amount,
      createdAt: row.createdAt,
    }));
  },

  async insertAllocations(tx, workspaceId, by, paymentId, allocations) {
    if (allocations.length === 0) return;
    await tx.constructionFinancePaymentAllocation.createMany({
      data: allocations.map((allocation) => ({
        id: newId(),
        workspaceId,
        paymentId,
        invoiceId: allocation.invoiceId,
        amount: allocation.amount,
        createdBy: by,
      })),
    });
  },

  async tombstoneAllocations(tx, paymentId, by, at) {
    await tx.constructionFinancePaymentAllocation.updateMany({
      where: { paymentId, deletedAt: null },
      data: { deletedAt: at, deletedBy: by },
    });
  },

  async duplicateReference(db, workspaceId, accountId, reference) {
    const rows = await db.$queryRaw<{ documentNumber: string | null }[]>(
      Prisma.sql`SELECT e.document_number AS "documentNumber"
        FROM construction_finance.account_entries e
        WHERE e.workspace_id = ${workspaceId}
          AND e.account_id = ${accountId}::uuid
          AND lower(e.reference) = lower(${reference.trim()})
          AND e.reverses_entry_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM construction_finance.account_entries r
            WHERE r.reverses_entry_id = e.id)
        LIMIT 1`,
    );
    return rows[0] ?? null;
  },

  async contractorYearToDate(db, workspaceId, contractorId, range, exceptId) {
    const rows = await db.$queryRaw<
      { settled: bigint; undeductedBase: bigint }[]
    >(
      Prisma.sql`SELECT
          COALESCE(SUM(amount + tds_amount), 0)::bigint AS settled,
          COALESCE(SUM(CASE WHEN tds_amount = 0
            THEN COALESCE(tds_base, amount) ELSE 0 END), 0)::bigint AS "undeductedBase"
        FROM construction_finance.party_payments
        WHERE workspace_id = ${workspaceId}
          AND party_type = 'contractor' AND party_id = ${contractorId}::uuid
          AND direction = 'out' AND deleted_at IS NULL
          AND payment_date >= ${range.from}::date
          AND payment_date <= ${range.upTo}::date
          AND (${exceptId}::uuid IS NULL OR id <> ${exceptId}::uuid)`,
    );
    return rows[0] ?? { settled: 0n, undeductedBase: 0n };
  },

  async advances(db, workspaceId, partyType, place) {
    const rows = await db.$queryRaw<{ partyId: string; advance: bigint }[]>(
      Prisma.sql`SELECT p.party_id::text AS "partyId",
          SUM(p.amount + p.tds_amount - COALESCE((SELECT SUM(a.amount)
            FROM construction_finance.payment_allocations a
            WHERE a.payment_id = p.id AND a.deleted_at IS NULL), 0))::bigint AS advance
        FROM construction_finance.party_payments p
        WHERE p.workspace_id = ${workspaceId}
          AND p.party_type = ${partyTypeSql(partyType)}
          AND ${placeSql(place, "p.")} AND p.deleted_at IS NULL
        GROUP BY p.party_id`,
    );
    return new Map(rows.map((row) => [row.partyId, row.advance]));
  },

  async tdsLedger(db, workspaceId, contractorId, range) {
    const rows = await db.constructionFinancePartyPayment.findMany({
      where: {
        workspaceId,
        partyType: "contractor",
        partyId: contractorId,
        direction: "out",
        deletedAt: null,
        paymentDate: {
          gte: calendarDateToDb(range.from),
          lte: calendarDateToDb(range.to),
        },
      },
      orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }],
    });
    return rows.map((row) => ({
      paymentId: row.id,
      number: row.number,
      paymentDate: calendarDateFromDb(row.paymentDate),
      projectId: row.projectId,
      storeId: row.storeId,
      amount: row.amount,
      tdsSection: row.tdsSection,
      tdsBase: row.tdsBase,
      tdsRate: row.tdsRate?.toFixed(2) ?? null,
      tdsAmount: row.tdsAmount,
      tdsSuggested: row.tdsSuggested,
      tdsOverrideReason: row.tdsOverrideReason,
    }));
  },

  // Openings ---------------------------------------------------------------

  async findOpening(db, workspaceId, id) {
    const row = await db.constructionFinancePartyOpening.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toOpening(row);
  },

  async lockOpeningOf(tx, workspaceId, party, place) {
    const rows = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id::text FROM construction_finance.party_openings
        WHERE workspace_id = ${workspaceId}
          AND party_type = ${partyTypeSql(party.type)}
          AND party_id = ${party.id}::uuid
          AND ${placeSql(place)} AND deleted_at IS NULL
        FOR UPDATE`,
    );
    const id = rows[0]?.id;
    return id == null
      ? null
      : prismaPartyStore.findOpening(tx, workspaceId, id);
  },

  async lockOpening(tx, workspaceId, id) {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM construction_finance.party_openings
        WHERE id = ${id}::uuid AND workspace_id = ${workspaceId}
          AND deleted_at IS NULL FOR UPDATE`,
    );
    return prismaPartyStore.findOpening(tx, workspaceId, id);
  },

  async insertOpening(tx, row) {
    await tx.constructionFinancePartyOpening.create({
      data: {
        id: row.id,
        workspaceId: row.workspaceId,
        partyType: row.partyType,
        partyId: row.partyId,
        ...placeColumns(row.place),
        asOfDate: calendarDateToDb(row.asOfDate),
        amount: row.amount,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        createdBy: row.by,
        updatedBy: row.by,
      },
    });
  },

  async updateOpening(tx, id, patch) {
    await tx.constructionFinancePartyOpening.update({
      where: { id },
      data: {
        asOfDate: calendarDateToDb(patch.asOfDate),
        amount: patch.amount,
        updatedAt: patch.at,
        updatedBy: patch.by,
      },
    });
  },

  async tombstoneOpening(tx, id, by, at) {
    await tx.constructionFinancePartyOpening.update({
      where: { id },
      data: { deletedAt: at, deletedBy: by, updatedAt: at, updatedBy: by },
    });
  },

  async openingsOn(db, workspaceId, partyType, place) {
    const rows = await db.constructionFinancePartyOpening.findMany({
      where: { workspaceId, partyType, deletedAt: null, ...placeWhere(place) },
    });
    return rows.map(toOpening);
  },

  // Party ledger reads -----------------------------------------------------

  async kindTotals(db, workspaceId, partyType, place, partyId) {
    const rows = await db.$queryRaw<
      { partyId: string; kind: PartyEntryKind; amount: bigint }[]
    >(
      Prisma.sql`SELECT party_id::text AS "partyId", kind::text AS kind,
          SUM(amount)::bigint AS amount
        FROM construction_finance.party_entries
        WHERE workspace_id = ${workspaceId}
          AND party_type = ${partyTypeSql(partyType)}
          AND ${placeSql(place)}
          AND (${partyId ?? null}::uuid IS NULL OR party_id = ${partyId ?? null}::uuid)
        GROUP BY party_id, kind`,
    );
    const byParty = new Map<string, PartyKindTotals>();
    for (const row of rows) {
      const totals = byParty.get(row.partyId) ?? {
        partyId: row.partyId,
        byKind: {},
        total: 0n,
      };
      totals.byKind[row.kind] = row.amount;
      totals.total += row.amount;
      byParty.set(row.partyId, totals);
    }
    return [...byParty.values()];
  },

  async liveEntries(db, workspaceId, party, place, range) {
    const rows = await db.$queryRaw<
      (Omit<StoredPartyEntry, "entryDate"> & { entryDate: Date })[]
    >(
      Prisma.sql`SELECT e.id::text AS id, e.party_type::text AS "partyType",
          e.party_id::text AS "partyId", e.entry_date AS "entryDate",
          e.kind::text AS kind, e.amount, e.invoice_id::text AS "invoiceId",
          e.source_type::text AS "sourceType", e.source_id::text AS "sourceId",
          e.created_at AS "createdAt"
        FROM construction_finance.party_entries e
        WHERE e.workspace_id = ${workspaceId}
          AND e.party_type = ${partyTypeSql(party.type)}
          AND e.party_id = ${party.id}::uuid
          AND ${placeSql(place, "e.")}
          AND ${LIVE_ENTRY}
          AND (${range.from}::date IS NULL OR e.entry_date >= ${range.from}::date)
          AND (${range.to}::date IS NULL OR e.entry_date <= ${range.to}::date)
        ORDER BY e.entry_date, e.created_at, e.id`,
    );
    return rows.map((row) => ({
      ...row,
      entryDate: calendarDateFromDb(row.entryDate),
    }));
  },

  async balanceBefore(db, workspaceId, party, place, date) {
    const rows = await db.$queryRaw<{ amount: bigint }[]>(
      Prisma.sql`SELECT COALESCE(SUM(amount), 0)::bigint AS amount
        FROM construction_finance.party_entries
        WHERE workspace_id = ${workspaceId}
          AND party_type = ${partyTypeSql(party.type)}
          AND party_id = ${party.id}::uuid
          AND ${placeSql(place)}
          AND entry_date < ${date}::date`,
    );
    return rows[0]?.amount ?? 0n;
  },

  async balancesByProject(db, workspaceId, partyType, projectIds) {
    if (projectIds?.length === 0) return [];
    const scope =
      projectIds == null
        ? Prisma.sql`project_id IS NOT NULL`
        : Prisma.sql`project_id = ANY(${[...projectIds]}::uuid[])`;
    return db.$queryRaw<
      { partyId: string; projectId: string; amount: bigint }[]
    >(
      Prisma.sql`SELECT party_id::text AS "partyId", project_id::text AS "projectId",
          SUM(amount)::bigint AS amount
        FROM construction_finance.party_entries
        WHERE workspace_id = ${workspaceId}
          AND party_type = ${partyTypeSql(partyType)}
          AND ${scope}
        GROUP BY party_id, project_id`,
    );
  },

  async overdueByParty(db, workspaceId, partyType, place, today) {
    const rows = await db.$queryRaw<{ partyId: string; amount: bigint }[]>(
      Prisma.sql`SELECT party_id AS "partyId",
          SUM(amount - allocated - written_off)::bigint AS amount
        FROM (SELECT i.party_id::text AS party_id, i.amount, i.due_date, i.settled_at,
            COALESCE((SELECT SUM(a.amount) FROM construction_finance.payment_allocations a
              WHERE a.invoice_id = i.id AND a.deleted_at IS NULL), 0)::bigint AS allocated,
            COALESCE((SELECT SUM(s.amount) FROM construction_finance.settlements s
              WHERE s.invoice_id = i.id AND s.deleted_at IS NULL
                AND s.approval_status = 'approved'), 0)::bigint AS written_off
          FROM construction_finance.invoices i
          WHERE i.workspace_id = ${workspaceId} AND i.deleted_at IS NULL
            AND i.party_type = ${partyTypeSql(partyType)}
            AND ${placeSql(place, "i.")}
            AND i.due_date < ${today}::date) AS f
        WHERE ${OUTSTANDING}
        GROUP BY party_id`,
    );
    return new Map(rows.map((row) => [row.partyId, row.amount]));
  },
};
