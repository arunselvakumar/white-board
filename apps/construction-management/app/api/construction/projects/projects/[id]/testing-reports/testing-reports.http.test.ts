import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { SEED_TESTING_ITEMS } from "@/src/projects/domain/project-seeds";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";
import { newId } from "@/src/shared-kernel/ids";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { bytesOf, pngBytes } from "@/test/files";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as deleteItem } from "./items/[itemId]/delete/route";
import {
  GET as listReports,
  POST as addReport,
} from "./items/[itemId]/reports/route";
import { POST as renameItem } from "./items/[itemId]/update/route";
import { GET as listItems, POST as addItem } from "./items/route";
import { POST as deleteReport } from "./reports/[reportId]/delete/route";
import { GET as getReportFile } from "./reports/[reportId]/file/route";
import { POST as updateReport } from "./reports/[reportId]/update/route";
import { POST as receiveUpload } from "./uploads/app/route";
import { POST as startUpload } from "./uploads/route";

type Company = { cookie: string; workspaceId: string; userId: string };

type Item = {
  id: string;
  name: string;
  isSeed: boolean;
  reportCount: number;
  updatedAt: string;
};

type Report = {
  id: string;
  itemId: string;
  name: string;
  reportDate: string;
  remark: string | null;
  fileName: string;
  contentType: string;
  url: string;
  updatedAt: string;
  createdByName: string | null;
};

type Page = {
  item: Item;
  items: Report[];
  nextCursor: string | null;
  prevCursor: string | null;
  total: number;
};

const PDF = new TextEncoder().encode("%PDF-1.7\nCube test\n%%EOF");
const EXE = Uint8Array.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0]);
const DWG = new TextEncoder().encode("AC1032\0\0\0\0\0\x01");

const storage = objectStorage();
const TODAY = todayIn("Asia/Kolkata");

function base(projectId: string): string {
  return `${TEST_ORIGIN}/api/construction/projects/projects/${projectId}/testing-reports`;
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function itemParams(id: string, itemId: string) {
  return { params: Promise.resolve({ id, itemId }) };
}

function reportParams(id: string, reportId: string) {
  return { params: Promise.resolve({ id, reportId }) };
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function codeOf(response: Response): Promise<string> {
  return (await json<{ code: string }>(response)).code;
}

/** The four seed items CM-401 gives every new Project, written directly. */
async function project(company: Company): Promise<string> {
  const projectId = await addProject(company.workspaceId, company.userId);
  const now = new Date();
  await prisma.constructionProjectsTestingItem.createMany({
    data: SEED_TESTING_ITEMS.map((name) => ({
      id: newId(),
      workspaceId: company.workspaceId,
      projectId,
      name,
      isSeed: true,
      createdAt: now,
      updatedAt: now,
      createdBy: "system",
      updatedBy: "system",
    })),
    skipDuplicates: true,
  });
  return projectId;
}

async function items(cookie: string, projectId: string): Promise<Item[]> {
  const response = await listItems(
    jsonRequest(`${base(projectId)}/items`, cookie),
    params(projectId),
  );
  expect(response.status).toBe(StatusCodes.OK);
  return (await json<{ items: Item[] }>(response)).items;
}

async function itemNamed(
  cookie: string,
  projectId: string,
  name: string,
): Promise<Item> {
  const found = (await items(cookie, projectId)).find(
    (item) => item.name === name,
  );
  if (found == null) throw new Error(`No item ${name}`);
  return found;
}

function start(
  cookie: string,
  projectId: string,
  fileName: string,
  bytes: number,
) {
  return startUpload(
    jsonRequest(`${base(projectId)}/uploads`, cookie, { fileName, bytes }),
    params(projectId),
  );
}

/** Start and send the bytes; the key to finish with. */
async function sent(
  cookie: string,
  projectId: string,
  fileName: string,
  bytes: Uint8Array,
): Promise<string> {
  const response = await start(cookie, projectId, fileName, bytes.byteLength);
  expect(response.status).toBe(StatusCodes.CREATED);
  const started = await json<{
    key: string;
    upload: { via: "app"; url: string } | { via: "blob" };
  }>(response);
  if (started.upload.via !== "app") throw new Error("Expected an app upload");
  const received = await receiveUpload(
    new Request(`${TEST_ORIGIN}${started.upload.url}`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream", cookie },
      body: Uint8Array.from(bytes),
    }),
    params(projectId),
  );
  expect(received.status).toBe(StatusCodes.NO_CONTENT);
  return started.key;
}

function add(
  cookie: string,
  projectId: string,
  itemId: string,
  body: {
    name: string;
    reportDate: string;
    remark?: string | null;
    key: string;
    fileName: string;
  },
) {
  return addReport(
    jsonRequest(`${base(projectId)}/items/${itemId}/reports`, cookie, body),
    itemParams(projectId, itemId),
  );
}

async function report(
  company: { cookie: string },
  projectId: string,
  itemId: string,
  name: string,
  reportDate: string,
  bytes: Uint8Array = PDF,
  fileName = `${name}.pdf`,
): Promise<Report> {
  const key = await sent(company.cookie, projectId, fileName, bytes);
  const response = await add(company.cookie, projectId, itemId, {
    name,
    reportDate,
    key,
    fileName,
  });
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<Report>(response);
}

async function page(
  cookie: string,
  projectId: string,
  itemId: string,
  query = "",
): Promise<Page> {
  const response = await listReports(
    jsonRequest(`${base(projectId)}/items/${itemId}/reports${query}`, cookie),
    itemParams(projectId, itemId),
  );
  expect(response.status).toBe(StatusCodes.OK);
  return json<Page>(response);
}

/** Tests that sign in several Team Members take longer under load. */
const MANY_MEMBERS_MS = 20_000;

describe("Testing Reports HTTP (CM-409)", () => {
  it("lists the seed items, adds, renames and deletes items", async () => {
    const owner = await ownerWithCompany();
    const projectId = await project(owner);
    expect(
      (await items(owner.cookie, projectId)).map((item) => [
        item.name,
        item.isSeed,
        item.reportCount,
      ]),
    ).toEqual([
      ["Bricks", true, 0],
      ["Cement", true, 0],
      ["Rcc cube", true, 0],
      ["Steel", true, 0],
    ]);

    const created = await addItem(
      jsonRequest(`${base(projectId)}/items`, owner.cookie, {
        name: " Fly  ash bricks ",
      }),
      params(projectId),
    );
    expect(created.status).toBe(StatusCodes.CREATED);
    const flyAsh = await json<Item>(created);
    expect(flyAsh.name).toBe("Fly ash bricks");
    const duplicate = await addItem(
      jsonRequest(`${base(projectId)}/items`, owner.cookie, { name: "STEEL" }),
      params(projectId),
    );
    expect(await codeOf(duplicate)).toBe("TESTING_ITEM_NAME_IN_USE");

    const rename = (name: string, updatedAt: string) =>
      renameItem(
        jsonRequest(
          `${base(projectId)}/items/${flyAsh.id}/update`,
          owner.cookie,
          { name, updatedAt },
        ),
        itemParams(projectId, flyAsh.id),
      );
    const renamed = await rename("Aggregates", flyAsh.updatedAt);
    expect((await json<Item>(renamed)).name).toBe("Aggregates");
    expect(await codeOf(await rename("Sand", flyAsh.updatedAt))).toBe(
      "TESTING_ITEM_CHANGED",
    );

    // An item with reports cannot be deleted.
    const cube = await itemNamed(owner.cookie, projectId, "Rcc cube");
    const first = await report(owner, projectId, cube.id, "7-day cube", TODAY);
    const refused = await deleteItem(
      jsonRequest(
        `${base(projectId)}/items/${cube.id}/delete`,
        owner.cookie,
        {},
      ),
      itemParams(projectId, cube.id),
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(refused)).toBe("TESTING_ITEM_NOT_EMPTY");
    await deleteReport(
      jsonRequest(
        `${base(projectId)}/reports/${first.id}/delete`,
        owner.cookie,
        {},
      ),
      reportParams(projectId, first.id),
    );
    const allowed = await deleteItem(
      jsonRequest(
        `${base(projectId)}/items/${cube.id}/delete`,
        owner.cookie,
        {},
      ),
      itemParams(projectId, cube.id),
    );
    expect(allowed.status).toBe(StatusCodes.NO_CONTENT);
    expect(
      (await items(owner.cookie, projectId)).map((item) => item.name),
    ).toEqual(["Aggregates", "Bricks", "Cement", "Steel"]);
  });

  it("adds reports with one file each, newest report date first, searched and paged", async () => {
    const owner = await ownerWithCompany();
    const projectId = await project(owner);
    const cube = await itemNamed(owner.cookie, projectId, "Rcc cube");
    const old = await report(
      owner,
      projectId,
      cube.id,
      "7-day cube M25",
      addDays(TODAY, -21),
    );
    const mid = await report(
      owner,
      projectId,
      cube.id,
      "28-day cube M25",
      addDays(TODAY, -1),
      pngBytes(),
      "28 day.png",
    );
    const sameDay = await report(
      owner,
      projectId,
      cube.id,
      "28-day cube M30",
      addDays(TODAY, -1),
    );
    expect(mid).toMatchObject({
      contentType: "image/png",
      remark: null,
      createdByName: "Arun Selva Kumar",
    });

    const all = await page(owner.cookie, projectId, cube.id);
    expect(all.items.map((item) => item.id)).toEqual([
      sameDay.id,
      mid.id,
      old.id,
    ]);
    expect(all).toMatchObject({
      total: 3,
      nextCursor: null,
      prevCursor: null,
      item: { reportCount: 3 },
    });

    const searched = await page(owner.cookie, projectId, cube.id, "?q=m25");
    expect(searched.items.map((item) => item.name)).toEqual([
      "28-day cube M25",
      "7-day cube M25",
    ]);
    expect(searched.total).toBe(2);
    expect(searched.item.reportCount).toBe(3);

    const one = await page(owner.cookie, projectId, cube.id, "?limit=1");
    expect(one.items.map((item) => item.id)).toEqual([sameDay.id]);
    expect(one.total).toBe(3);
    if (one.nextCursor == null) throw new Error("Expected a next page");
    const two = await page(
      owner.cookie,
      projectId,
      cube.id,
      `?limit=1&after=${one.nextCursor}`,
    );
    expect(two.items.map((item) => item.id)).toEqual([mid.id]);
    if (two.prevCursor == null) throw new Error("Expected a previous page");
    const back = await page(
      owner.cookie,
      projectId,
      cube.id,
      `?limit=1&before=${two.prevCursor}`,
    );
    expect(back.items.map((item) => item.id)).toEqual([sameDay.id]);

    const shown = await getReportFile(
      jsonRequest(`${TEST_ORIGIN}${old.url}`, owner.cookie),
      reportParams(projectId, old.id),
    );
    expect(shown.headers.get("content-type")).toBe("application/pdf");
    expect(shown.headers.get("content-disposition")).toMatch(/^inline;/);
    expect(await bytesOf(shown)).toEqual(PDF);

    const media = await prisma.constructionProjectsMediaItem.findMany({
      where: { projectId, source: "testing_report", deletedAt: null },
    });
    expect(media.map((item) => item.sourceId).sort()).toEqual(
      [old.id, mid.id, sameDay.id].sort(),
    );
  });

  it("needs a name, a date and a PDF or image; refuses programs and other files", async () => {
    const owner = await ownerWithCompany();
    const projectId = await project(owner);
    const steel = await itemNamed(owner.cookie, projectId, "Steel");
    for (const fileName of ["report.docx", "setup.exe", "plan.dwg"]) {
      const refused = await start(owner.cookie, projectId, fileName, 10);
      expect(await codeOf(refused), fileName).toBe("FILE_TYPE_NOT_ALLOWED");
    }
    expect(
      await codeOf(
        await start(owner.cookie, projectId, "big.pdf", 25 * 1024 * 1024 + 1),
      ),
    ).toBe("FILE_TOO_LARGE");

    for (const bytes of [EXE, DWG]) {
      const key = await sent(owner.cookie, projectId, "mtc.pdf", bytes);
      const refused = await add(owner.cookie, projectId, steel.id, {
        name: "MTC",
        reportDate: TODAY,
        key,
        fileName: "mtc.pdf",
      });
      expect(await codeOf(refused)).toBe("FILE_TYPE_NOT_ALLOWED");
      await expect(storage.head(key)).resolves.toBeNull();
    }

    const key = await sent(owner.cookie, projectId, "mtc.pdf", PDF);
    const noName = await add(owner.cookie, projectId, steel.id, {
      name: " ",
      reportDate: TODAY,
      key,
      fileName: "mtc.pdf",
    });
    expect(await codeOf(noName)).toBe("TESTING_REPORT_NAME_REQUIRED");
    const badDate = await add(owner.cookie, projectId, steel.id, {
      name: "MTC",
      reportDate: "2026-02-30",
      key,
      fileName: "mtc.pdf",
    });
    expect(await codeOf(badDate)).toBe("TESTING_REPORT_DATE_INVALID");
    const created = await add(owner.cookie, projectId, steel.id, {
      name: "MTC Fe500D",
      reportDate: TODAY,
      remark: "  Batch 4471, 12 mm  ",
      key,
      fileName: "mtc.pdf",
    });
    expect(created.status).toBe(StatusCodes.CREATED);
    const mtc = await json<Report>(created);
    expect(mtc.remark).toBe("Batch 4471, 12 mm");
    // A retried completion returns the same report.
    const retried = await add(owner.cookie, projectId, steel.id, {
      name: "MTC Fe500D",
      reportDate: TODAY,
      key,
      fileName: "mtc.pdf",
    });
    expect(retried.status).toBe(StatusCodes.OK);
    expect((await json<Report>(retried)).id).toBe(mtc.id);
  });

  it("edits a report, replaces its file and deletes it", async () => {
    const owner = await ownerWithCompany();
    const projectId = await project(owner);
    const cement = await itemNamed(owner.cookie, projectId, "Cement");
    const original = await report(owner, projectId, cement.id, "OPC 53", TODAY);
    const oldKey = (
      await prisma.constructionProjectsTestingReport.findUniqueOrThrow({
        where: { id: original.id },
      })
    ).fileKey;

    const edit = (body: Record<string, unknown>) =>
      updateReport(
        jsonRequest(
          `${base(projectId)}/reports/${original.id}/update`,
          owner.cookie,
          body,
        ),
        reportParams(projectId, original.id),
      );
    const edited = await edit({
      name: "OPC 53 grade",
      reportDate: addDays(TODAY, -2),
      remark: "Setting time ok",
      updatedAt: original.updatedAt,
    });
    expect(edited.status).toBe(StatusCodes.OK);
    const afterEdit = await json<Report>(edited);
    expect(afterEdit).toMatchObject({
      name: "OPC 53 grade",
      reportDate: addDays(TODAY, -2),
      remark: "Setting time ok",
      fileName: "OPC 53.pdf",
    });
    const stale = await edit({
      name: "x",
      reportDate: TODAY,
      updatedAt: original.updatedAt,
    });
    expect(await codeOf(stale)).toBe("TESTING_REPORT_CHANGED");

    const newKey = await sent(
      owner.cookie,
      projectId,
      "OPC scan.png",
      pngBytes(),
    );
    const replaced = await edit({
      name: "OPC 53 grade",
      reportDate: addDays(TODAY, -2),
      remark: null,
      updatedAt: afterEdit.updatedAt,
      file: { key: newKey, fileName: "OPC scan.png" },
    });
    expect(replaced.status).toBe(StatusCodes.OK);
    expect(await json<Report>(replaced)).toMatchObject({
      fileName: "OPC scan.png",
      contentType: "image/png",
      remark: null,
    });
    await expect(storage.head(oldKey)).resolves.toBeNull();
    const media = await prisma.constructionProjectsMediaItem.findMany({
      where: { sourceId: original.id },
      orderBy: { uploadedAt: "asc" },
    });
    expect(media.map((item) => [item.fileKey, item.deletedAt == null])).toEqual(
      [
        [oldKey, false],
        [newKey, true],
      ],
    );
    expect(
      await prisma.constructionOrganizationStoredFile.findMany({
        where: { key: { in: [oldKey, newKey] } },
        select: { key: true, deletedAt: true },
        orderBy: { createdAt: "asc" },
      }),
    ).toMatchObject([
      { key: oldKey, deletedAt: expect.any(Date) as Date },
      { key: newKey, deletedAt: null },
    ]);

    const deleted = await deleteReport(
      jsonRequest(
        `${base(projectId)}/reports/${original.id}/delete`,
        owner.cookie,
        {},
      ),
      reportParams(projectId, original.id),
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    expect((await page(owner.cookie, projectId, cement.id)).total).toBe(0);
    expect(
      await prisma.constructionProjectsMediaItem.count({
        where: { sourceId: original.id, deletedAt: null },
      }),
    ).toBe(0);
    await expect(storage.head(newKey)).resolves.toBeNull();
    const audits = await prisma.constructionOrganizationAuditEvent.findMany({
      where: { entityId: original.id },
      orderBy: { occurredAt: "asc" },
    });
    expect(audits.map((audit) => audit.action)).toEqual([
      "testing_report.created",
      "testing_report.updated",
      "testing_report.updated",
      "testing_report.deleted",
    ]);
  });

  it(
    "applies the back-dated policy for Material Testing Report",
    async () => {
      const owner = await ownerWithCompany();
      const projectId = await project(owner);
      const bricks = await itemNamed(owner.cookie, projectId, "Bricks");
      const member = await memberWith(owner, {
        "projects.testing_reports": ["read", "create", "update", "delete"],
      });
      await prisma.constructionOrganizationTeamMemberProject.create({
        data: { memberId: member.memberId, projectId },
      });
      await prisma.constructionOrganizationBackdatedEntryPolicy.create({
        data: {
          id: newId(),
          workspaceId: owner.workspaceId,
          createDays: 0,
          createOverrideDesignationIds: [],
          editDays: 0,
          editOverrideDesignationIds: [],
          modules: {
            material_testing_report: {
              mode: "custom",
              create: { days: 3, overrideDesignationIds: [] },
              edit: { days: 3, overrideDesignationIds: [] },
            },
          },
          createdBy: owner.userId,
          updatedBy: owner.userId,
        },
      });

      const key = await sent(member.cookie, projectId, "bricks.pdf", PDF);
      const refused = await add(member.cookie, projectId, bricks.id, {
        name: "Compressive strength",
        reportDate: addDays(TODAY, -10),
        key,
        fileName: "bricks.pdf",
      });
      expect(refused.status).toBe(StatusCodes.FORBIDDEN);
      expect(await codeOf(refused)).toBe("BACKDATED_CREATE_BLOCKED");
      // The refused file is not kept.
      await expect(storage.head(key)).resolves.toBeNull();

      const recent = await report(
        member,
        projectId,
        bricks.id,
        "Water absorption",
        addDays(TODAY, -2),
      );
      const tooOld = await updateReport(
        jsonRequest(
          `${base(projectId)}/reports/${recent.id}/update`,
          member.cookie,
          {
            name: "Water absorption",
            reportDate: addDays(TODAY, -10),
            updatedAt: recent.updatedAt,
          },
        ),
        reportParams(projectId, recent.id),
      );
      expect(await codeOf(tooOld)).toBe("BACKDATED_EDIT_BLOCKED");

      // The Owner passes every day limit.
      const ownerOld = await report(
        owner,
        projectId,
        bricks.id,
        "Efflorescence",
        addDays(TODAY, -30),
      );
      const memberDelete = await deleteReport(
        jsonRequest(
          `${base(projectId)}/reports/${ownerOld.id}/delete`,
          member.cookie,
          {},
        ),
        reportParams(projectId, ownerOld.id),
      );
      expect(await codeOf(memberDelete)).toBe("BACKDATED_EDIT_BLOCKED");
    },
    MANY_MEMBERS_MS,
  );

  it(
    "follows projects.testing_reports flags and Project visibility",
    async () => {
      const owner = await ownerWithCompany();
      const tower = await project(owner);
      const villas = await project(owner);
      const cube = await itemNamed(owner.cookie, tower, "Rcc cube");
      const cubeReport = await report(owner, tower, cube.id, "Cube", TODAY);
      const assign = (memberId: string, projectIds: string[]) =>
        prisma.constructionOrganizationTeamMemberProject.createMany({
          data: projectIds.map((projectId) => ({ memberId, projectId })),
        });

      const outsider = await memberWith(owner, {
        "projects.project": ["read"],
      });
      await assign(outsider.memberId, [tower]);
      for (const response of [
        await listItems(
          jsonRequest(`${base(tower)}/items`, outsider.cookie),
          params(tower),
        ),
        await getReportFile(
          jsonRequest(`${TEST_ORIGIN}${cubeReport.url}`, outsider.cookie),
          reportParams(tower, cubeReport.id),
        ),
      ])
        expect(response.status).toBe(StatusCodes.FORBIDDEN);

      const reader = await memberWith(owner, {
        "projects.testing_reports": ["read"],
      });
      await assign(reader.memberId, [tower]);
      expect((await page(reader.cookie, tower, cube.id)).total).toBe(1);
      for (const response of [
        await addItem(
          jsonRequest(`${base(tower)}/items`, reader.cookie, { name: "Sand" }),
          params(tower),
        ),
        await start(reader.cookie, tower, "a.pdf", 5),
        await deleteReport(
          jsonRequest(
            `${base(tower)}/reports/${cubeReport.id}/delete`,
            reader.cookie,
            {},
          ),
          reportParams(tower, cubeReport.id),
        ),
      ])
        expect(response.status).toBe(StatusCodes.FORBIDDEN);

      const elsewhere = await memberWith(owner, {
        "projects.testing_reports": ["read", "create"],
      });
      await assign(elsewhere.memberId, [villas]);
      const hidden = await listItems(
        jsonRequest(`${base(tower)}/items`, elsewhere.cookie),
        params(tower),
      );
      expect(hidden.status).toBe(StatusCodes.NOT_FOUND);
      expect(await codeOf(hidden)).toBe("PROJECT_NOT_FOUND");

      const rival = await ownerWithCompany("Sakthi Constructions");
      const other = await listReports(
        jsonRequest(`${base(tower)}/items/${cube.id}/reports`, rival.cookie),
        itemParams(tower, cube.id),
      );
      expect(other.status).toBe(StatusCodes.NOT_FOUND);
    },
    MANY_MEMBERS_MS,
  );

  it("is listed in OpenAPI", async () => {
    const document = await json<{
      paths: Record<string, Record<string, unknown>>;
    }>(getOpenApi());
    const item = "/api/construction/projects/projects/{id}/testing-reports";
    for (const [path, method] of [
      [`${item}/items`, "get"],
      [`${item}/items`, "post"],
      [`${item}/items/{itemId}/update`, "post"],
      [`${item}/items/{itemId}/delete`, "post"],
      [`${item}/items/{itemId}/reports`, "get"],
      [`${item}/items/{itemId}/reports`, "post"],
      [`${item}/uploads`, "post"],
      [`${item}/uploads/presign`, "post"],
      [`${item}/uploads/app`, "post"],
      [`${item}/uploads/thumbnail`, "post"],
      [`${item}/reports/{reportId}`, "get"],
      [`${item}/reports/{reportId}/update`, "post"],
      [`${item}/reports/{reportId}/delete`, "post"],
      [`${item}/reports/{reportId}/file`, "get"],
      [`${item}/reports/{reportId}/thumbnail`, "get"],
    ] as const)
      expect(document.paths[path]?.[method], `${method} ${path}`).toBeDefined();
  });
});
