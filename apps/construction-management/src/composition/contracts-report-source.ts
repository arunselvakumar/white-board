import { Prisma, prisma, type PrismaClient } from "@repo/construction-db";

import { contractsDirectory } from "@/src/composition/contracts-directory";
import { contractsMaterialIssues } from "@/src/composition/contracts-material-issues";
import { reconcileWorkOrder } from "@/src/contracts/application/reconciliation-handlers";
import {
  BILL_STATUS_LABELS,
  DEDUCTION_KIND_LABELS,
  ISSUE_BASIS_LABELS,
  VARIATION_KIND_LABELS,
  VARIATION_STATUS_LABELS,
  WORK_ORDER_STATUS_LABELS,
  type BillStatus,
  type DeductionKind,
  type VariationKind,
  type VariationStatus,
  type WorkOrderStatus,
} from "@/src/contracts/domain/contract-terms";
import { reconciliationQuantityText } from "@/src/contracts/domain/material-reconciliation";
import { PrismaReconciliationStore } from "@/src/contracts/infrastructure/prisma-reconciliation-store";
import { PrismaWorkOrderStore } from "@/src/contracts/infrastructure/prisma-work-order-store";
import type { ContractsReportSource } from "@/src/reporting/application/ports";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

/**
 * The contracts reports' read model (CM-1111): plain reads of the
 * `construction_contracts` tables with the names they show (Contractors,
 * Clients, Departments, units, Materials from masters), and the material
 * reconciliation through contracts' own `reconcileWorkOrder`, so the
 * report says what the Work Order's statement says. Money is paise as
 * numbers; quantities numbers with up to three decimals.
 */

const CT = "construction_contracts";
const MS = "construction_masters";

const sql = (text: string) => Prisma.raw(text);

function paise(value: bigint | number | null): number {
  const number = Number(value ?? 0);
  if (!Number.isSafeInteger(number))
    throw new Error("A contracts amount is beyond a safe integer.");
  return number;
}

/** A DECIMAL as a number rounded to three decimals. */
function quantity(value: Prisma.Decimal | string | number | null): number {
  if (value == null) return 0;
  return Math.round(Number(value) * 1000) / 1000;
}

function date(value: Date): CalendarDate {
  return value.toISOString().slice(0, 10);
}

const name = (table: string, idSql: string) =>
  `(SELECT x.name FROM ${table} x WHERE x.id = ${idSql})`;
const contractorOf = (workOrderSql: string) =>
  `(SELECT c.name FROM ${CT}.work_orders w JOIN ${MS}.contractors c ON c.id = w.contractor_id WHERE w.id = ${workOrderSql})`;

/** Who decided: the Team Member's name, else nothing. */
const memberName = (userSql: string, workspaceSql: string) =>
  `(SELECT m.name FROM construction_organization.team_members m WHERE m.workspace_id = ${workspaceSql} AND m.user_id = ${userSql} ORDER BY (m.deleted_at IS NULL) DESC, m.created_at DESC LIMIT 1)`;

export function createContractsReportSource(
  db: PrismaClient = prisma,
): ContractsReportSource {
  const reconciliation = {
    store: new PrismaReconciliationStore(),
    workOrders: new PrismaWorkOrderStore(),
    issues: contractsMaterialIssues,
    directory: contractsDirectory,
  };

  return {
    async boqExecuted(workspaceId, projectId, asOn) {
      const rows = await db.$queryRaw<
        {
          section: string;
          itemNo: string;
          description: string;
          unit: string | null;
          quantity: Prisma.Decimal;
          rate: bigint;
          executed: Prisma.Decimal | null;
          billed: Prisma.Decimal | null;
        }[]
      >(Prisma.sql`
        SELECT s.title AS section, i.item_no AS "itemNo", i.description,
               ${sql(name(`${MS}.measurement_units`, "i.uom_id"))} AS unit,
               i.quantity, i.rate,
               (SELECT SUM(r.quantity) FROM ${sql(`${CT}.measurement_rows`)} r
                  JOIN ${sql(`${CT}.measurement_sheets`)} m ON m.id = r.sheet_id
                 WHERE r.boq_item_id = i.id AND m.deleted_at IS NULL
                   AND m.side = 'client' AND m.status = 'checked'
                   AND m.measured_on <= ${asOn}::date) AS executed,
               (SELECT SUM(l.quantity) FROM ${sql(`${CT}.bill_lines`)} l
                  JOIN ${sql(`${CT}.bills`)} b ON b.id = l.bill_id
                 WHERE l.boq_item_id = i.id AND b.deleted_at IS NULL
                   AND b.side = 'client' AND b.type = 'running'
                   AND b.status = 'approved' AND b.bill_date <= ${asOn}::date) AS billed
          FROM ${sql(`${CT}.boq_items`)} i
          JOIN ${sql(`${CT}.boq_sections`)} s ON s.id = i.section_id
         WHERE i.workspace_id = ${workspaceId} AND i.project_id = ${projectId}::uuid
           AND i.deleted_at IS NULL AND s.deleted_at IS NULL
         ORDER BY s.position, i.position, i.id`);
      return rows.map((row) => ({
        section: row.section,
        itemNo: row.itemNo,
        description: row.description,
        unit: row.unit ?? "",
        boqQuantity: quantity(row.quantity),
        executed: quantity(row.executed),
        billed: quantity(row.billed),
        rate: paise(row.rate),
      }));
    },

    async workOrders(workspaceId, projectId, range) {
      const rows = await db.$queryRaw<
        {
          number: string | null;
          orderDate: Date;
          contractor: string | null;
          department: string | null;
          status: WorkOrderStatus;
          revision: number;
          retentionPercent: Prisma.Decimal;
          value: bigint;
          billed: bigint;
        }[]
      >(Prisma.sql`
        SELECT w.number, w.order_date AS "orderDate",
               ${sql(name(`${MS}.contractors`, "w.contractor_id"))} AS contractor,
               ${sql(name(`${MS}.departments`, "w.department_id"))} AS department,
               w.status, w.revision, w.retention_percent AS "retentionPercent",
               (SELECT COALESCE(SUM(ROUND(l.quantity * l.rate)), 0)::bigint
                  FROM ${sql(`${CT}.work_order_lines`)} l
                 WHERE l.work_order_id = w.id AND l.deleted_at IS NULL) AS value,
               (SELECT COALESCE(SUM(b.gross), 0)::bigint FROM ${sql(`${CT}.bills`)} b
                 WHERE b.work_order_id = w.id AND b.deleted_at IS NULL
                   AND b.type = 'running' AND b.status = 'approved') AS billed
          FROM ${sql(`${CT}.work_orders`)} w
         WHERE w.workspace_id = ${workspaceId} AND w.project_id = ${projectId}::uuid
           AND w.deleted_at IS NULL
           AND w.order_date BETWEEN ${range.from}::date AND ${range.to}::date
         ORDER BY w.order_date, w.number NULLS LAST, w.id`);
      return rows.map((row) => ({
        number: row.number,
        orderDate: date(row.orderDate),
        contractor: row.contractor ?? "",
        department: row.department,
        status: WORK_ORDER_STATUS_LABELS[row.status],
        revision: row.revision,
        retentionPercent: Number(row.retentionPercent),
        value: paise(row.value),
        billed: paise(row.billed),
      }));
    },

    async bills(workspaceId, projectId, side, range) {
      const rows = await db.$queryRaw<
        {
          number: string | null;
          ordinal: number | null;
          type: "running" | "escalation";
          billDate: Date;
          party: string | null;
          workOrder: string | null;
          status: BillStatus;
          gross: bigint;
          gst: bigint;
          deductions: bigint;
          net: bigint;
        }[]
      >(Prisma.sql`
        SELECT b.number, b.ordinal, b.type, b.bill_date AS "billDate",
               ${sql(side === "contractor" ? contractorOf("b.work_order_id") : name(`${MS}.clients`, "b.client_id"))} AS party,
               (SELECT w.number FROM ${sql(`${CT}.work_orders`)} w WHERE w.id = b.work_order_id) AS "workOrder",
               b.status, b.gross, (b.cgst + b.sgst + b.igst) AS gst,
               b.deductions_total AS deductions, b.net
          FROM ${sql(`${CT}.bills`)} b
         WHERE b.workspace_id = ${workspaceId} AND b.project_id = ${projectId}::uuid
           AND b.deleted_at IS NULL AND b.side = ${side}::${sql(`${CT}.side`)}
           AND b.bill_date BETWEEN ${range.from}::date AND ${range.to}::date
         ORDER BY b.bill_date, b.ordinal NULLS LAST, b.id`);
      return rows.map((row) => ({
        number: row.number,
        ordinal: row.ordinal,
        type: row.type === "running" ? "RA" : "Escalation",
        billDate: date(row.billDate),
        party: row.party ?? "",
        workOrder: row.workOrder,
        status: BILL_STATUS_LABELS[row.status],
        gross: paise(row.gross),
        gst: paise(row.gst),
        deductions: paise(row.deductions),
        net: paise(row.net),
      }));
    },

    async deductions(workspaceId, projectId, range) {
      const rows = await db.$queryRaw<
        {
          billDate: Date;
          billNumber: string | null;
          contractor: string | null;
          workOrder: string | null;
          kind: DeductionKind;
          description: string | null;
          material: string | null;
          escalation: string | null;
          amount: bigint;
        }[]
      >(Prisma.sql`
        SELECT b.bill_date AS "billDate", b.number AS "billNumber",
               ${sql(contractorOf("b.work_order_id"))} AS contractor,
               (SELECT w.number FROM ${sql(`${CT}.work_orders`)} w WHERE w.id = b.work_order_id) AS "workOrder",
               d.kind, d.description,
               ${sql(name(`${MS}.materials`, "d.material_id"))} AS material,
               (SELECT e.number FROM ${sql(`${CT}.bills`)} e WHERE e.id = d.escalation_bill_id) AS escalation,
               d.amount
          FROM ${sql(`${CT}.bill_deductions`)} d
          JOIN ${sql(`${CT}.bills`)} b ON b.id = d.bill_id
         WHERE b.workspace_id = ${workspaceId} AND b.project_id = ${projectId}::uuid
           AND b.deleted_at IS NULL AND b.side = 'contractor' AND b.status = 'approved'
           AND b.bill_date BETWEEN ${range.from}::date AND ${range.to}::date
         ORDER BY b.bill_date, b.ordinal NULLS LAST, b.id, d.position`);
      return rows.map((row) => ({
        billDate: date(row.billDate),
        billNumber: row.billNumber ?? "",
        contractor: row.contractor ?? "",
        workOrder: row.workOrder,
        kind: DEDUCTION_KIND_LABELS[row.kind],
        detail:
          [
            row.material,
            row.escalation == null ? null : `Escalation bill ${row.escalation}`,
            row.description,
          ]
            .filter((part): part is string => part != null && part !== "")
            .join(": ") || null,
        amount: paise(row.amount),
      }));
    },

    async retention(workspaceId, projectId, asOn) {
      const [contractor, client] = await Promise.all([
        db.$queryRaw<
          {
            contract: string | null;
            party: string | null;
            retentionPercent: Prisma.Decimal;
            held: bigint;
            released: bigint;
          }[]
        >(Prisma.sql`
          SELECT w.number AS contract,
                 ${sql(name(`${MS}.contractors`, "w.contractor_id"))} AS party,
                 w.retention_percent AS "retentionPercent",
                 (SELECT COALESCE(SUM(d.amount), 0)::bigint
                    FROM ${sql(`${CT}.bill_deductions`)} d
                    JOIN ${sql(`${CT}.bills`)} b ON b.id = d.bill_id
                   WHERE b.work_order_id = w.id AND b.deleted_at IS NULL
                     AND b.status = 'approved' AND d.kind = 'retention'
                     AND b.bill_date <= ${asOn}::date) AS held,
                 (SELECT COALESCE(SUM(r.amount), 0)::bigint
                    FROM ${sql(`${CT}.retention_releases`)} r
                   WHERE r.work_order_id = w.id AND r.side = 'contractor'
                     AND r.deleted_at IS NULL AND r.released_on <= ${asOn}::date) AS released
            FROM ${sql(`${CT}.work_orders`)} w
           WHERE w.workspace_id = ${workspaceId} AND w.project_id = ${projectId}::uuid
             AND w.deleted_at IS NULL
           ORDER BY w.order_date, w.number NULLS LAST, w.id`),
        db.$queryRaw<
          {
            party: string | null;
            retentionPercent: Prisma.Decimal | null;
            held: bigint;
            released: bigint;
          }[]
        >(Prisma.sql`
          SELECT (SELECT p.client_name FROM construction_projects.projects p WHERE p.id = ${projectId}::uuid) AS party,
                 (SELECT c.retention_percent FROM ${sql(`${CT}.client_contracts`)} c
                   WHERE c.project_id = ${projectId}::uuid) AS "retentionPercent",
                 (SELECT COALESCE(SUM(d.amount), 0)::bigint
                    FROM ${sql(`${CT}.bill_deductions`)} d
                    JOIN ${sql(`${CT}.bills`)} b ON b.id = d.bill_id
                   WHERE b.workspace_id = ${workspaceId} AND b.project_id = ${projectId}::uuid
                     AND b.side = 'client' AND b.deleted_at IS NULL
                     AND b.status = 'approved' AND d.kind = 'retention'
                     AND b.bill_date <= ${asOn}::date) AS held,
                 (SELECT COALESCE(SUM(r.amount), 0)::bigint
                    FROM ${sql(`${CT}.retention_releases`)} r
                   WHERE r.workspace_id = ${workspaceId} AND r.project_id = ${projectId}::uuid
                     AND r.side = 'client' AND r.deleted_at IS NULL
                     AND r.released_on <= ${asOn}::date) AS released`),
      ]);
      const row = (input: {
        contract: string;
        party: string | null;
        retentionPercent: Prisma.Decimal | null;
        held: bigint;
        released: bigint;
      }) => ({
        contract: input.contract,
        party: input.party ?? "",
        retentionPercent: Number(input.retentionPercent ?? 0),
        held: paise(input.held),
        released: paise(input.released),
      });
      return {
        contractor: contractor
          .filter((held) => held.held > 0n || held.released > 0n)
          .map((held) => row({ ...held, contract: held.contract ?? "Draft" })),
        client: client
          .filter((held) => held.held > 0n || held.released > 0n)
          .map((held) => row({ ...held, contract: "Client contract" })),
      };
    },

    async materialReconciliation(workspaceId, projectId, asOn) {
      // Issued and closed Work Orders, and the ordinal after the last
      // approved RA bill dated up to the date (the statement's point).
      const orders = await db.$queryRaw<
        { id: string; nextOrdinal: number | null }[]
      >(Prisma.sql`
        SELECT w.id::text AS id,
               (SELECT MAX(b.ordinal) + 1 FROM ${sql(`${CT}.bills`)} b
                 WHERE b.work_order_id = w.id AND b.deleted_at IS NULL
                   AND b.type = 'running' AND b.status = 'approved'
                   AND b.bill_date <= ${asOn}::date)::int AS "nextOrdinal"
          FROM ${sql(`${CT}.work_orders`)} w
         WHERE w.workspace_id = ${workspaceId} AND w.project_id = ${projectId}::uuid
           AND w.deleted_at IS NULL AND w.status IN ('issued', 'closed')
         ORDER BY w.order_date, w.number NULLS LAST, w.id`);
      const out = [];
      for (const order of orders) {
        const workOrder = await reconciliation.workOrders.find(
          db,
          workspaceId,
          order.id,
        );
        if (workOrder == null) continue;
        const contractors = await contractsDirectory.contractors(
          db,
          workspaceId,
          projectId,
          [workOrder.contractorId],
        );
        const statement = await reconcileWorkOrder(
          reconciliation,
          db,
          workspaceId,
          workOrder,
          {
            billId: null,
            // No approved bill yet: nothing is billed, so nothing is theoretical.
            ordinal: order.nextOrdinal ?? 1,
            upTo: asOn,
            own: new Map(),
          },
        );
        for (const row of statement.materials) {
          const due = row.excessValue ?? 0n;
          out.push({
            workOrder: workOrder.number ?? "Draft",
            contractor: contractors.get(workOrder.contractorId)?.name ?? "",
            material: row.materialName,
            unit: row.uomName,
            basis: ISSUE_BASIS_LABELS[row.terms.issueBasis],
            theoretical: Number(reconciliationQuantityText(row.theoretical)),
            wastagePercent: Number(row.terms.wastagePercent) / 100,
            allowed: Number(reconciliationQuantityText(row.allowed)),
            issued: Number(reconciliationQuantityText(row.netIssued)),
            excess: Number(reconciliationQuantityText(row.excess)),
            flag: row.underUse ? "Under-use" : null,
            penalRate:
              row.terms.penalRate == null ? null : paise(row.terms.penalRate),
            recoveryDue: paise(due),
            recovered: paise(row.recoveredBefore),
          });
        }
      }
      return out;
    },

    async variations(workspaceId, projectId, range) {
      // Raised on: the day in the Company's time zone, as the screens show it.
      const zone = await db.$queryRaw<{ timezone: string | null }[]>(
        Prisma.sql`SELECT timezone FROM construction_organization.company_profiles
          WHERE workspace_id = ${workspaceId} LIMIT 1`,
      );
      const timeZone = zone[0]?.timezone ?? "Asia/Kolkata";
      const rows = await db.$queryRaw<
        {
          number: string;
          createdAt: Date;
          kind: VariationKind;
          status: VariationStatus;
          itemNo: string | null;
          description: string | null;
          unit: string | null;
          previousQuantity: Prisma.Decimal | null;
          newQuantity: Prisma.Decimal | null;
          previousRate: bigint | null;
          newRate: bigint | null;
          itemQuantity: Prisma.Decimal | null;
          itemRate: bigint | null;
          reason: string;
          decidedBy: string | null;
        }[]
      >(Prisma.sql`
        SELECT v.number, v.created_at AS "createdAt", v.kind, v.status,
               COALESCE(v.item_no, i.item_no) AS "itemNo",
               COALESCE(v.description, i.description) AS description,
               ${sql(name(`${MS}.measurement_units`, "COALESCE(v.uom_id, i.uom_id)"))} AS unit,
               v.previous_quantity AS "previousQuantity", v.new_quantity AS "newQuantity",
               v.previous_rate AS "previousRate", v.new_rate AS "newRate",
               i.quantity AS "itemQuantity", i.rate AS "itemRate",
               v.reason,
               ${sql(memberName("v.decided_by", "v.workspace_id"))} AS "decidedBy"
          FROM ${sql(`${CT}.variations`)} v
          LEFT JOIN ${sql(`${CT}.boq_items`)} i ON i.id = v.boq_item_id
         WHERE v.workspace_id = ${workspaceId} AND v.project_id = ${projectId}::uuid
           AND v.deleted_at IS NULL
           AND (v.created_at AT TIME ZONE ${timeZone})::date
               BETWEEN ${range.from}::date AND ${range.to}::date
         ORDER BY v.created_at, v.id`);
      return rows.map((row) => {
        const rate = (value: bigint | null) =>
          value == null ? null : paise(value);
        // What the item was and becomes: an extra item adds its whole
        // value, a quantity change keeps the rate, a rate change the quantity.
        const before =
          row.kind === "extra_item"
            ? 0
            : quantity(row.previousQuantity ?? row.itemQuantity) *
              Number(row.previousRate ?? row.itemRate ?? 0);
        const after =
          quantity(
            row.newQuantity ?? row.previousQuantity ?? row.itemQuantity,
          ) * Number(row.newRate ?? row.previousRate ?? row.itemRate ?? 0);
        return {
          number: row.number,
          raisedOn: new Intl.DateTimeFormat("en-CA", {
            timeZone,
          }).format(row.createdAt),
          kind: VARIATION_KIND_LABELS[row.kind],
          status: VARIATION_STATUS_LABELS[row.status],
          itemNo: row.itemNo,
          description: row.description,
          unit: row.unit,
          previousQuantity:
            row.previousQuantity == null
              ? null
              : quantity(row.previousQuantity),
          newQuantity:
            row.newQuantity == null ? null : quantity(row.newQuantity),
          previousRate: rate(row.previousRate),
          newRate: rate(row.newRate),
          valueChange: Math.round(after - before),
          reason: row.reason,
          decidedBy: row.decidedBy,
        };
      });
    },
  };
}
