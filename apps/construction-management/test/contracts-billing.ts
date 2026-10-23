import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { expect } from "vitest";

import type {
  ConstructionContractsBoqItemModel,
  ConstructionContractsBoqSectionResponseModel,
} from "@/app/api/construction/contracts/boq/boq-models";
import { POST as createBoqItemRoute } from "@/app/api/construction/contracts/boq/items/route";
import { POST as createSectionRoute } from "@/app/api/construction/contracts/boq/sections/route";
import { POST as approveClientBillRoute } from "@/app/api/construction/contracts/client-bills/[id]/approve/route";
import { POST as submitClientBillRoute } from "@/app/api/construction/contracts/client-bills/[id]/submit/route";
import type { GetConstructionContractsClientBillResponseModel } from "@/app/api/construction/contracts/client-bills/client-bill-models";
import { POST as saveContractRoute } from "@/app/api/construction/contracts/client-bills/contract/update/route";
import { POST as createClientBillRoute } from "@/app/api/construction/contracts/client-bills/route";
import { POST as approveContractorBillRoute } from "@/app/api/construction/contracts/contractor-bills/[id]/approve/route";
import { POST as submitContractorBillRoute } from "@/app/api/construction/contracts/contractor-bills/[id]/submit/route";
import type { GetConstructionContractsContractorBillResponseModel } from "@/app/api/construction/contracts/contractor-bills/contractor-bill-models";
import { POST as createContractorBillRoute } from "@/app/api/construction/contracts/contractor-bills/route";
import { POST as approveWorkOrderRoute } from "@/app/api/construction/contracts/work-orders/[id]/approve/route";
import { POST as submitWorkOrderRoute } from "@/app/api/construction/contracts/work-orders/[id]/submit/route";
import { POST as createWorkOrderRoute } from "@/app/api/construction/contracts/work-orders/route";
import { addDays } from "@/src/shared-kernel/calendar-date";

import { actAs, addProject, newCompany } from "./companies";
import {
  addClient,
  issueToContractor,
  measureClientItems,
  measureWorkOrderLines,
} from "./contracts";
import { seededAccounts } from "./finance";
import { contractorTds, TODAY } from "./party-finance";
import {
  addBillingAddress,
  addMaterial,
  addStore,
  unitNamed,
} from "./procurement";
import { worksheetContractor, worksheetDepartment } from "./site-work";

/**
 * A contract-work Project billed both ways through the routes (CM-1111),
 * for the Project Dashboard's Contracts section and the contracts reports.
 */

const HOST = "http://localhost/api/construction/contracts";

export async function okJson<T>(response: Response): Promise<T> {
  expect(response.status, await response.clone().text()).toBe(StatusCodes.OK);
  return (await response.json()) as T;
}
const json = okJson;
export const contractsRequest = (url: string, body?: unknown) =>
  new Request(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const request = contractsRequest;
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
 * (50 cum, ₹10,000 gross) and a draft Work Order beside it. The Work
 * Order issues cement free (6.34 bag a cum, 2 % wastage, ₹500 penal):
 * 330 bags against 323.34 allowed is 6.66 bags, ₹3,330 recovered on the bill.
 */
export async function contractsBilledBothWays() {
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
  const bag = await unitNamed(ws, by, "Bag");
  const cement = await addMaterial(ws, by, {
    name: "Cement OPC 53 (site issue)",
    uomId: bag,
  });
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
  const storeId = await addStore(ws, by, [projectId]);
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
          materials: [
            {
              materialId: cement.id,
              issueBasis: "free",
              wastagePercent: "2",
              penalRate: 500_00,
              coefficients: [{ line: 0, coefficient: "6.34" }],
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
  await issueToContractor(ws, by, {
    projectId,
    storeId,
    contractorId,
    workOrderId: issued.id,
    material: cement,
    quantity: "330",
    deliveredOn: day(-13),
  });
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
    contractorId,
    workOrderId: issued.id,
    cement,
    approvedClient,
    approvedContractor,
    ...accounts,
  };
}
