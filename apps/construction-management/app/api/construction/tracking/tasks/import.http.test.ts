import { prisma } from "@repo/construction-db";
import ExcelJS from "exceljs";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import { addContractor, addUnit } from "@/test/procurement";
import { trackingMaster } from "@/test/tracking";

import { GET as getOne } from "./[id]/route";
import { POST as importRoute } from "./import/route";
import { GET as sample } from "./import-sample/route";
import { GET as list } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = "http://localhost/api/construction/tracking/tasks";

const HEADERS = [
  "Ref",
  "Parent Ref",
  "Task Name*",
  "Description",
  "Start Date",
  "Due Date",
  "Priority",
  "Assignees",
  "Department",
  "Contractor",
  "Tags",
  "Total Work",
  "Unit",
  "Total Price",
];

type Task = {
  id: string;
  taskNo: number;
  name: string;
  depth: number;
  parentId: string | null;
  priority: string | null;
  assignees: { id: string; name: string | null }[];
  contractor: { id: string } | null;
  tags: { id: string; name: string | null }[];
  totalWorkQty: string | null;
  totalPrice: number | null;
  baselineVersion: number;
  baselineStart: string | null;
  status: string;
};
type ImportError = {
  code: string;
  details?: { errors: { row: number; field: string; message: string }[] };
};

async function workbook(rows: unknown[][]): Promise<Uint8Array> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Tasks");
  sheet.addRow(HEADERS);
  for (const row of rows) sheet.addRow(row);
  return new Uint8Array(await book.xlsx.writeBuffer());
}

function upload(url: string, bytes: Uint8Array): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
    body: Buffer.from(bytes),
  });
}

async function setup() {
  const company = await newCompany();
  const workspaceId = company.workspaceId;
  const by = company.ownerId;
  const projectId = await addProject(workspaceId, by);
  const unitId = await addUnit(workspaceId, by, "Cum");
  const contractorId = await addContractor(workspaceId, by, [projectId]);
  const contractor =
    await prisma.constructionMastersContractor.findUniqueOrThrow({
      where: { id: contractorId },
      select: { name: true },
    });
  const engineer = await addMember(workspaceId, by, {
    "tracking.tasks": ["read"],
  });
  await prisma.constructionOrganizationTeamMemberProject.create({
    data: { memberId: engineer.memberId, projectId },
  });
  await prisma.constructionOrganizationTeamMember.update({
    where: { id: engineer.memberId },
    data: { name: "Karthik Raja" },
  });
  const tag = await trackingMaster("tag", workspaceId, by, {
    name: "Structure",
  });
  const owner = { userId: by, workspaceId, role: "owner" as const };
  actAs(owner);
  return {
    workspaceId,
    owner,
    projectId,
    unitId,
    contractorName: contractor.name,
    engineer,
    tag,
  };
}

async function tasks(projectId: string): Promise<Task[]> {
  const response = await list(new Request(`${BASE}?projectId=${projectId}`));
  return ((await response.json()) as { items: Task[] }).items;
}

describe("Task import (CM-802)", () => {
  it("offers a sample with the headers and example rows", async () => {
    const ctx = await setup();
    const response = await sample(
      new Request(`${BASE}/import-sample?projectId=${ctx.projectId}`),
    );
    expect(response.status).toBe(StatusCodes.OK);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await response.arrayBuffer());
    const sheet = book.getWorksheet("Tasks");
    expect(sheet?.getRow(1).values).toEqual([undefined, ...HEADERS]);
    expect(sheet?.getRow(3).getCell(8).value).toBe("Karthik Raja");
  });

  it("imports a tree with masters by name and creates unknown tags", async () => {
    const ctx = await setup();
    const bytes = await workbook([
      [
        "A",
        "",
        "Tower A",
        "",
        "",
        "",
        "High",
        "",
        "",
        "",
        "structure",
        "",
        "",
        "",
      ],
      [
        "A1",
        "A",
        "Columns",
        "Ground floor",
        "02/11/2026",
        "09/11/2026",
        "medium",
        "karthik raja",
        "",
        ctx.contractorName.toUpperCase(),
        "Structure, New Tag",
        48,
        "CUM",
        "2,50,000.50",
      ],
      [
        "A1a",
        "A",
        "Starter bars",
        "",
        new Date(Date.UTC(2026, 10, 3)),
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ],
    ]);
    const response = await importRoute(
      upload(`${BASE}/import?projectId=${ctx.projectId}`, bytes),
    );
    expect(response.status).toBe(StatusCodes.CREATED);
    expect(await response.json()).toEqual({ imported: 3 });
    const rows = await tasks(ctx.projectId);
    expect(rows.map((t) => [t.name, t.depth, t.taskNo])).toEqual([
      ["Tower A", 1, 1],
      ["Columns", 2, 2],
      ["Starter bars", 2, 3],
    ]);
    const columns = rows[1];
    if (columns == null) throw new Error("Columns");
    const detail = (await (
      await getOne(new Request(`${BASE}/${columns.id}`), {
        params: Promise.resolve({ id: columns.id }),
      })
    ).json()) as Task;
    expect(detail).toMatchObject({
      priority: "medium",
      assignees: [{ id: ctx.engineer.memberId, name: "Karthik Raja" }],
      totalWorkQty: "48",
      totalPrice: 25_000_050,
      status: "not_started",
    });
    expect(detail.tags.map((t) => t.name).sort()).toEqual([
      "New Tag",
      "Structure",
    ]);
    expect(detail.baselineVersion).toBe(1);
    const created = await prisma.constructionMastersTag.findMany({
      where: { workspaceId: ctx.workspaceId, deletedAt: null },
    });
    expect(created.map((t) => t.name).sort()).toEqual(["New Tag", "Structure"]);
  });

  it("captures baselines for leaves with both dates", async () => {
    const ctx = await setup();
    const bytes = await workbook([
      [
        "1",
        "",
        "Excavation",
        "",
        "2026-11-01",
        "2026-11-05",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ],
    ]);
    await importRoute(
      upload(`${BASE}/import?projectId=${ctx.projectId}`, bytes),
    );
    const [row] = await tasks(ctx.projectId);
    expect(row).toMatchObject({
      baselineVersion: 1,
      baselineStart: "2026-11-01",
    });
  });

  it("refuses the whole sheet with every row's problems", async () => {
    const ctx = await setup();
    const bytes = await workbook([
      ["A", "", "Tower", "", "", "", "Urgent", "", "", "", "", "", "", ""],
      ["A", "", "", "", "31/02/2026", "", "", "Nobody", "", "", "", "", "", ""],
      ["B", "Z", "Orphan", "", "", "", "", "", "", "", "", 5, "", ""],
      ["C1", "", "One", "", "", "", "", "", "", "", "", "", "", ""],
      ["C2", "C1", "Two", "", "", "", "", "", "", "", "", "", "", ""],
      ["C3", "C2", "Three", "", "", "", "", "", "", "", "", "", "", ""],
      ["C4", "C3", "Four", "", "", "", "", "", "", "", "", "", "", ""],
      ["L1", "L2", "Loop 1", "", "", "", "", "", "", "", "", "", "", ""],
      ["L2", "L1", "Loop 2", "", "", "", "", "", "", "", "", "", "", ""],
    ]);
    const response = await importRoute(
      upload(`${BASE}/import?projectId=${ctx.projectId}`, bytes),
    );
    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    const body = (await response.json()) as ImportError;
    expect(body.code).toBe("IMPORT_HAS_ERRORS");
    const problems = (body.details?.errors ?? []).map(
      (e) => `${String(e.row)} ${e.field}`,
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        "2 Priority",
        "3 Ref",
        "3 Task Name*",
        "3 Start Date",
        "3 Assignees",
        "4 Parent Ref",
        "4 Unit",
        "8 Parent Ref",
        "9 Parent Ref",
        "10 Parent Ref",
      ]),
    );
    expect(await tasks(ctx.projectId)).toEqual([]);
  });

  it("refuses unknown tags without Tags Create and prices without Financial", async () => {
    const ctx = await setup();
    const planner = await addMember(ctx.workspaceId, ctx.owner.userId, {
      "tracking.tasks": ["read", "create"],
    });
    await prisma.constructionOrganizationTeamMemberProject.create({
      data: { memberId: planner.memberId, projectId: ctx.projectId },
    });
    actAs({
      userId: planner.userId,
      workspaceId: ctx.workspaceId,
      role: "member",
    });
    const bytes = await workbook([
      ["1", "", "Slab", "", "", "", "", "", "", "", "Brand new", "", "", 5000],
    ]);
    const response = await importRoute(
      upload(`${BASE}/import?projectId=${ctx.projectId}`, bytes),
    );
    const body = (await response.json()) as ImportError;
    expect(body.details?.errors.map((e) => e.field).sort()).toEqual([
      "Tags",
      "Total Price",
    ]);
    // Without Task create: 403.
    const reader = await addMember(ctx.workspaceId, ctx.owner.userId, {
      "tracking.tasks": ["read"],
    });
    await prisma.constructionOrganizationTeamMemberProject.create({
      data: { memberId: reader.memberId, projectId: ctx.projectId },
    });
    actAs({
      userId: reader.userId,
      workspaceId: ctx.workspaceId,
      role: "member",
    });
    const forbidden = await importRoute(
      upload(`${BASE}/import?projectId=${ctx.projectId}`, bytes),
    );
    expect(forbidden.status).toBe(StatusCodes.FORBIDDEN);
  });

  it("refuses a file that is not the sample", async () => {
    const ctx = await setup();
    const response = await importRoute(
      upload(
        `${BASE}/import?projectId=${ctx.projectId}`,
        new TextEncoder().encode("name,date"),
      ),
    );
    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    expect(((await response.json()) as ImportError).code).toBe(
      "IMPORT_FILE_INVALID",
    );
  });
});
