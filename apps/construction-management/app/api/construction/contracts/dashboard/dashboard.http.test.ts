import { StatusCodes } from "http-status-codes";
import { afterEach, describe, expect, it, vi } from "vitest";

import { POST as recordPayment } from "@/app/api/construction/finance/party-payments/route";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { Flag } from "@/src/shared-kernel/access";
import { actAs, addMember } from "@/test/companies";
import {
  contractsBilledBothWays,
  contractsRequest as request,
  okJson as json,
} from "@/test/contracts-billing";
import { postTo, TODAY } from "@/test/party-finance";
import { sharedAssign } from "@/test/site-work";

import { GET as boqRoute } from "../boq/route";
import type { ListConstructionContractsClientBillsResponseModel } from "../client-bills/client-bill-models";
import { GET as listClientBillsRoute } from "../client-bills/route";
import type { ListConstructionContractsContractorBillsResponseModel } from "../contractor-bills/contractor-bill-models";
import { GET as listContractorBillsRoute } from "../contractor-bills/route";
import { GET as listWorkOrdersRoute } from "../work-orders/route";
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

const dashboard = async (projectId: string) =>
  json<Dashboard>(
    await dashboardRoute(request(`${HOST}/dashboard?projectId=${projectId}`)),
  );

describe("Project Dashboard: Contracts section (CM-1111)", () => {
  it("shows what the lists show: billed against the BOQ, retention, pending bills, open Work Orders; receivable and payable follow finance", async () => {
    const ctx = await contractsBilledBothWays();
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
    const ctx = await contractsBilledBothWays();
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
