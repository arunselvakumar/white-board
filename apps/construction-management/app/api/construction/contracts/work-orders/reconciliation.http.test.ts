import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { afterEach, describe, expect, it, vi } from "vitest";

import { POST as assignWorkOrderRoute } from "@/app/api/construction/procurement/material-requests/[id]/assign-work-order/route";
import { GET as mrFormOptionsRoute } from "@/app/api/construction/procurement/material-requests/form-options/route";
import type {
  ConstructionProcurementMaterialRequestResponseModel,
  GetConstructionProcurementMaterialRequestFormOptionsResponseModel,
} from "@/app/api/construction/procurement/material-requests/material-request-models";
import { POST as createMaterialRequestRoute } from "@/app/api/construction/procurement/material-requests/route";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { Flag } from "@/src/shared-kernel/access";
import { addDays } from "@/src/shared-kernel/calendar-date";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import {
  addContractorBill,
  issueToContractor,
  measureWorkOrderLines,
} from "@/test/contracts";
import { seededAccounts } from "@/test/finance";
import { contractorTds, TODAY } from "@/test/party-finance";
import { addMaterial, addStore, unitNamed } from "@/test/procurement";
import {
  sharedAssign,
  worksheetContractor,
  worksheetDepartment,
} from "@/test/site-work";

import { POST as approveBillRoute } from "../contractor-bills/[id]/approve/route";
import { GET as getBillRoute } from "../contractor-bills/[id]/route";
import { POST as submitBillRoute } from "../contractor-bills/[id]/submit/route";
import { GET as suggestionsRoute } from "../contractor-bills/[id]/suggestions/route";
import { POST as updateBillRoute } from "../contractor-bills/[id]/update/route";
import type {
  ConstructionContractsContractorBillSuggestionsResponseModel,
  GetConstructionContractsContractorBillResponseModel,
} from "../contractor-bills/contractor-bill-models";
import { POST as createBillRoute } from "../contractor-bills/route";
import type { GetConstructionContractsEscalationBillResponseModel } from "../escalation-bills/escalation-bill-models";
import { POST as createEscalationRoute } from "../escalation-bills/route";
import { POST as createClauseRoute } from "../escalation-clauses/route";
import { POST as createIndexRoute } from "../price-indices/route";
import { POST as approveWorkOrderRoute } from "./[id]/approve/route";
import { GET as reconciliationPdfRoute } from "./[id]/reconciliation/pdf/route";
import { GET as reconciliationRoute } from "./[id]/reconciliation/route";
import { POST as submitWorkOrderRoute } from "./[id]/submit/route";
import type { ConstructionContractsWorkOrderReconciliationResponseModel } from "./reconciliation-models";
import type { GetConstructionContractsWorkOrderResponseModel } from "./work-order-models";
import { POST as createWorkOrderRoute } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

const HOST = "http://localhost/api/construction/contracts";
const BILLS = `${HOST}/contractor-bills`;
const MATERIAL_REQUESTS =
  "http://localhost/api/construction/procurement/material-requests";

type Statement = ConstructionContractsWorkOrderReconciliationResponseModel;
type Bill = GetConstructionContractsContractorBillResponseModel;
type WorkOrder = GetConstructionContractsWorkOrderResponseModel;
type MaterialRequest = ConstructionProcurementMaterialRequestResponseModel;

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}
async function errorOf(
  response: Response,
): Promise<{ code: string; details?: Record<string, unknown> }> {
  return json(response);
}
const request = (url: string, body?: unknown) =>
  new Request(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const day = (offset: number) => addDays(TODAY, offset);

const api = {
  statement: (id: string, billId?: string) =>
    reconciliationRoute(
      request(
        `${HOST}/work-orders/${id}/reconciliation${billId == null ? "" : `?billId=${billId}`}`,
      ),
      params(id),
    ),
  pdf: (id: string, billId: string) =>
    reconciliationPdfRoute(
      request(`${HOST}/work-orders/${id}/reconciliation/pdf?billId=${billId}`),
      params(id),
    ),
  createBill: (body: Record<string, unknown>) =>
    createBillRoute(request(BILLS, body)),
  getBill: (id: string) => getBillRoute(request(`${BILLS}/${id}`), params(id)),
  suggestions: (id: string) =>
    suggestionsRoute(request(`${BILLS}/${id}/suggestions`), params(id)),
  updateBill: (id: string, body: Record<string, unknown>) =>
    updateBillRoute(request(`${BILLS}/${id}/update`, body), params(id)),
  assign: (requestId: string, workOrderId: string) =>
    assignWorkOrderRoute(
      request(`${MATERIAL_REQUESTS}/${requestId}/assign-work-order`, {
        workOrderId,
      }),
      params(requestId),
    ),
  createRequest: (body: Record<string, unknown>) =>
    createMaterialRequestRoute(request(MATERIAL_REQUESTS, body)),
  requestOptions: (projectId: string) =>
    mrFormOptionsRoute(
      request(`${MATERIAL_REQUESTS}/form-options?projectId=${projectId}`),
    ),
};

/**
 * The ticket's worked example: PCC 175 cum at ₹4,000, cement 6.34 bag/cum
 * issued free with 2 % wastage and a ₹500 penal rate, and steel issued at
 * cost at ₹60 a kg.
 */
async function setup() {
  const company = await newCompany();
  const ws = company.workspaceId;
  const by = company.ownerId;
  const owner = { userId: by, workspaceId: ws, role: "owner" as const };
  const projectId = await addProject(ws, by, "Metro Depot");
  await prisma.constructionProjectsProject.update({
    where: { id: projectId },
    data: { stateCode: "33" },
  });
  const cum = await unitNamed(ws, by, "cum");
  const bag = await unitNamed(ws, by, "Bag");
  const kg = await unitNamed(ws, by, "kg");
  const cement = await addMaterial(ws, by, {
    name: "Cement OPC 53 (site issue)",
    uomId: bag,
  });
  const steel = await addMaterial(ws, by, {
    name: "TMT Steel (site issue)",
    uomId: kg,
  });
  const sand = await addMaterial(ws, by, {
    name: "M Sand (site issue)",
    uomId: cum,
  });
  const departmentId = await worksheetDepartment(ws, by, { name: "Civil" });
  const contractorId = await worksheetContractor(ws, by, {
    projectIds: [projectId],
    departmentIds: [departmentId],
    name: "Velan Constructions",
  });
  await prisma.constructionMastersContractor.update({
    where: { id: contractorId },
    data: { stateCode: "33" },
  });
  await contractorTds(contractorId, { pan: "ABCPK1234F", tdsApplicable: true });
  await seededAccounts(ws);
  const storeId = await addStore(ws, by, [projectId]);
  actAs(owner);

  const issued = async (
    orderDate = day(-60),
    options: { rate?: number; retentionPercent?: string } = {},
  ) => {
    const created = await createWorkOrderRoute(
      request(`${HOST}/work-orders`, {
        projectId,
        contractorId,
        departmentId,
        orderDate,
        lines: [
          {
            kind: "non_boq",
            itemNo: "1",
            description: "PCC 1:4:8",
            uomId: cum,
            quantity: "175",
            rate: options.rate ?? 4_000_00,
          },
        ],
        materials: [
          {
            materialId: cement.id,
            issueBasis: "free",
            wastagePercent: "2",
            penalRate: 500_00,
            coefficients: [{ line: 0, coefficient: "6.34" }],
          },
          {
            materialId: steel.id,
            issueBasis: "at_cost",
            issueRate: 60_00,
            wastagePercent: "0",
            coefficients: [{ line: 0, coefficient: null }],
          },
        ],
        terms: {
          retentionPercent: options.retentionPercent ?? "5",
          sacCode: "9954",
          gstRate: "18",
        },
      }),
    );
    expect(created.status, JSON.stringify(await created.clone().json())).toBe(
      StatusCodes.CREATED,
    );
    const draft = await json<WorkOrder>(created);
    await submitWorkOrderRoute(
      request(`${HOST}/work-orders/${draft.id}/submit`, {}),
      params(draft.id),
    );
    const approved = await json<WorkOrder>(
      await approveWorkOrderRoute(
        request(`${HOST}/work-orders/${draft.id}/approve`, {}),
        params(draft.id),
      ),
    );
    return { id: approved.id, lineId: approved.lines[0]?.id ?? "" };
  };

  const issue = (
    material: { id: string; name: string; uomId: string },
    quantity: string,
    deliveredOn: string,
    workOrderId: string | null = null,
  ) =>
    issueToContractor(ws, by, {
      projectId,
      storeId,
      contractorId,
      workOrderId,
      material,
      quantity,
      deliveredOn,
    });

  const measure = (
    workOrderId: string,
    lineId: string,
    quantity: string,
    measuredOn: string,
  ) =>
    measureWorkOrderLines(ws, by, {
      projectId,
      workOrderId,
      measuredOn,
      rows: [{ workOrderLineId: lineId, quantity }],
    });

  const draftBill = async (
    workOrderId: string,
    billDate: string,
    measuredUpTo: string,
  ) => {
    const response = await api.createBill({
      projectId,
      workOrderId,
      billDate,
      measuredUpTo,
    });
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(
      StatusCodes.CREATED,
    );
    return json<Bill>(response);
  };

  const approve = async (bill: Bill) => {
    const submitted = await submitBillRoute(
      request(`${BILLS}/${bill.id}/submit`, {}),
      params(bill.id),
    );
    expect(
      submitted.status,
      JSON.stringify(await submitted.clone().json()),
    ).toBe(StatusCodes.OK);
    const approved = await approveBillRoute(
      request(`${BILLS}/${bill.id}/approve`, {}),
      params(bill.id),
    );
    expect(approved.status, JSON.stringify(await approved.clone().json())).toBe(
      StatusCodes.OK,
    );
    return json<Bill>(approved);
  };

  const member = async (permissions: Record<string, readonly Flag[]>) => {
    const added = await addMember(ws, by, permissions);
    await sharedAssign(added.memberId, projectId);
    return { userId: added.userId, workspaceId: ws, role: "member" as const };
  };

  return {
    ws,
    by,
    owner,
    projectId,
    contractorId,
    storeId,
    cum,
    cement,
    steel,
    sand,
    issued,
    issue,
    measure,
    draftBill,
    approve,
    member,
  };
}

const materialDeductions = (bill: Bill) =>
  bill.deductionLines
    .filter((row) => row.materialId != null)
    .map((row) => ({
      kind: row.kind,
      amount: row.amount,
      materialId: row.materialId,
    }));

describe("material reconciliation (CM-1110)", () => {
  it("works the example over two bills: suggests ₹26,660 and ₹6,000 at cost, then nothing more but ₹3,000 at cost", async () => {
    const ctx = await setup();
    const order = await ctx.issued();
    // Bill 1: 100 cum; 700 bags (no Work Order named: the only one listing cement) and 100 kg of steel.
    await ctx.issue(ctx.cement, "700", day(-40));
    await ctx.issue(ctx.steel, "100", day(-40));
    await ctx.measure(order.id, order.lineId, "100", day(-30));
    const first = await ctx.draftBill(order.id, day(-25), day(-30));
    expect(first.gross).toBe(4_00_000_00);
    expect(materialDeductions(first)).toEqual([
      {
        kind: "material_reconciliation",
        amount: 26_660_00,
        materialId: ctx.cement.id,
      },
      { kind: "material_at_cost", amount: 6_000_00, materialId: ctx.steel.id },
    ]);
    const suggestions =
      await json<ConstructionContractsContractorBillSuggestionsResponseModel>(
        await api.suggestions(first.id),
      );
    expect(
      suggestions.materials.find((row) => row.materialId === ctx.cement.id),
    ).toMatchObject({
      excess: "53.320",
      recoverySuggested: 26_660_00,
      penalRate: 500_00,
    });

    const atFirst = await json<Statement>(
      await api.statement(order.id, first.id),
    );
    const cement = atFirst.materials.find(
      (row) => row.materialId === ctx.cement.id,
    );
    expect(cement).toMatchObject({
      theoretical: "634.000",
      allowed: "646.680",
      underUseLimit: "621.320",
      issued: "700.000",
      returned: "0.000",
      netIssued: "700.000",
      excess: "53.320",
      underUse: false,
      excessValue: 26_660_00,
      recoveredBefore: 0,
      recoverySuggested: 26_660_00,
      onThisBill: 26_660_00,
    });
    expect(
      atFirst.materials.find((row) => row.materialId === ctx.steel.id),
    ).toMatchObject({
      issueBasis: "at_cost",
      atCostValue: 6_000_00,
      atCostSuggested: 6_000_00,
      atCostOnThisBill: 6_000_00,
      excessValue: null,
    });
    expect(atFirst.issues.map((row) => row.how)).toEqual(["auto", "auto"]);
    expect(atFirst.returnsRecorded).toBe(false);
    await ctx.approve(first);

    // Bill 2: 120 cum cumulative; 90 more bags (the request names the Work Order) and 50 kg.
    await ctx.issue(ctx.cement, "90", day(-20), order.id);
    await ctx.issue(ctx.steel, "50", day(-20));
    // Issued after "measured up to": not counted on bill 2.
    await ctx.issue(ctx.cement, "500", day(-17), order.id);
    await ctx.measure(order.id, order.lineId, "20", day(-18));
    const second = await ctx.draftBill(order.id, day(-15), day(-18));
    expect(materialDeductions(second)).toEqual([
      { kind: "material_at_cost", amount: 3_000_00, materialId: ctx.steel.id },
    ]);
    const atSecond = await json<Statement>(
      await api.statement(order.id, second.id),
    );
    expect(atSecond.bill?.id).toBe(second.id);
    expect(
      atSecond.materials.find((row) => row.materialId === ctx.cement.id),
    ).toMatchObject({
      theoretical: "760.800",
      allowed: "776.016",
      issued: "790.000",
      excess: "13.984",
      excessValue: 6_992_00,
      recoveredBefore: 26_660_00,
      recoverySuggested: 0,
      onThisBill: null,
    });
    expect(
      atSecond.issues
        .filter((row) => row.materialId === ctx.cement.id)
        .map((row) => [row.quantity, row.how]),
    ).toEqual([
      ["700.000", "auto"],
      ["90.000", "named"],
    ]);

    // The default statement is at the latest approved bill.
    const latest = await json<Statement>(await api.statement(order.id));
    expect(latest.bill?.id).toBe(first.id);
    expect(latest.bills.map((row) => row.id)).toEqual([second.id, first.id]);

    // The statement PDF.
    const pdf = await api.pdf(order.id, second.id);
    expect(pdf.status).toBe(StatusCodes.OK);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect((await pdf.arrayBuffer()).byteLength).toBeGreaterThan(1000);
  });

  it("caps the recovery to what the bill can take; the rest stays due for the next bill (walkthrough RA-3)", async () => {
    const ctx = await setup();
    // ₹20 a cum, 7.5 % retention, 18 % GST: 120 cum is a ₹2,400 bill.
    const order = await ctx.issued(day(-60), {
      rate: 20_00,
      retentionPercent: "7.5",
    });
    await ctx.issue(ctx.cement, "790", day(-40));
    await ctx.measure(order.id, order.lineId, "120", day(-30));
    const bill = await ctx.draftBill(order.id, day(-25), day(-30));
    expect(bill.gross).toBe(2_400_00);
    expect(bill.payableGst).toBe(432_00);
    // ₹6,992 is due; ₹2,832 − ₹180 retention = ₹2,652 fits the new draft.
    expect(materialDeductions(bill)).toEqual([
      {
        kind: "material_reconciliation",
        amount: 2_652_00,
        materialId: ctx.cement.id,
      },
    ]);
    expect(bill.net).toBe(0);

    const save = (amount: number) =>
      api.updateBill(bill.id, {
        billDate: bill.billDate,
        measuredUpTo: bill.measuredUpTo,
        expectedUpdatedAt: bill.updatedAt,
        deductions: [
          { kind: "retention", amount: 180_00 },
          { kind: "other", amount: 240_00, description: "Advance adjusted" },
          {
            kind: "material_reconciliation",
            amount,
            materialId: ctx.cement.id,
          },
        ],
      });
    const tooLarge = await save(6_992_00);
    expect(tooLarge.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await errorOf(tooLarge)).toMatchObject({
      code: "BILL_DEDUCTIONS_TOO_LARGE",
      details: { max: 2_832_00 },
    });
    const fits = await save(2_412_00);
    expect(fits.status, JSON.stringify(await fits.clone().json())).toBe(
      StatusCodes.OK,
    );
    const suggestions =
      await json<ConstructionContractsContractorBillSuggestionsResponseModel>(
        await api.suggestions(bill.id),
      );
    expect(
      suggestions.materials.find((row) => row.materialId === ctx.cement.id),
    ).toMatchObject({
      recoverySuggested: 6_992_00,
      recoveryFits: 2_412_00,
    });
    await ctx.approve(await json<Bill>(fits));

    // Bill 2: 125 cum, 890 bags: ₹40,825 cumulative less ₹2,412 recovered.
    await ctx.issue(ctx.cement, "100", day(-20));
    await ctx.measure(order.id, order.lineId, "5", day(-18));
    const next = await ctx.draftBill(order.id, day(-15), day(-18));
    const statement = await json<Statement>(
      await api.statement(order.id, next.id),
    );
    expect(
      statement.materials.find((row) => row.materialId === ctx.cement.id),
    ).toMatchObject({
      excess: "81.650",
      excessValue: 40_825_00,
      recoveredBefore: 2_412_00,
      recoverySuggested: 38_413_00,
    });
    // ₹100 gross + ₹18 GST − ₹7.50 retention: ₹110.50 fits.
    expect(materialDeductions(next)).toEqual([
      {
        kind: "material_reconciliation",
        amount: 110_50,
        materialId: ctx.cement.id,
      },
    ]);
  });

  it("flags under-use and keeps a recovery within its suggestion unless a reason and Approve allow more", async () => {
    const ctx = await setup();
    const order = await ctx.issued();
    await ctx.issue(ctx.cement, "600", day(-40));
    await ctx.measure(order.id, order.lineId, "100", day(-30));
    const bill = await ctx.draftBill(order.id, day(-25), day(-30));
    expect(materialDeductions(bill)).toEqual([]);
    const statement = await json<Statement>(
      await api.statement(order.id, bill.id),
    );
    expect(
      statement.materials.find((row) => row.materialId === ctx.cement.id),
    ).toMatchObject({
      theoretical: "634.000",
      issued: "600.000",
      excess: "0.000",
      underUse: true,
      recoverySuggested: 0,
    });

    const retention = bill.deductionLines.filter(
      (row) => row.kind === "retention",
    );
    const save = (deductions: Record<string, unknown>[]) =>
      api.updateBill(bill.id, {
        billDate: bill.billDate,
        measuredUpTo: bill.measuredUpTo,
        expectedUpdatedAt: bill.updatedAt,
        deductions: [
          ...retention.map((row) => ({ kind: row.kind, amount: row.amount })),
          ...deductions,
        ],
      });
    const noMaterial = await save([
      { kind: "material_reconciliation", amount: 100_00 },
    ]);
    expect(noMaterial.status).toBe(StatusCodes.BAD_REQUEST);
    expect((await errorOf(noMaterial)).code).toBe("BILL_MATERIAL_REQUIRED");
    const notIssued = await save([
      {
        kind: "material_reconciliation",
        amount: 100_00,
        materialId: ctx.sand.id,
      },
    ]);
    expect((await errorOf(notIssued)).code).toBe("BILL_MATERIAL_INVALID");
    const noReason = await save([
      {
        kind: "material_reconciliation",
        amount: 100_00,
        materialId: ctx.cement.id,
      },
    ]);
    expect(noReason.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await errorOf(noReason)).toMatchObject({
      code: "BILL_MATERIAL_RECOVERY_REASON_REQUIRED",
      details: { max: 0 },
    });

    actAs(
      await ctx.member({
        "contracts.contractor_bills": ["read", "create", "update", "financial"],
      }),
    );
    const withoutApprove = await save([
      {
        kind: "material_reconciliation",
        amount: 100_00,
        materialId: ctx.cement.id,
        description: "Cement found sold off site",
      },
    ]);
    expect(withoutApprove.status).toBe(StatusCodes.FORBIDDEN);
    expect((await errorOf(withoutApprove)).code).toBe(
      "BILL_MATERIAL_RECOVERY_OVER_SUGGESTION",
    );
    actAs(ctx.owner);
    const approved = await save([
      {
        kind: "material_reconciliation",
        amount: 100_00,
        materialId: ctx.cement.id,
        description: "Cement found sold off site",
      },
    ]);
    expect(approved.status, JSON.stringify(await approved.clone().json())).toBe(
      StatusCodes.OK,
    );
    expect(materialDeductions(await json<Bill>(approved))).toEqual([
      {
        kind: "material_reconciliation",
        amount: 100_00,
        materialId: ctx.cement.id,
      },
    ]);
    const after = await json<Statement>(await api.statement(order.id, bill.id));
    expect(
      after.materials.find((row) => row.materialId === ctx.cement.id),
    ).toMatchObject({
      onThisBill: 100_00,
      reason: "Cement found sold off site",
    });
  });

  it("attributes issues: by the request's Work Order, to the only open one listing the material, else unattributed until assigned", async () => {
    const ctx = await setup();
    const first = await ctx.issued(day(-60));
    await ctx.issue(ctx.cement, "100", day(-40));
    const second = await ctx.issued(day(-10));
    const unclear = await ctx.issue(ctx.cement, "30", day(-5));

    const before = await json<Statement>(await api.statement(first.id));
    expect(before.bill).toBeNull();
    expect(before.canAssign).toBe(true);
    expect(before.issues.map((row) => [row.quantity, row.how])).toEqual([
      ["100.000", "auto"],
    ]);
    expect(before.unattributed).toMatchObject([
      {
        materialRequestId: unclear.requestId,
        quantity: "30.000",
        how: "unattributed",
        candidates: 2,
      },
    ]);

    const assigned = await api.assign(unclear.requestId, second.id);
    expect(assigned.status, JSON.stringify(await assigned.clone().json())).toBe(
      StatusCodes.OK,
    );
    expect((await json<MaterialRequest>(assigned)).workOrder?.id).toBe(
      second.id,
    );
    const again = await api.assign(unclear.requestId, first.id);
    expect(again.status).toBe(StatusCodes.CONFLICT);
    expect((await errorOf(again)).code).toBe("MATERIAL_REQUEST_WORK_ORDER_SET");

    const firstAfter = await json<Statement>(await api.statement(first.id));
    expect(firstAfter.unattributed).toEqual([]);
    const secondAfter = await json<Statement>(await api.statement(second.id));
    expect(secondAfter.issues.map((row) => [row.quantity, row.how])).toEqual([
      ["30.000", "named"],
    ]);

    // A member without Material Requests update sees the issues but may not assign.
    actAs(await ctx.member({ "contracts.work_orders": ["read"] }));
    const viewer = await json<Statement>(await api.statement(first.id));
    expect(viewer.canAssign).toBe(false);
    expect(viewer.financial).toBe(false);
    const viewed = viewer.materials.find(
      (row) => row.materialId === ctx.cement.id,
    );
    expect(viewed?.penalRate).toBeNull();
    expect(viewed?.issued).toBe("100.000");
  });

  it("names a Work Order on a Material Request: the Contractor's issued ones only", async () => {
    const ctx = await setup();
    const order = await ctx.issued();
    const options =
      await json<GetConstructionProcurementMaterialRequestFormOptionsResponseModel>(
        await api.requestOptions(ctx.projectId),
      );
    expect(options.workOrders).toEqual([
      {
        id: order.id,
        number: expect.any(String) as string,
        contractorId: ctx.contractorId,
      },
    ]);
    const body = {
      projectId: ctx.projectId,
      requestDate: TODAY,
      storeId: ctx.storeId,
      items: [{ materialId: ctx.cement.id, askQty: "50" }],
    };
    const created = await api.createRequest({
      ...body,
      contractorId: ctx.contractorId,
      workOrderId: order.id,
    });
    expect(created.status, JSON.stringify(await created.clone().json())).toBe(
      StatusCodes.CREATED,
    );
    expect((await json<MaterialRequest>(created)).workOrder).toEqual({
      id: order.id,
      name: options.workOrders[0]?.number,
    });
    const noContractor = await api.createRequest({
      ...body,
      workOrderId: order.id,
    });
    expect(noContractor.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await errorOf(noContractor)).toMatchObject({
      code: "MATERIAL_REQUEST_CONTRACTOR_REQUIRED",
      details: { field: "workOrderId" },
    });
    const other = await worksheetContractor(ctx.ws, ctx.by, {
      projectIds: [ctx.projectId],
      name: "Murugan Builders",
    });
    const wrong = await api.createRequest({
      ...body,
      contractorId: other,
      workOrderId: order.id,
    });
    expect(wrong.status).toBe(StatusCodes.BAD_REQUEST);
    expect((await errorOf(wrong)).code).toBe("WORK_ORDER_NOT_FOR_CONTRACTOR");
  });

  it("fills the escalation draft's 10CA cement quantity from the period's billed work, still editable", async () => {
    const ctx = await setup();
    const order = await ctx.issued(day(-120));
    const billId = await addContractorBill(ctx.ws, ctx.by, {
      projectId: ctx.projectId,
      workOrderId: order.id,
      billDate: "2026-09-15",
      lines: [
        { workOrderLineId: order.lineId, uomId: ctx.cum, quantity: "100" },
      ],
    });
    await prisma.constructionContractsBill.update({
      where: { id: billId },
      data: { gross: 4_00_000_00n, cumulativeValue: 4_00_000_00n },
    });
    for (const [series, month, value] of [
      ["CPI-IW", "2026-01", 100],
      ["CPI-IW", "2026-09", 110],
      ["WPI – Cement", "2026-01", 100],
      ["WPI – Cement", "2026-09", 105],
    ] as const) {
      const response = await createIndexRoute(
        request(`${HOST}/price-indices`, { series, month, value }),
      );
      expect(response.status).toBe(StatusCodes.CREATED);
    }
    const clause = (materialId: string) =>
      createClauseRoute(
        request(`${HOST}/escalation-clauses`, {
          projectId: ctx.projectId,
          workOrderId: order.id,
          baseMonth: "2026-01",
          components: [
            { component: "labour", weightPercent: "100", series: "CPI-IW" },
            {
              component: "cement",
              basis: "quantity",
              series: "WPI – Cement",
              basePrice: 350_00,
              materialId,
            },
          ],
        }),
      );
    const notIssued = await clause(ctx.sand.id);
    expect(notIssued.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await errorOf(notIssued)).toMatchObject({
      code: "ESCALATION_MATERIAL_INVALID",
      details: { field: "components.1.materialId" },
    });
    const added = await clause(ctx.cement.id);
    expect(added.status, JSON.stringify(await added.clone().json())).toBe(
      StatusCodes.CREATED,
    );
    const created = await createEscalationRoute(
      request(`${HOST}/escalation-bills`, {
        projectId: ctx.projectId,
        workOrderId: order.id,
        billDate: TODAY,
        fromMonth: "2026-09",
        toMonth: "2026-09",
      }),
    );
    expect(created.status, JSON.stringify(await created.clone().json())).toBe(
      StatusCodes.CREATED,
    );
    const bill =
      await json<GetConstructionContractsEscalationBillResponseModel>(created);
    // 100 cum × 6.34 bag/cum = 634 bags.
    expect(
      bill.working.components.find((row) => row.component === "cement")
        ?.quantity,
    ).toBe("634.0000");
  });

  it("answers 403 without Work Order read and 404 for another Company's Work Order or a bill not on it", async () => {
    const ctx = await setup();
    const order = await ctx.issued();
    actAs(await ctx.member({ "contracts.contractor_bills": ["read"] }));
    const denied = await api.statement(order.id);
    expect(denied.status).toBe(StatusCodes.FORBIDDEN);
    actAs(await ctx.member({ "contracts.work_orders": ["read"] }));
    const noPrint = await api.pdf(order.id, order.id);
    expect(noPrint.status).toBe(StatusCodes.FORBIDDEN);
    actAs(ctx.owner);
    const missingBill = await api.statement(order.id, order.id);
    expect(missingBill.status).toBe(StatusCodes.NOT_FOUND);
    expect((await errorOf(missingBill)).code).toBe("BILL_NOT_FOUND");

    const other = await setup();
    actAs(other.owner);
    const foreign = await api.statement(order.id);
    expect(foreign.status).toBe(StatusCodes.NOT_FOUND);
    expect((await errorOf(foreign)).code).toBe("WORK_ORDER_NOT_FOUND");
  });

  it("documents the statement, its PDF and the assignment in OpenAPI", async () => {
    const spec = (await getOpenApi().json()) as {
      paths: Record<string, unknown>;
    };
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining([
        "/api/construction/contracts/work-orders/{id}/reconciliation",
        "/api/construction/contracts/work-orders/{id}/reconciliation/pdf",
        "/api/construction/procurement/material-requests/{id}/assign-work-order",
      ]),
    );
  });
});
