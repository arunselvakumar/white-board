import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import ExcelJS from "exceljs";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { Flag } from "@/src/shared-kernel/access";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import { bytesOf } from "@/test/files";
import { addContractor, addUnit } from "@/test/procurement";
import {
  reportsEquipment,
  reportsMaintenance,
  reportsMovement,
  reportsUsageSheet,
  reportsWorksheet,
  worksheetContractor,
  worksheetDepartment,
  worksheetLocation,
} from "@/test/site-work";
import { TEST_ORIGIN } from "@/test/sessions";

import { GET as downloadReport } from "./[id]/download/route";
import type {
  ConstructionReportingReportJobResponseModel as Job,
  ListConstructionReportingReportsResponseModel as JobList,
} from "./report-models";
import { GET as listReports, POST as requestReport } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = `${TEST_ORIGIN}/api/construction/reporting/reports`;
const AUGUST = { from: "2026-08-01", to: "2026-08-31" };

type Actor = {
  userId: string;
  workspaceId: string;
  role: "owner" | "member";
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function request(actor: Actor, body: unknown) {
  actAs(actor);
  return requestReport(
    new Request(BASE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function download(actor: Actor, id: string, format: "xlsx" | "pdf") {
  actAs(actor);
  return downloadReport(
    new Request(`${BASE}/${id}/download?format=${format}`),
    { params: Promise.resolve({ id }) },
  );
}

async function generate(actor: Actor, body: unknown): Promise<Job> {
  const response = await request(actor, body);
  expect(response.status).toBe(StatusCodes.CREATED);
  const job = await json<Job>(response);
  expect(job.error).toBeNull();
  expect(job.status).toBe("done");
  return job;
}

async function workbook(actor: Actor, job: Job): Promise<ExcelJS.Workbook> {
  const response = await download(actor, job.id, "xlsx");
  expect(response.status).toBe(StatusCodes.OK);
  const book = new ExcelJS.Workbook();
  // exceljs declares its own `Buffer` type; a Node Buffer is what it reads.
  const bytes = Buffer.from(await bytesOf(response));
  await book.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  return book;
}

async function expectPdf(actor: Actor, job: Job): Promise<void> {
  const response = await download(actor, job.id, "pdf");
  expect(response.status).toBe(StatusCodes.OK);
  expect(response.headers.get("content-type")).toBe("application/pdf");
  const bytes = await bytesOf(response);
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
}

/** A sheet as rows of plain values (row 1 first). */
function rowsOf(sheet: ExcelJS.Worksheet | undefined): unknown[][] {
  const rows: unknown[][] = [];
  sheet?.eachRow({ includeEmpty: true }, (row, number) => {
    rows[number - 1] = (row.values as unknown[]).slice(1);
  });
  return Array.from(rows, (row: unknown[] | undefined) => row ?? []);
}

/** The table under the header row that starts with `first`. */
function tableOf(sheet: ExcelJS.Worksheet | undefined, first: string) {
  const rows = rowsOf(sheet);
  const headerIndex = rows.findIndex((row) => row[0] === first);
  const header = (rows[headerIndex] ?? []) as string[];
  const body = rows.slice(headerIndex + 1);
  const totalsIndex = body.findIndex((row) => row[0] === "Total");
  const lines = totalsIndex < 0 ? body : body.slice(0, totalsIndex);
  const cell = (row: unknown[] | undefined, label: string) =>
    row?.[header.indexOf(label)];
  const find = (value: string) => lines.find((row) => row.includes(value));
  return {
    rows,
    header,
    lines,
    cell,
    find,
    totals: totalsIndex < 0 ? undefined : body[totalsIndex],
  };
}

/**
 * Tower A and Villa B; two Contractors on Tower A; August worksheets on
 * both (one rejected, one deleted, one in September); an owned JCB and a
 * rented excavator at Tower A with August usage sheets; a mixer at the
 * warehouse that moves to Villa B; maintenance and transfers in and out
 * of the period.
 */
async function seed() {
  const company = await newCompany();
  const ws = company.workspaceId;
  const by = company.ownerId;
  const owner: Actor = { userId: by, workspaceId: ws, role: "owner" };
  const tower = await addProject(ws, by, "Tower A");
  const villa = await addProject(ws, by, "Villa B");
  const masonry = await worksheetDepartment(ws, by, {
    name: "Brick masonry crew",
  });
  const shuttering = await worksheetDepartment(ws, by, {
    name: "Formwork crew",
  });
  const velan = await worksheetContractor(ws, by, {
    name: "Velan Constructions",
    projectIds: [tower, villa],
    departmentIds: [masonry],
  });
  const murugan = await worksheetContractor(ws, by, {
    name: "Sri Murugan Works",
    projectIds: [tower],
    departmentIds: [shuttering],
  });
  const pumpHouse = await worksheetLocation(ws, by, tower, "Pump house");
  const cum = await addUnit(ws, by, `cum ${randomUUID().slice(0, 4)}`);

  const ws1 = await reportsWorksheet(ws, by, {
    projectId: tower,
    sheetDate: "2026-08-03",
    contractorId: velan,
    departmentId: masonry,
    skilled: 4,
    unskilled: 6,
    location: { type: "location", locationId: pumpHouse },
    approxWorkQty: "12.500",
    approxWorkUnitId: cum,
    materials: [
      { name: "Cement", unit: "Bag", quantity: "10" },
      { name: "Sand", unit: "cum", quantity: "2.5" },
    ],
    photos: 2,
    remark: "Plinth beam",
  });
  const ws2 = await reportsWorksheet(ws, by, {
    projectId: tower,
    sheetDate: "2026-08-04",
    contractorId: murugan,
    departmentId: shuttering,
    skilled: 2,
    unskilled: 3,
    shift: "shift_2",
    approval: "pending",
    materials: [{ name: "Cement", unit: "Bag", quantity: "1.5" }],
  });
  // Left out: rejected, deleted, another Project, outside the period.
  await reportsWorksheet(ws, by, {
    projectId: tower,
    sheetDate: "2026-08-05",
    contractorId: velan,
    departmentId: masonry,
    skilled: 50,
    approval: "rejected",
  });
  await reportsWorksheet(ws, by, {
    projectId: tower,
    sheetDate: "2026-08-05",
    contractorId: velan,
    departmentId: masonry,
    skilled: 60,
    deleted: true,
  });
  await reportsWorksheet(ws, by, {
    projectId: villa,
    sheetDate: "2026-08-05",
    contractorId: velan,
    departmentId: masonry,
    skilled: 70,
  });
  await reportsWorksheet(ws, by, {
    projectId: tower,
    sheetDate: "2026-09-01",
    contractorId: velan,
    departmentId: masonry,
    skilled: 80,
  });

  const hireParty = await addContractor(ws, by);
  const jcb = await reportsEquipment(ws, by, {
    name: "JCB 3DX",
    projectId: tower,
    placedOn: "2026-07-01",
    purchaseYear: 2020,
  });
  const excavator = await reportsEquipment(ws, by, {
    name: "Hired excavator",
    projectId: tower,
    placedOn: "2026-07-15",
    ownership: "rented",
    hirePartyId: hireParty,
    hireBasis: "hourly",
    hireRate: 120_000n,
  });
  const mixer = await reportsEquipment(ws, by, {
    name: "Concrete mixer",
    projectId: null,
    placedOn: "2026-07-01",
  });

  const jcb1 = await reportsUsageSheet(ws, by, {
    equipmentId: jcb.id,
    projectId: tower,
    sheetDate: "2026-08-03",
    operatorName: "Ravi",
    contractorId: velan,
    usageHours: "7.5",
    idleHours: "0.5",
    fuelQty: "40",
  });
  await reportsUsageSheet(ws, by, {
    equipmentId: jcb.id,
    projectId: tower,
    sheetDate: "2026-08-04",
    usageHours: "6",
    breakdownHours: "1.25",
    fuelQty: "30.5",
    fuelOverrun: true,
    approval: "approved",
  });
  await reportsUsageSheet(ws, by, {
    equipmentId: jcb.id,
    projectId: tower,
    sheetDate: "2026-08-05",
    usageHours: "9",
    approval: "rejected",
  });
  const ex1 = await reportsUsageSheet(ws, by, {
    equipmentId: excavator.id,
    projectId: tower,
    sheetDate: "2026-08-03",
    ownership: "rented",
    usageHours: "8",
    unitRate: 120_000n,
    billableQty: "8",
    hireCost: 960_000n,
  });
  await reportsUsageSheet(ws, by, {
    equipmentId: excavator.id,
    projectId: tower,
    sheetDate: "2026-08-05",
    ownership: "rented",
    usageHours: "4",
    unitRate: 120_000n,
    billableQty: "4",
    hireCost: 480_000n,
  });

  // Maintenance: the JCB at Tower A in August and June; the mixer at Villa B.
  await reportsMaintenance(ws, by, {
    equipmentId: jcb.id,
    startDate: "2026-08-10",
    endDate: "2026-08-12",
    cost: 450_000n,
    description: "Hydraulic hose",
  });
  await reportsMaintenance(ws, by, {
    equipmentId: jcb.id,
    startDate: "2026-07-02",
    endDate: "2026-07-03",
    cost: 10_000n,
  });
  await reportsMovement(ws, by, {
    equipmentId: mixer.id,
    kind: "to_project",
    movementDate: "2026-08-02",
    fromProjectId: null,
    toProjectId: villa,
    locationName: "Gate 2",
  });
  await reportsMaintenance(ws, by, {
    equipmentId: mixer.id,
    startDate: "2026-08-25",
    kind: "breakdown",
    cost: 200_000n,
  });
  // The JCB leaves Tower A for Villa B after its maintenance.
  await reportsMovement(ws, by, {
    equipmentId: jcb.id,
    kind: "to_project",
    movementDate: "2026-08-20",
    fromProjectId: tower,
    toProjectId: villa,
    locationName: "Villa yard",
    remark: "Foundation work",
  });

  actAs(owner);
  return {
    company,
    owner,
    tower,
    villa,
    velan,
    murugan,
    ws1,
    ws2,
    jcb,
    excavator,
    mixer,
    jcb1,
    ex1,
  };
}

type Seeded = Awaited<ReturnType<typeof seed>>;

async function member(
  s: Seeded,
  grants: Record<string, Flag[]>,
  projectIds: readonly string[],
): Promise<Actor> {
  const added = await addMember(
    s.company.workspaceId,
    s.company.ownerId,
    grants,
  );
  for (const projectId of projectIds)
    await prisma.constructionOrganizationTeamMemberProject.create({
      data: { memberId: added.memberId, projectId },
    });
  return {
    userId: added.userId,
    workspaceId: s.company.workspaceId,
    role: "member",
  };
}

describe("site-work report jobs HTTP (CM-605, CM-608)", () => {
  it("Daily Work: live, not rejected worksheets with names, location, materials and photos", async () => {
    const s = await seed();
    const job = await generate(s.owner, {
      kind: "daily_work",
      projectId: s.tower,
      params: AUGUST,
    });
    expect(job.title).toBe("Daily Work");
    expect(job.includesMoney).toBe(false);
    const book = await workbook(s.owner, job);
    const sheet = book.worksheets[0];
    const head = rowsOf(sheet);
    expect(head[1]?.[0]).toBe("Daily Work Report - Daily work");
    expect(head.find((row) => row[0] === "Project")?.[1]).toBe("Tower A");
    expect(head.find((row) => row[0] === "Period")?.[1]).toBe(
      "01 Aug 2026 to 31 Aug 2026",
    );
    const table = tableOf(sheet, "Date");
    expect(table.lines).toHaveLength(2);
    const first = table.find(s.ws1.number);
    expect(table.cell(first, "Contractor")).toBe("Velan Constructions");
    expect(table.cell(first, "Department")).toBe("Brick masonry crew");
    expect(table.cell(first, "Skilled")).toBe(4);
    expect(table.cell(first, "Location type")).toBe("Location");
    expect(table.cell(first, "Location")).toBe("Location · Pump house");
    expect(String(table.cell(first, "Approx work done"))).toMatch(/^12\.5 cum/);
    expect(table.cell(first, "Photos")).toBe(2);
    expect(table.cell(first, "Consumed material")).toBe(
      "Cement 10 Bag; Sand 2.5 cum",
    );
    const second = table.find(s.ws2.number);
    expect(table.cell(second, "Contractor")).toBe("Sri Murugan Works");
    expect(table.cell(second, "Shift")).toBe("Shift 2");
    expect(table.cell(table.totals, "Skilled")).toBe(6);
    expect(table.cell(table.totals, "Unskilled")).toBe(9);
    const materials = tableOf(book.worksheets[1], "Material");
    expect(materials.find("Cement")?.slice(0, 4)).toEqual([
      "Cement",
      "Bag",
      11.5,
      2,
    ]);
    await expectPdf(s.owner, job);

    // One Contractor.
    const velanOnly = await generate(s.owner, {
      kind: "daily_work",
      projectId: s.tower,
      params: { ...AUGUST, contractorId: s.velan },
    });
    expect(velanOnly.params.contractorId).toBe(s.velan);
    const filtered = tableOf(
      (await workbook(s.owner, velanOnly)).worksheets[0],
      "Date",
    );
    expect(filtered.lines).toHaveLength(1);
    expect(
      rowsOf((await workbook(s.owner, velanOnly)).worksheets[0]).some(
        (row) => row[0] === "Contractor: Velan Constructions",
      ),
    ).toBe(true);
  });

  it("Company Owned and Rented Equipment Usage across two machines, with hire cost for Financial", async () => {
    const s = await seed();
    const owned = await generate(s.owner, {
      kind: "owned_equipment_usage",
      projectId: s.tower,
      params: AUGUST,
    });
    expect(owned.includesMoney).toBe(false);
    const ownedBook = await workbook(s.owner, owned);
    const ownedTable = tableOf(ownedBook.worksheets[0], "Date");
    // Two JCB sheets; the rejected one and the rented machine are left out.
    expect(ownedTable.lines).toHaveLength(2);
    expect(ownedTable.header).not.toContain("Hire cost");
    const jcbRow = ownedTable.find(s.jcb1.number);
    expect(ownedTable.cell(jcbRow, "Equipment")).toBe("JCB 3DX");
    expect(ownedTable.cell(jcbRow, "Equipment No.")).toBe(
      s.jcb.equipmentNumber,
    );
    expect(ownedTable.cell(jcbRow, "Operator")).toBe("Ravi");
    expect(ownedTable.cell(jcbRow, "Contractor")).toBe("Velan Constructions");
    expect(ownedTable.cell(jcbRow, "Usage")).toBe(7.5);
    expect(ownedTable.cell(jcbRow, "Unit")).toBe("hrs");
    expect(ownedTable.cell(jcbRow, "Fuel unit")).toBe("litre");
    expect(ownedTable.cell(ownedTable.totals, "Usage")).toBe(13.5);
    expect(ownedTable.cell(ownedTable.totals, "Breakdown hrs")).toBe(1.25);
    expect(ownedTable.cell(ownedTable.totals, "Fuel")).toBe(70.5);
    expect(ownedTable.cell(ownedTable.totals, "Fuel overrun")).toBe("1");
    await expectPdf(s.owner, owned);

    const rented = await generate(s.owner, {
      kind: "rented_equipment_usage",
      projectId: s.tower,
      params: AUGUST,
    });
    expect(rented.includesMoney).toBe(true);
    const rentedTable = tableOf(
      (await workbook(s.owner, rented)).worksheets[0],
      "Date",
    );
    expect(rentedTable.lines).toHaveLength(2);
    const ex = rentedTable.find(s.ex1.number);
    expect(rentedTable.cell(ex, "Hire basis")).toBe("Hourly");
    expect(rentedTable.cell(ex, "Billable qty")).toBe(8);
    // Excel prints paise as rupees.
    expect(rentedTable.cell(ex, "Unit rate")).toBe(1200);
    expect(rentedTable.cell(ex, "Hire cost")).toBe(9600);
    expect(rentedTable.cell(rentedTable.totals, "Hire cost")).toBe(14_400);
    await expectPdf(s.owner, rented);

    // One machine.
    const onlyJcb = await generate(s.owner, {
      kind: "owned_equipment_usage",
      projectId: s.tower,
      params: { ...AUGUST, equipmentId: s.excavator.id },
    });
    expect(
      tableOf((await workbook(s.owner, onlyJcb)).worksheets[0], "Date").lines,
    ).toHaveLength(0);
  });

  it("hides hire cost and maintenance cost without Financial", async () => {
    const s = await seed();
    const usage = await member(
      s,
      { "site_work.equipment_usage": ["read", "report"] },
      [s.tower],
    );
    const own = await generate(usage, {
      kind: "rented_equipment_usage",
      projectId: s.tower,
      params: AUGUST,
    });
    expect(own.includesMoney).toBe(false);
    const table = tableOf((await workbook(usage, own)).worksheets[0], "Date");
    expect(table.header).toContain("Hire party");
    expect(table.header).not.toContain("Hire cost");
    expect(table.header).not.toContain("Unit rate");
    // The Owner's file carries hire cost: refused.
    const owners = await generate(s.owner, {
      kind: "rented_equipment_usage",
      projectId: s.tower,
      params: AUGUST,
    });
    expect((await download(usage, owners.id, "xlsx")).status).toBe(
      StatusCodes.FORBIDDEN,
    );

    const equipments = await member(
      s,
      { "masters.equipments": ["read", "report"] },
      [],
    );
    const maintenance = await generate(equipments, {
      kind: "equipment_maintenance",
      projectId: null,
      params: AUGUST,
    });
    expect(maintenance.includesMoney).toBe(false);
    const entries = tableOf(
      (await workbook(equipments, maintenance)).worksheets[0],
      "Equipment",
    );
    expect(entries.header).not.toContain("Cost");
    expect(entries.lines).toHaveLength(2);
  });

  it("Equipment Maintenance: central covers every machine; from a Project, those there when it started", async () => {
    const s = await seed();
    const central = await generate(s.owner, {
      kind: "equipment_maintenance",
      projectId: null,
      params: AUGUST,
    });
    expect(central.projectId).toBeNull();
    expect(central.includesMoney).toBe(true);
    const book = await workbook(s.owner, central);
    expect(
      rowsOf(book.worksheets[0]).find((row) => row[0] === "Project")?.[1],
    ).toBe("All projects");
    const table = tableOf(book.worksheets[0], "Equipment");
    // June's entry is outside the period.
    expect(table.lines).toHaveLength(2);
    const jcb = table.find("JCB 3DX");
    expect(table.cell(jcb, "Project")).toBe("Tower A");
    expect(table.cell(jcb, "Days")).toBe(3);
    expect(table.cell(jcb, "Cost")).toBe(4500);
    expect(table.cell(jcb, "Description")).toBe("Hydraulic hose");
    const mixer = table.find("Concrete mixer");
    expect(table.cell(mixer, "Project")).toBe("Villa B");
    expect(table.cell(mixer, "End")).toBe("In maintenance");
    // Open: 25 to 31 August.
    expect(table.cell(mixer, "Days")).toBe(7);
    expect(table.cell(table.totals, "Cost")).toBe(6500);
    await expectPdf(s.owner, central);

    const tower = await generate(s.owner, {
      kind: "equipment_maintenance",
      projectId: s.tower,
      params: AUGUST,
    });
    const towerTable = tableOf(
      (await workbook(s.owner, tower)).worksheets[0],
      "Equipment",
    );
    expect(towerTable.header).not.toContain("Project");
    expect(towerTable.lines).toHaveLength(1);
    expect(towerTable.find("JCB 3DX")).toBeDefined();

    const villa = tableOf(
      (
        await workbook(
          s.owner,
          await generate(s.owner, {
            kind: "equipment_maintenance",
            projectId: s.villa,
            params: AUGUST,
          }),
        )
      ).worksheets[0],
      "Equipment",
    );
    expect(villa.lines.map((row) => row[0])).toEqual(["Concrete mixer"]);
  });

  it("Equipment Transfers: central, and from a Project the transfers out of or into it", async () => {
    const s = await seed();
    const central = await generate(s.owner, {
      kind: "equipment_transfers",
      projectId: null,
      params: AUGUST,
    });
    expect(central.includesMoney).toBe(false);
    const table = tableOf(
      (await workbook(s.owner, central)).worksheets[0],
      "Equipment Name",
    );
    expect(table.header).toEqual([
      "Equipment Name",
      "Number",
      "Purchase Year",
      "Transfer Date",
      "Location Before",
      "Transfer To Project",
      "Latest Location",
      "Remarks",
      "Entry By",
    ]);
    // `added` movements are not transfers.
    expect(table.lines).toHaveLength(2);
    const mixer = table.find("Concrete mixer");
    expect(table.cell(mixer, "Location Before")).toBe("Warehouse / off system");
    expect(table.cell(mixer, "Transfer To Project")).toBe("Villa B");
    expect(table.cell(mixer, "Latest Location")).toBe("Gate 2");
    const jcb = table.find("JCB 3DX");
    expect(table.cell(jcb, "Purchase Year")).toBe("2020");
    expect(table.cell(jcb, "Transfer Date")).toBe("20 Aug 2026");
    expect(table.cell(jcb, "Location Before")).toBe("Tower A · Site");
    expect(table.cell(jcb, "Remarks")).toBe("Foundation work");
    expect(table.cell(jcb, "Entry By")).toBe("Arun Selva Kumar");
    await expectPdf(s.owner, central);

    const tower = tableOf(
      (
        await workbook(
          s.owner,
          await generate(s.owner, {
            kind: "equipment_transfers",
            projectId: s.tower,
            params: AUGUST,
          }),
        )
      ).worksheets[0],
      "Equipment Name",
    );
    expect(tower.lines.map((row) => row[0])).toEqual(["JCB 3DX"]);
    const villa = tableOf(
      (
        await workbook(
          s.owner,
          await generate(s.owner, {
            kind: "equipment_transfers",
            projectId: s.villa,
            params: AUGUST,
          }),
        )
      ).worksheets[0],
      "Equipment Name",
    );
    expect(villa.lines).toHaveLength(2);
  });

  it("checks each kind's menu, Report flag and Project (403), and scope", async () => {
    const s = await seed();
    const worksheets = await member(
      s,
      { "site_work.daily_worksheet": ["read", "report"] },
      [s.tower],
    );
    await generate(worksheets, {
      kind: "daily_work",
      projectId: s.tower,
      params: AUGUST,
    });
    for (const kind of [
      "owned_equipment_usage",
      "rented_equipment_usage",
      "equipment_maintenance",
      "equipment_transfers",
    ])
      expect(
        (
          await request(worksheets, {
            kind,
            projectId: s.tower,
            params: AUGUST,
          })
        ).status,
        kind,
      ).toBe(StatusCodes.FORBIDDEN);
    // Not on Villa B.
    expect(
      (
        await request(worksheets, {
          kind: "daily_work",
          projectId: s.villa,
          params: AUGUST,
        })
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);

    // Read without Report.
    const reader = await member(
      s,
      {
        "site_work.daily_worksheet": ["read"],
        "site_work.equipment_usage": ["read"],
        "masters.equipments": ["read"],
      },
      [s.tower],
    );
    for (const [kind, projectId] of [
      ["daily_work", s.tower],
      ["owned_equipment_usage", s.tower],
      ["equipment_transfers", null],
    ] as const)
      expect(
        (await request(reader, { kind, projectId, params: AUGUST })).status,
        kind,
      ).toBe(StatusCodes.FORBIDDEN);

    // The Project's list shows only the kinds the member may report on.
    const listed = await json<JobList>(
      await (() => {
        actAs(worksheets);
        return listReports(new Request(`${BASE}?projectId=${s.tower}`));
      })(),
    );
    expect(listed.items.map((item) => item.kind)).toEqual(["daily_work"]);

    // Only the equipment lifecycle reports can be central.
    const central = await request(s.owner, {
      kind: "daily_work",
      projectId: null,
      params: AUGUST,
    });
    expect(central.status).toBe(StatusCodes.BAD_REQUEST);

    // An unknown filter fails the job with its own words.
    const unknown = await request(s.owner, {
      kind: "daily_work",
      projectId: s.tower,
      params: { ...AUGUST, contractorId: randomUUID() },
    });
    expect(unknown.status).toBe(StatusCodes.CREATED);
    const failed = await json<Job>(unknown);
    expect(failed.status).toBe("failed");
    expect(failed.error).toBe("There is no such Contractor.");
  });

  it("lists the requester's central equipment reports", async () => {
    const s = await seed();
    const equipments = await member(
      s,
      { "masters.equipments": ["read", "report", "financial"] },
      [],
    );
    const job = await generate(equipments, {
      kind: "equipment_transfers",
      projectId: null,
      params: AUGUST,
    });
    actAs(equipments);
    const mine = await json<JobList>(await listReports(new Request(BASE)));
    expect(mine.items.map((item) => item.id)).toEqual([job.id]);
  });

  it("is on /api/docs", async () => {
    const document = await json<{
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    const request = JSON.stringify(
      document.components.schemas["RequestConstructionReportingReportRequest"],
    );
    for (const kind of [
      "daily_work",
      "owned_equipment_usage",
      "rented_equipment_usage",
      "equipment_maintenance",
      "equipment_transfers",
    ])
      expect(request).toContain(kind);
  });
});
