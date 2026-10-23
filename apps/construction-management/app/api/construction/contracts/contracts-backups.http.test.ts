import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { unzipSync } from "fflate";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as downloadBackup } from "@/app/api/construction/reporting/backups/[id]/download/route";
import type { ConstructionReportingBackupResponseModel as Backup } from "@/app/api/construction/reporting/backups/backup-models";
import { POST as requestBackup } from "@/app/api/construction/reporting/backups/route";
import { BACKUPS_PATH } from "@/src/composition/backup-jobs";
import { missingBackupReaders } from "@/src/composition/backup-sources";
import {
  backupModule,
  backupModulesIn,
} from "@/src/reporting/domain/backup-modules";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import {
  addClient,
  addLibraryItem,
  addRunningBill,
  measureClientItems,
} from "@/test/contracts";
import { pngBytes } from "@/test/files";
import { TEST_ORIGIN } from "@/test/sessions";
import {
  sharedAssign,
  worksheetContractor,
  worksheetDepartment,
} from "@/test/site-work";

const BASE = `${TEST_ORIGIN}${BACKUPS_PATH}`;
const CONTRACTS = [
  "contracts.boq",
  "contracts.work_orders",
  "contracts.measurements",
  "contracts.contractor_bills",
  "contracts.client_bills",
];

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;
type Files = Record<string, string | Uint8Array>;
type Manifest = {
  modules: {
    key: string;
    entities: { entity: string; rows: number }[];
    mediaFiles: number;
  }[];
};

async function done(cookie: string, body: unknown): Promise<Backup> {
  const response = await requestBackup(jsonRequest(BASE, cookie, body));
  expect(response.status, await response.clone().text()).toBe(
    StatusCodes.CREATED,
  );
  const backup = (await response.json()) as Backup;
  expect(backup.error).toBeNull();
  expect(backup.status).toBe("done");
  return backup;
}

async function zipOf(cookie: string, backup: Backup): Promise<Files> {
  const url = new URL(`${TEST_ORIGIN}${backup.downloadHref ?? ""}`);
  const id = url.pathname.split("/").at(-2) ?? "";
  const response = await downloadBackup(jsonRequest(url.toString(), cookie), {
    params: Promise.resolve({ id }),
  });
  expect(response.status).toBe(StatusCodes.OK);
  const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
  return Object.fromEntries(
    Object.entries(files).map(([path, bytes]) => [
      path,
      /\.(csv|json)$/.test(path) ? new TextDecoder().decode(bytes) : bytes,
    ]),
  );
}

function csvLines(files: Files, path: string): string[] {
  const value = files[path];
  if (typeof value !== "string") throw new Error(`No text file ${path}`);
  return value
    .replace(/^\uFEFF/, "")
    .trimEnd()
    .split("\r\n");
}

function rowsOf(files: Files, module: string): Record<string, number> {
  const manifest = JSON.parse(String(files["manifest.json"])) as Manifest;
  const found = manifest.modules.find((row) => row.key === module);
  return Object.fromEntries(
    (found?.entities ?? []).map((row) => [row.entity, row.rows]),
  );
}

/**
 * A Project with a BOQ item, a Variation, an issued Work Order with a
 * free-issue material, a measurement sheet with a photo, a contractor and
 * a client RA bill with a deduction each, an advance both ways, a bank
 * guarantee, a retention release and an escalation clause; plus a deleted
 * bill and one outside the range, which stay out.
 */
async function contractsOf(company: Company) {
  const ws = company.workspaceId;
  const by = company.userId;
  const projectId = await addProject(ws, by, "Metro Depot");
  const departmentId = await worksheetDepartment(ws, by, { name: "Civil" });
  const contractorId = await worksheetContractor(ws, by, {
    projectIds: [projectId],
    departmentIds: [departmentId],
    name: "Velan Constructions",
  });
  const clientId = await addClient(ws, by);
  const uomId = randomUUID();
  const materialId = randomUUID();
  await prisma.constructionContractsClientContract.create({
    data: {
      id: randomUUID(),
      workspaceId: ws,
      projectId,
      retentionPercent: "5",
      createdBy: by,
      updatedBy: by,
    },
  });
  const sectionId = randomUUID();
  const boqItemId = randomUUID();
  await prisma.constructionContractsBoqSection.create({
    data: {
      id: sectionId,
      workspaceId: ws,
      projectId,
      title: "Earthwork",
      position: 0,
      createdBy: by,
      updatedBy: by,
      items: {
        create: {
          id: boqItemId,
          workspaceId: ws,
          projectId,
          itemNo: "1.1",
          description: "Excavation in ordinary soil",
          uomId,
          originalQuantity: "100",
          quantity: "120",
          originalRate: 250_00n,
          rate: 250_00n,
          position: 0,
          createdBy: by,
          updatedBy: by,
        },
      },
    },
  });
  await prisma.constructionContractsVariation.create({
    data: {
      id: randomUUID(),
      workspaceId: ws,
      projectId,
      number: "VAR-001",
      kind: "quantity",
      status: "approved",
      boqItemId,
      previousQuantity: "100",
      newQuantity: "120",
      reason: "Deeper footings",
      createdAt: new Date("2026-09-15T10:00:00Z"),
      createdBy: by,
      updatedBy: by,
    },
  });
  const workOrderId = randomUUID();
  const lineId = randomUUID();
  await prisma.constructionContractsWorkOrder.create({
    data: {
      id: workOrderId,
      workspaceId: ws,
      projectId,
      contractorId,
      departmentId,
      number: "WO-001",
      orderDate: new Date("2026-09-01"),
      status: "issued",
      retentionPercent: "5",
      createdBy: by,
      updatedBy: by,
      lines: {
        create: {
          id: lineId,
          workspaceId: ws,
          kind: "non_boq",
          itemNo: "1",
          description: "PCC 1:4:8",
          uomId,
          quantity: "175",
          rate: 4_000_00n,
          position: 0,
        },
      },
    },
  });
  await prisma.constructionContractsWorkOrderMaterial.create({
    data: {
      id: randomUUID(),
      workspaceId: ws,
      workOrderId,
      materialId,
      issueBasis: "free",
      wastagePercent: "2",
      penalRate: 500_00n,
      coefficients: {
        create: {
          workOrderLineId: lineId,
          workspaceId: ws,
          coefficient: "6.34",
        },
      },
    },
  });
  const sheet = await measureClientItems(ws, by, {
    projectId,
    measuredOn: "2026-09-10",
    rows: [{ boqItemId, quantity: "120" }],
  });
  const photoKey = `companies/${ws}/measurement-photos/${randomUUID()}.png`;
  await objectStorage().put(photoKey, pngBytes(), "image/png");
  await prisma.constructionContractsMeasurementPhoto.create({
    data: {
      id: randomUUID(),
      workspaceId: ws,
      projectId,
      sheetId: sheet.sheetId,
      fileKey: photoKey,
      fileName: "pcc-pour.png",
      contentType: "image/png",
      bytes: 64,
      createdBy: by,
    },
  });
  const contractorBill = await addRunningBill(ws, by, {
    projectId,
    side: "contractor",
    workOrderId,
    billDate: "2026-09-20",
    gross: 4_80_000_00n,
    ordinal: 1,
  });
  await prisma.constructionContractsBillDeduction.create({
    data: {
      id: randomUUID(),
      workspaceId: ws,
      billId: contractorBill,
      kind: "retention",
      amount: 24_000_00n,
      position: 0,
    },
  });
  const clientBill = await addRunningBill(ws, by, {
    projectId,
    side: "client",
    clientId,
    billDate: "2026-09-25",
    gross: 30_000_00n,
    ordinal: 1,
  });
  await prisma.constructionContractsBillDeduction.create({
    data: {
      id: randomUUID(),
      workspaceId: ws,
      billId: clientBill,
      kind: "retention",
      amount: 1_500_00n,
      position: 0,
    },
  });
  const gone = await addRunningBill(ws, by, {
    projectId,
    side: "contractor",
    workOrderId,
    billDate: "2026-09-21",
    gross: 1_00n,
    status: "draft",
  });
  await prisma.constructionContractsBill.update({
    where: { id: gone },
    data: { deletedAt: new Date(), deletedBy: by },
  });
  await addRunningBill(ws, by, {
    projectId,
    side: "contractor",
    workOrderId,
    billDate: "2026-10-05",
    gross: 2_00n,
    ordinal: 2,
  });
  for (const direction of ["given", "received"] as const)
    await prisma.constructionContractsAdvance.create({
      data: {
        id: randomUUID(),
        workspaceId: ws,
        projectId,
        direction,
        kind: "mobilisation",
        workOrderId: direction === "given" ? workOrderId : null,
        clientId: direction === "received" ? clientId : null,
        amount: 50_000_00n,
        advanceOn: new Date("2026-09-05"),
        recoveryMode: "percent",
        recoveryValue: "10",
        createdBy: by,
        updatedBy: by,
      },
    });
  await prisma.constructionContractsBankGuarantee.create({
    data: {
      id: randomUUID(),
      workspaceId: ws,
      projectId,
      side: "contractor",
      purpose: "performance",
      workOrderId,
      number: "BG-77",
      bank: "Indian Bank",
      amount: 1_00_000_00n,
      issuedOn: new Date("2026-09-02"),
      expiresOn: new Date("2027-09-01"),
      createdBy: by,
      updatedBy: by,
    },
  });
  await prisma.constructionContractsRetentionRelease.create({
    data: {
      id: randomUUID(),
      workspaceId: ws,
      projectId,
      side: "client",
      clientId,
      stage: "other",
      amount: 500_00n,
      releasedOn: new Date("2026-09-28"),
      reason: "Against BG",
      createdBy: by,
    },
  });
  await prisma.constructionContractsEscalationClause.create({
    data: {
      id: randomUUID(),
      workspaceId: ws,
      projectId,
      side: "contractor",
      workOrderId,
      baseMonth: new Date("2026-08-01"),
      createdBy: by,
      updatedBy: by,
      components: {
        create: [
          {
            id: randomUUID(),
            workspaceId: ws,
            component: "labour",
            weightPercent: "100",
            series: "CPI-IW",
          },
        ],
      },
    },
  });
  return { projectId, contractorBill, clientBill };
}

describe("Contracts backup modules (CM-1111)", () => {
  it("has a reader for every contracts entity, in a Contracts group", () => {
    expect(missingBackupReaders()).toEqual([]);
    expect(
      backupModulesIn("project")
        .filter((module) => module.group === "Contracts")
        .map((module) => module.key),
    ).toEqual(CONTRACTS);
    expect(backupModule("contracts.items")?.entities).toEqual([
      "contract_items",
      "contract_item_analysis_lines",
      "price_indices",
    ]);
    expect(backupModule("company.settings")?.entities).toContain(
      "contracts_settings",
    );
  });

  it("exports each side's records with the range, leaves deleted rows out, and adds measurement photos", async () => {
    const owner = await ownerWithCompany();
    const { projectId, contractorBill, clientBill } = await contractsOf(owner);
    const backup = await done(owner.cookie, {
      scope: "project",
      projectId,
      modules: CONTRACTS,
      from: "2026-09-01",
      to: "2026-09-30",
      includeData: true,
      includeMedia: true,
    });
    expect(backup.includesMoney).toBe(true);
    const files = await zipOf(owner.cookie, backup);
    expect(rowsOf(files, "contracts.boq")).toEqual({
      client_contract_terms: 1,
      boq_sections: 1,
      boq_items: 1,
      variations: 1,
    });
    expect(rowsOf(files, "contracts.work_orders")).toEqual({
      work_orders: 1,
      work_order_lines: 1,
      work_order_materials: 1,
      work_order_revisions: 0,
    });
    expect(rowsOf(files, "contracts.measurements")).toEqual({
      measurement_sheets: 1,
      measurement_rows: 1,
    });
    // The deleted draft and the October bill stay out.
    expect(rowsOf(files, "contracts.contractor_bills")).toEqual({
      contractor_bills: 1,
      contractor_bill_lines: 0,
      contractor_bill_deductions: 1,
      contractor_advances: 1,
      contractor_bank_guarantees: 1,
      contractor_retention_releases: 0,
      contractor_escalation_clauses: 1,
      contractor_escalation_components: 1,
    });
    expect(rowsOf(files, "contracts.client_bills")).toEqual({
      client_bills: 1,
      client_bill_lines: 0,
      client_bill_deductions: 1,
      client_advances: 1,
      client_bank_guarantees: 0,
      client_retention_releases: 1,
      client_escalation_clauses: 0,
      client_escalation_components: 0,
    });

    const bills = csvLines(files, "contractor-bills/contractor_bills.csv");
    expect(bills[0]).toContain("Bill No.,RA No.,Type,WO No.,Contractor");
    expect(bills[1]).toContain(contractorBill);
    expect(bills[1]).toContain("WO-001,Velan Constructions");
    expect(bills[1]).toContain("480000.00");
    const clientBills = csvLines(files, "client-bills/client_bills.csv");
    expect(clientBills[0]).toContain("Type,Client,Bill Date");
    expect(clientBills[1]).toContain(clientBill);
    expect(clientBills[1]).toContain("Tamil Nadu Housing Board");
    const materials = csvLines(files, "work-orders/work_order_materials.csv");
    expect(materials[0]).toContain("Penal Rate (₹)");
    expect(materials[1]).toContain("6.34");
    expect(
      Object.keys(files).filter((path) =>
        path.startsWith("media/measurement-book/"),
      ),
    ).toHaveLength(1);
  });

  it("leaves amounts out without the module's Financial flag", async () => {
    const owner = await ownerWithCompany();
    const { projectId } = await contractsOf(owner);
    const viewer = await memberWith(owner, {
      "projects.project": ["read"],
      "contracts.contractor_bills": ["read"],
    });
    await sharedAssign(viewer.memberId, projectId);
    const backup = await done(viewer.cookie, {
      scope: "project",
      projectId,
      modules: ["contracts.contractor_bills"],
    });
    expect(backup.includesMoney).toBe(false);
    const files = await zipOf(viewer.cookie, backup);
    const header = csvLines(files, "contractor-bills/contractor_bills.csv")[0];
    expect(header).toContain("Bill Date");
    expect(header).not.toContain("Gross (₹)");
    expect(header).not.toContain("Net (₹)");
  });

  it("holds the Item Library and price indices among the master records", async () => {
    const owner = await ownerWithCompany();
    const ws = owner.workspaceId;
    const by = owner.userId;
    await addLibraryItem(ws, by, {
      code: "PCC-148",
      uomId: randomUUID(),
      adoptedRate: 4_150_00n,
    });
    await prisma.constructionContractsPriceIndex.create({
      data: {
        id: randomUUID(),
        workspaceId: ws,
        series: "WPI",
        month: new Date("2026-08-01"),
        value: "154.2",
        createdBy: by,
        updatedBy: by,
      },
    });
    const backup = await done(owner.cookie, {
      scope: "masters",
      modules: ["contracts.items"],
    });
    const files = await zipOf(owner.cookie, backup);
    expect(rowsOf(files, "contracts.items")).toEqual({
      contract_items: 1,
      contract_item_analysis_lines: 0,
      price_indices: 1,
    });
    const items = csvLines(files, "masters/item-library/contract_items.csv");
    expect(items[1]).toContain("PCC-148");
    expect(items[1]).toContain("4150.00");
  });
});
