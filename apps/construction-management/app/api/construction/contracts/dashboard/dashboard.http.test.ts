import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { afterEach, describe, expect, it, vi } from "vitest";

import { POST as recordPayment } from "@/app/api/construction/finance/party-payments/route";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { Flag } from "@/src/shared-kernel/access";
import { addDays } from "@/src/shared-kernel/calendar-date";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import {
  addClient,
  measureClientItems,
  measureWorkOrderLines,
} from "@/test/contracts";
import { seededAccounts } from "@/test/finance";
import { contractorTds, postTo, TODAY } from "@/test/party-finance";
import { addBillingAddress, unitNamed } from "@/test/procurement";
import {
  sharedAssign,
  worksheetContractor,
  worksheetDepartment,
} from "@/test/site-work";

import type { ConstructionContractsBoqItemModel } from "../boq/boq-models";
import { GET as boqRoute } from "../boq/route";
import type { ConstructionContractsBoqSectionResponseModel } from "../boq/boq-models";
import { POST as createBoqItemRoute } from "../boq/items/route";
import { POST as createSectionRoute } from "../boq/sections/route";
import { POST as approveClientBillRoute } from "../client-bills/[id]/approve/route";
import { POST as submitClientBillRoute } from "../client-bills/[id]/submit/route";
import type {
  GetConstructionContractsClientBillResponseModel,
  ListConstructionContractsClientBillsResponseModel,
} from "../client-bills/client-bill-models";
import { POST as saveContractRoute } from "../client-bills/contract/update/route";
import {
  GET as listClientBillsRoute,
  POST as createClientBillRoute,
} from "../client-bills/route";
import { POST as approveContractorBillRoute } from "../contractor-bills/[id]/approve/route";
import { POST as submitContractorBillRoute } from "../contractor-bills/[id]/submit/route";
import type {
  GetConstructionContractsContractorBillResponseModel,
  ListConstructionContractsContractorBillsResponseModel,
} from "../contractor-bills/contractor-bill-models";
import {
  GET as listContractorBillsRoute,
  POST as createContractorBillRoute,
} from "../contractor-bills/route";
import { POST as approveWorkOrderRoute } from "../work-orders/[id]/approve/route";
import { POST as submitWorkOrderRoute } from "../work-orders/[id]/submit/route";
import { GET as listWorkOrdersRoute } from "../work-orders/route";
import { POST as createWorkOrderRoute } from "../work-orders/route";
import type { GetConstructionContractsDashboardResponseModel as Dashboard } from "./dashboard-models";
import { GET as dashboardRoute } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

const HOST = "http://localhost/api/construction/contracts";

async function json<T>(response: Response): Promise<T> {
  expect(response.status, await response.clone().text()).toBe(StatusCodes.OK);
  return (await response.json()) as T;
}
const request = (url: string, body?: unknown) =>
  new Request(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const day = (offset: number) => addDays(TODAY, offset);
const created = async <T>(response: Response): Promise<T> => {
  expect(response.status, await response.clone().text()).toBe(
    StatusCodes.CREATED,
  );
  return (await response.json()) as T;
};

/**
 * A contract-work Project billed both ways: a BOQ of ₹55,000 (100 cum at
 * ₹450, 10 cum at ₹1,000) with one approved client RA bill (30 cum,
 * ₹13,500 gross, 18 % GST, 5 % retention) and a second pending; and an
 * issued Work Order (₹200 a cum) with one approved contractor RA bill
 * (50 cum, ₹10,000 gross) and a draft Work Order beside it.
 */
async function setup() {
  const company = await newCompany();
  const ws = company.workspaceId;
  const by = company.ownerId;
  const owner = { userId: by, workspaceId: ws, role: "owner" as const };
  const projectId = await addProject(ws, by, "Housing Board Block C");
  const clientId = await addClient(ws, by);
  await prisma.constructionProjectsProject.update({
    where: { id: projectId },
    data: {
      role: "contract",
      clientId,
      clientName: "Tamil Nadu Housing Board",
      stateCode: "33",
    },
  });
  await addBillingAddress(ws, by, {
    stateCode: "33",
    gstin: "33AAACA1234A1Z5",
    isDefault: true,
  });
  const cum = await unitNamed(ws, by, "cum");
  const accounts = await seededAccounts(ws);
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
  actAs(owner);

  // Client side: the BOQ, the terms, one approved bill and one pending.
  const section = await created<ConstructionContractsBoqSectionResponseModel>(
    await createSectionRoute(
      request(`${HOST}/boq/sections`, { projectId, title: "Civil works" }),
    ),
  );
  const item = async (itemNo: string, quantity: string, rate: number) =>
    created<ConstructionContractsBoqItemModel>(
      await createBoqItemRoute(
        request(`${HOST}/boq/items`, {
          projectId,
          sectionId: section.id,
          itemNo,
          description: `Item ${itemNo}`,
          uomId: cum,
          quantity,
          rate,
        }),
      ),
    );
  const excavation = await item("1.1", "100", 450_00);
  await item("1.2", "10", 1_000_00);
  await json(
    await saveContractRoute(
      request(`${HOST}/client-bills/contract/update`, {
        projectId,
        retentionPercent: "5",
        sacCode: "9954",
        gstRate: "18",
      }),
    ),
  );
  await measureClientItems(ws, by, {
    projectId,
    measuredOn: day(-10),
    rows: [{ boqItemId: excavation.id, quantity: "30" }],
  });
  const clientBill =
    await created<GetConstructionContractsClientBillResponseModel>(
      await createClientBillRoute(
        request(`${HOST}/client-bills`, {
          projectId,
          billDate: day(-8),
          measuredUpTo: day(-9),
        }),
      ),
    );
  await json(
    await submitClientBillRoute(
      request(`${HOST}/client-bills/${clientBill.id}/submit`, {}),
      params(clientBill.id),
    ),
  );
  const approvedClient =
    await json<GetConstructionContractsClientBillResponseModel>(
      await approveClientBillRoute(
        request(`${HOST}/client-bills/${clientBill.id}/approve`, {}),
        params(clientBill.id),
      ),
    );
  await measureClientItems(ws, by, {
    projectId,
    measuredOn: day(-5),
    rows: [{ boqItemId: excavation.id, quantity: "10" }],
  });
  const second = await created<GetConstructionContractsClientBillResponseModel>(
    await createClientBillRoute(
      request(`${HOST}/client-bills`, {
        projectId,
        billDate: day(-3),
        measuredUpTo: day(-4),
      }),
    ),
  );
  await json(
    await submitClientBillRoute(
      request(`${HOST}/client-bills/${second.id}/submit`, {}),
      params(second.id),
    ),
  );

  // Contractor side: an issued Work Order with one approved bill, and a draft.
  const workOrder = async (submit: boolean) => {
    const draft = await created<{ id: string; lines: { id: string }[] }>(
      await createWorkOrderRoute(
        request(`${HOST}/work-orders`, {
          projectId,
          contractorId,
          departmentId,
          orderDate: day(-30),
          lines: [
            {
              kind: "non_boq",
              itemNo: "1",
              description: "PCC 1:4:8",
              uomId: cum,
              quantity: "175",
              rate: 200_00,
            },
          ],
          terms: { retentionPercent: "5", sacCode: "9954", gstRate: "18" },
        }),
      ),
    );
    if (!submit) return draft;
    await json(
      await submitWorkOrderRoute(
        request(`${HOST}/work-orders/${draft.id}/submit`, {}),
        params(draft.id),
      ),
    );
    return json<{ id: string; lines: { id: string }[] }>(
      await approveWorkOrderRoute(
        request(`${HOST}/work-orders/${draft.id}/approve`, {}),
        params(draft.id),
      ),
    );
  };
  const issued = await workOrder(true);
  await workOrder(false);
  await measureWorkOrderLines(ws, by, {
    projectId,
    workOrderId: issued.id,
    measuredOn: day(-12),
    rows: [{ workOrderLineId: issued.lines[0]?.id ?? "", quantity: "50" }],
  });
  const contractorBill =
    await created<GetConstructionContractsContractorBillResponseModel>(
      await createContractorBillRoute(
        request(`${HOST}/contractor-bills`, {
          projectId,
          workOrderId: issued.id,
          billDate: day(-11),
          measuredUpTo: day(-12),
        }),
      ),
    );
  await json(
    await submitContractorBillRoute(
      request(`${HOST}/contractor-bills/${contractorBill.id}/submit`, {}),
      params(contractorBill.id),
    ),
  );
  const approvedContractor =
    await json<GetConstructionContractsContractorBillResponseModel>(
      await approveContractorBillRoute(
        request(`${HOST}/contractor-bills/${contractorBill.id}/approve`, {}),
        params(contractorBill.id),
      ),
    );

  return {
    ws,
    by,
    owner,
    projectId,
    clientId,
    approvedClient,
    approvedContractor,
    ...accounts,
  };
}

const dashboard = async (projectId: string) =>
  json<Dashboard>(
    await dashboardRoute(request(`${HOST}/dashboard?projectId=${projectId}`)),
  );

describe("Project Dashboard: Contracts section (CM-1111)", () => {
  it("shows what the lists show: billed against the BOQ, retention, pending bills, open Work Orders; receivable and payable follow finance", async () => {
    const ctx = await setup();
    const section = await dashboard(ctx.projectId);

    // Each figure equals its list or page.
    const boq = await json<{ total: number | null }>(
      await boqRoute(request(`${HOST}/boq?projectId=${ctx.projectId}`)),
    );
    const clientApproved =
      await json<ListConstructionContractsClientBillsResponseModel>(
        await listClientBillsRoute(
          request(
            `${HOST}/client-bills?projectId=${ctx.projectId}&status=approved&type=running`,
          ),
        ),
      );
    const clientPending =
      await json<ListConstructionContractsClientBillsResponseModel>(
        await listClientBillsRoute(
          request(
            `${HOST}/client-bills?projectId=${ctx.projectId}&status=pending_approval`,
          ),
        ),
      );
    const contractorApproved =
      await json<ListConstructionContractsContractorBillsResponseModel>(
        await listContractorBillsRoute(
          request(
            `${HOST}/contractor-bills?projectId=${ctx.projectId}&status=approved&type=running`,
          ),
        ),
      );
    const issued = await json<{ total: number }>(
      await listWorkOrdersRoute(
        request(`${HOST}/work-orders?projectId=${ctx.projectId}&status=issued`),
      ),
    );
    expect(section).toEqual({
      projectId: ctx.projectId,
      boq: { value: boq.total },
      client: {
        billedToDate: clientApproved.totals.gross,
        outstanding: ctx.approvedClient.net,
        retentionHeld: clientApproved.retentionReceivable,
        pendingApproval: clientPending.total,
      },
      contractor: {
        billedToDate: contractorApproved.totals.gross,
        outstanding: ctx.approvedContractor.net,
        retentionHeld: contractorApproved.retentionHeld.reduce(
          (sum, row) => sum + (row.amount ?? 0),
          0,
        ),
        pendingApproval: 0,
      },
      workOrders: { open: issued.total },
    });
    // The worked figures.
    expect(section.boq?.value).toBe(55_000_00);
    expect(section.client).toMatchObject({
      billedToDate: 13_500_00,
      retentionHeld: 675_00,
      pendingApproval: 1,
    });
    expect(section.contractor).toMatchObject({
      billedToDate: 10_000_00,
      retentionHeld: 500_00,
    });
    expect(section.workOrders).toEqual({ open: 1 });

    // A receipt against the client bill's invoice lowers what is receivable.
    const received = await recordPayment(
      postTo("/party-payments", {
        partyType: "client",
        partyId: ctx.clientId,
        projectId: ctx.projectId,
        direction: "in",
        paymentDate: TODAY,
        accountId: ctx.cashId,
        mode: "cash",
        amount: 5_000_00,
        allocations: [
          { invoiceId: ctx.approvedClient.invoiceId, amount: 5_000_00 },
        ],
      }),
    );
    expect(received.status, await received.clone().text()).toBe(
      StatusCodes.CREATED,
    );
    expect((await dashboard(ctx.projectId)).client?.outstanding).toBe(
      (ctx.approvedClient.net ?? 0) - 5_000_00,
    );
  });

  it("leaves out each part without its menu's read and its money without Financial", async () => {
    const ctx = await setup();
    const asMember = async (permissions: Record<string, readonly Flag[]>) => {
      const added = await addMember(ctx.ws, ctx.by, {
        "reporting.project_dashboard": ["read"],
        ...permissions,
      });
      await sharedAssign(added.memberId, ctx.projectId);
      actAs({ userId: added.userId, workspaceId: ctx.ws, role: "member" });
    };

    await asMember({ "contracts.contractor_bills": ["read"] });
    expect(await dashboard(ctx.projectId)).toEqual({
      projectId: ctx.projectId,
      boq: null,
      client: null,
      contractor: {
        billedToDate: null,
        outstanding: null,
        retentionHeld: null,
        pendingApproval: 0,
      },
      workOrders: null,
    });

    await asMember({
      "contracts.boq": ["read"],
      "contracts.client_bills": ["read", "financial"],
      "contracts.work_orders": ["read"],
    });
    const section = await dashboard(ctx.projectId);
    expect(section.boq).toEqual({ value: null });
    expect(section.client?.billedToDate).toBe(13_500_00);
    expect(section.contractor).toBeNull();
    expect(section.workOrders).toEqual({ open: 1 });

    // Without Dashboard read: 403.
    const none = await addMember(ctx.ws, ctx.by, {
      "contracts.client_bills": ["read"],
    });
    await sharedAssign(none.memberId, ctx.projectId);
    actAs({ userId: none.userId, workspaceId: ctx.ws, role: "member" });
    const denied = await dashboardRoute(
      request(`${HOST}/dashboard?projectId=${ctx.projectId}`),
    );
    expect(denied.status).toBe(StatusCodes.FORBIDDEN);
  });

  it("is in the OpenAPI document", async () => {
    const document = (await getOpenApi().json()) as {
      paths: Record<string, unknown>;
    };
    expect(document.paths).toHaveProperty(
      "/api/construction/contracts/dashboard",
    );
  });
});
