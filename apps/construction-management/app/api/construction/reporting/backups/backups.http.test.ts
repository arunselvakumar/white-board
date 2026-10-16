import { randomUUID } from "node:crypto";

import { outbox } from "@repo/auth/construction/testing";
import { prisma } from "@repo/construction-db";
import { unzipSync } from "fflate";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as listDownloads } from "@/app/api/construction/reporting/downloads/route";
import type { ListConstructionReportingDownloadsResponseModel as DownloadsPage } from "@/app/api/construction/reporting/downloads/download-models";
import {
  backupLinkSecret,
  BACKUPS_PATH,
  createBackupJobs,
} from "@/src/composition/backup-jobs";
import { missingBackupReaders } from "@/src/composition/backup-sources";
import { DAILY_JOB_TYPES, drainQueue, enqueue } from "@/src/composition/queue";
import { BACKUP_RETENTION_JOB_TYPE } from "@/src/reporting/application/backup-queue";
import {
  BACKUP_TOO_LARGE_MESSAGE,
  MY_DATA_MODULE,
} from "@/src/reporting/domain/backup-job";
import { signedBackupPath } from "@/src/reporting/domain/backup-link";
import { backupModule } from "@/src/reporting/domain/backup-modules";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";
import { storedBytes } from "@/src/shared-kernel/files/stored-files";
import { newId } from "@/src/shared-kernel/ids";
import { codeFor } from "@/test/accounts";
import {
  addProject,
  givePlan,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { pngBytes } from "@/test/files";
import { TEST_ORIGIN } from "@/test/sessions";
import {
  reportsEquipment,
  reportsUsageSheet,
  reportsWorksheet,
  sharedAssign,
  worksheetContractor,
  worksheetDepartment,
} from "@/test/site-work";

import type {
  ConstructionReportingBackupResponseModel as Backup,
  ListConstructionReportingBackupOptionsResponseModel as Options,
  ListConstructionReportingBackupsResponseModel as BackupsPage,
} from "./backup-models";
import { GET as getBackup } from "./[id]/route";
import { POST as deleteBackup } from "./[id]/delete/route";
import { GET as downloadBackup } from "./[id]/download/route";
import { GET as backupOptions } from "./options/route";
import { GET as listBackups, POST as requestBackup } from "./route";

const BASE = `${TEST_ORIGIN}${BACKUPS_PATH}`;
const DAY_MS = 86_400_000;

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function ask(cookie: string, body: unknown): Promise<Response> {
  return requestBackup(jsonRequest(BASE, cookie, body));
}

async function done(cookie: string, body: unknown): Promise<Backup> {
  const response = await ask(cookie, body);
  expect(response.status).toBe(StatusCodes.CREATED);
  const backup = await json<Backup>(response);
  expect(backup.error).toBeNull();
  expect(backup.status).toBe("done");
  return backup;
}

function download(cookie: string, href: string): Promise<Response> {
  const url = new URL(`${TEST_ORIGIN}${href}`);
  const id = url.pathname.split("/").at(-2) ?? "";
  return downloadBackup(jsonRequest(url.toString(), cookie), {
    params: Promise.resolve({ id }),
  });
}

async function zipOf(cookie: string, backup: Backup): Promise<Record<string, string | Uint8Array>> {
  expect(backup.downloadHref).not.toBeNull();
  const response = await download(cookie, backup.downloadHref ?? "");
  expect(response.status).toBe(StatusCodes.OK);
  expect(response.headers.get("content-type")).toBe("application/zip");
  const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
  return Object.fromEntries(
    Object.entries(files).map(([path, bytes]) => [
      path,
      /\.(csv|json)$/.test(path) ? new TextDecoder().decode(bytes) : bytes,
    ]),
  );
}

function text(files: Record<string, string | Uint8Array>, path: string): string {
  const value = files[path];
  if (typeof value !== "string") throw new Error(`No text file ${path}`);
  return value;
}

function csvLines(files: Record<string, string | Uint8Array>, path: string): string[] {
  return text(files, path).replace(/^\uFEFF/, "").trimEnd().split("\r\n");
}

/** A Project with a Contractor and a Department for worksheets. */
async function siteOf(company: Company) {
  const projectId = await addProject(company.workspaceId, company.userId, "Tower A");
  const departmentId = await worksheetDepartment(company.workspaceId, company.userId, {
    name: "Masonry",
  });
  const contractorId = await worksheetContractor(company.workspaceId, company.userId, {
    name: "Velan Constructions",
    projectIds: [projectId],
    departmentIds: [departmentId],
  });
  return { projectId, departmentId, contractorId };
}

/** A worksheet photo stored for real, as the document thread stores one. */
async function attachPhoto(company: Company, worksheetId: string): Promise<string> {
  const key = `companies/${company.workspaceId}/site-work/${randomUUID()}.png`;
  await objectStorage().put(key, pngBytes(), "image/png");
  await prisma.constructionSiteWorkDocumentFile.create({
    data: {
      id: randomUUID(),
      workspaceId: company.workspaceId,
      documentType: "worksheet",
      documentId: worksheetId,
      fileKey: key,
      fileName: "slab-pour.png",
      contentType: "image/png",
      bytes: 64,
      createdBy: company.userId,
    },
  });
  return key;
}

async function rentedSheet(
  company: Company,
  projectId: string,
  hirePartyId: string,
) {
  const equipment = await reportsEquipment(company.workspaceId, company.userId, {
    name: "JCB 3DX",
    projectId,
    placedOn: "2026-09-01",
    ownership: "rented",
    hirePartyId,
    hireBasis: "hourly",
    hireRate: 150_000n,
  });
  return reportsUsageSheet(company.workspaceId, company.userId, {
    equipmentId: equipment.id,
    projectId,
    sheetDate: "2026-09-10",
    ownership: "rented",
    usageHours: "8",
    unitRate: 150_000n,
    billableQty: "8",
    hireCost: 1_200_050n,
  });
}

async function notificationsOf(userId: string, type: string) {
  return prisma.constructionMessagingNotification.findMany({
    where: { recipientUserId: userId, type },
  });
}

describe("backups: Project scope (CM-906)", () => {
  it("needs Project View and View on every chosen module; 403 names the module", async () => {
    const owner = await ownerWithCompany();
    const { projectId } = await siteOf(owner);
    const member = await memberWith(owner, {
      "projects.project": ["read"],
      "site_work.daily_worksheet": ["read"],
    });
    await sharedAssign(member.memberId, projectId);
    const refused = await ask(member.cookie, {
      scope: "project",
      projectId,
      modules: ["site_work.daily_worksheet", "site_work.equipment_usage"],
    });
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    const body = await json<{ code: string; message: string; details: unknown }>(refused);
    expect(body.code).toBe("PERMISSION_DENIED");
    expect(body.message).toContain("Equipment Usage");
    expect(body.details).toEqual({ module: "site_work.equipment_usage" });

    const noProject = await memberWith(owner, { "site_work.daily_worksheet": ["read"] });
    await sharedAssign(noProject.memberId, projectId);
    const withoutProject = await ask(noProject.cookie, {
      scope: "project",
      projectId,
      modules: ["site_work.daily_worksheet"],
    });
    expect(withoutProject.status).toBe(StatusCodes.FORBIDDEN);

    // Not on the Project: the Project-level menus do not apply.
    const elsewhere = await memberWith(owner, {
      "projects.project": ["read"],
      "site_work.daily_worksheet": ["read"],
    });
    expect(
      (await ask(elsewhere.cookie, {
        scope: "project",
        projectId,
        modules: ["site_work.daily_worksheet"],
      })).status,
    ).toBe(StatusCodes.FORBIDDEN);

    // The options offer only what may be backed up.
    const options = await json<Options>(
      await backupOptions(
        jsonRequest(`${BASE}/options?scope=project&projectId=${projectId}`, member.cookie),
      ),
    );
    expect(options.modules.map((module) => module.key)).toEqual([
      "projects.project",
      "site_work.daily_worksheet",
    ]);

    const unknown = await ask(owner.cookie, {
      scope: "project",
      projectId,
      modules: ["masters.contractors"],
    });
    expect(unknown.status).toBe(StatusCodes.BAD_REQUEST);
    const missing = await ask(owner.cookie, {
      scope: "project",
      projectId: randomUUID(),
      modules: ["site_work.daily_worksheet"],
    });
    expect(missing.status).toBe(StatusCodes.NOT_FOUND);
    const nothing = await ask(owner.cookie, {
      scope: "project",
      projectId,
      modules: ["site_work.daily_worksheet"],
      includeData: false,
      includeMedia: false,
    });
    expect(nothing.status).toBe(StatusCodes.BAD_REQUEST);
  });

  it("writes the manifest, CSV with the screens' labels, JSON, media, and leaves tombstoned and out-of-range rows out", async () => {
    const owner = await ownerWithCompany("Backup Builders");
    const site = await siteOf(owner);
    const live = await reportsWorksheet(owner.workspaceId, owner.userId, {
      projectId: site.projectId,
      sheetDate: "2026-09-12",
      contractorId: site.contractorId,
      departmentId: site.departmentId,
      skilled: 4,
      unskilled: 6,
      remark: "Slab, first floor",
      materials: [{ name: "Cement OPC 53", unit: "Bag", quantity: "12" }],
    });
    const gone = await reportsWorksheet(owner.workspaceId, owner.userId, {
      projectId: site.projectId,
      sheetDate: "2026-09-13",
      contractorId: site.contractorId,
      departmentId: site.departmentId,
      deleted: true,
    });
    const early = await reportsWorksheet(owner.workspaceId, owner.userId, {
      projectId: site.projectId,
      sheetDate: "2026-08-01",
      contractorId: site.contractorId,
      departmentId: site.departmentId,
    });
    await attachPhoto(owner, live.id);
    await attachPhoto(owner, gone.id);

    const backup = await done(owner.cookie, {
      scope: "project",
      projectId: site.projectId,
      modules: ["site_work.daily_worksheet", "tracking.issues"],
      from: "2026-09-01",
      to: "2026-09-30",
      includeData: true,
      includeMedia: true,
    });
    expect(backup).toMatchObject({
      scope: "project",
      title: "Project backup",
      projectName: "Tower A",
      partsDone: 2,
      partsTotal: 2,
    });
    expect(backup.fileName).toMatch(/^project-backup-\d{4}-\d{2}-\d{2}\.zip$/);
    expect(new Date(backup.expiresAt ?? "").getTime()).toBeGreaterThan(
      Date.now() + 6.9 * DAY_MS,
    );

    const files = await zipOf(owner.cookie, backup);
    const manifest = JSON.parse(text(files, "manifest.json")) as {
      company: { name: string };
      project: { name: string };
      range: { from: string; to: string };
      requestedBy: { userId: string };
      modules: { key: string; entities: { entity: string; rows: number }[]; mediaFiles: number }[];
    };
    expect(manifest.company.name).toBe("Backup Builders");
    expect(manifest.project.name).toBe("Tower A");
    expect(manifest.range).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(manifest.requestedBy.userId).toBe(owner.userId);
    expect(manifest.modules.map((module) => module.key)).toEqual([
      "site_work.daily_worksheet",
      "tracking.issues",
    ]);
    expect(manifest.modules[0]?.entities).toEqual([
      { entity: "worksheets", rows: 1 },
      { entity: "worksheet_materials", rows: 1 },
    ]);
    expect(manifest.modules[0]?.mediaFiles).toBe(1);

    const sheets = csvLines(files, "daily-worksheets/worksheets.csv");
    expect(sheets[0]).toContain("Worksheet No.,Date,Shift,Contractor,Department");
    expect(sheets).toHaveLength(2);
    expect(sheets[1]).toContain(live.number);
    expect(sheets[1]).toContain("2026-09-12");
    expect(sheets[1]).toContain("Velan Constructions");
    expect(sheets[1]).toContain('"Slab, first floor"');
    const all = Object.values(files)
      .filter((value): value is string => typeof value === "string")
      .join("\n");
    expect(all).not.toContain(gone.number);
    expect(all).not.toContain(early.number);
    const json = JSON.parse(text(files, "daily-worksheets/worksheets.json")) as Record<string, unknown>[];
    expect(json).toHaveLength(1);
    expect(json[0]).toMatchObject({
      id: live.id,
      number: live.number,
      sheetDate: "2026-09-12",
      skilledCount: 4,
      contractor: "Velan Constructions",
    });
    expect(csvLines(files, "daily-worksheets/worksheet_materials.csv")[1]).toContain(
      "Cement OPC 53,Bag,12",
    );
    const media = Object.keys(files).filter((path) => path.startsWith("media/"));
    expect(media).toEqual([`media/daily-worksheets/${live.number.replace("/", "-")}/slab-pour.png`]);
    expect(files[media[0] ?? ""]).toEqual(pngBytes());
    expect(csvLines(files, "issues/issues.csv")).toHaveLength(1);

    // Without Media there are no files under media/.
    const dataOnly = await done(owner.cookie, {
      scope: "project",
      projectId: site.projectId,
      modules: ["site_work.daily_worksheet"],
    });
    const plain = await zipOf(owner.cookie, dataOnly);
    expect(Object.keys(plain).some((path) => path.startsWith("media/"))).toBe(false);

    // Backups never count as storage.
    const before = await storedBytes(prisma, owner.workspaceId);
    const rows = await prisma.constructionOrganizationStoredFile.findMany({
      where: { workspaceId: owner.workspaceId, kind: "backup", deletedAt: null },
    });
    expect(rows.length).toBe(2);
    expect(await storedBytes(prisma, owner.workspaceId)).toBe(before);
    expect(rows.reduce((sum, row) => sum + row.bytes, 0)).toBeGreaterThan(0);
  });

  it("leaves amounts out without the module's Financial flag", async () => {
    const owner = await ownerWithCompany();
    const { projectId, contractorId } = await siteOf(owner);
    await rentedSheet(owner, projectId, contractorId);
    const viewer = await memberWith(owner, {
      "projects.project": ["read"],
      "site_work.equipment_usage": ["read"],
    });
    const financial = await memberWith(owner, {
      "projects.project": ["read"],
      "site_work.equipment_usage": ["read", "financial"],
    });
    await sharedAssign(viewer.memberId, projectId);
    await sharedAssign(financial.memberId, projectId);
    const body = {
      scope: "project",
      projectId,
      modules: ["site_work.equipment_usage"],
    };

    const without = await done(viewer.cookie, body);
    expect(without.includesMoney).toBe(false);
    const plain = await zipOf(viewer.cookie, without);
    const header = csvLines(plain, "equipment-usage/equipment_usage_sheets.csv")[0];
    expect(header).toContain("Billable Qty");
    expect(header).not.toContain("Hire Cost");
    expect(text(plain, "equipment-usage/equipment_usage_sheets.json")).not.toContain("hireCost");

    const withMoney = await done(financial.cookie, body);
    expect(withMoney.includesMoney).toBe(true);
    const priced = await zipOf(financial.cookie, withMoney);
    const lines = csvLines(priced, "equipment-usage/equipment_usage_sheets.csv");
    expect(lines[0]).toContain("Unit Rate (₹),Hire Cost (₹)");
    expect(lines[1]).toContain("1500.00,12000.50");
  });

  it("tells the requester only, with the ZIP as the download, and keeps working after the plan has ended", async () => {
    const owner = await ownerWithCompany();
    const { projectId } = await siteOf(owner);
    const member = await memberWith(owner, {
      "projects.project": ["read"],
      "site_work.daily_worksheet": ["read", "notification"],
    });
    await sharedAssign(member.memberId, projectId);
    await givePlan(owner.workspaceId, { endsAt: new Date(Date.now() - DAY_MS) });

    const backup = await done(member.cookie, {
      scope: "project",
      projectId,
      modules: ["site_work.daily_worksheet"],
    });
    const mine = await notificationsOf(member.userId, "backup.ready");
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      workspaceId: owner.workspaceId,
      menu: null,
      title: "Your Project backup is ready",
      attachment: {
        kind: "backup",
        id: backup.id,
        downloads: [{ label: "ZIP", href: backup.downloadHref }],
      },
    });
    expect(await notificationsOf(owner.userId, "backup.ready")).toHaveLength(0);

    // Downloads lists it with its ZIP; another member's list does not.
    const page = await json<DownloadsPage>(
      await listDownloads(jsonRequest(`${TEST_ORIGIN}/api/construction/reporting/downloads`, member.cookie)),
    );
    const row = page.items.find((item) => item.id === backup.id);
    expect(row).toMatchObject({
      source: "backup",
      scope: "project",
      status: "done",
      files: [{ format: "zip", label: "ZIP", href: backup.downloadHref }],
      retryHref: null,
      deleteHref: `${BACKUPS_PATH}/${backup.id}/delete`,
    });
    const ownersPage = await json<DownloadsPage>(
      await listDownloads(jsonRequest(`${TEST_ORIGIN}/api/construction/reporting/downloads`, owner.cookie)),
    );
    expect(ownersPage.items.some((item) => item.id === backup.id)).toBe(false);
  });
});

describe("backups: master records (CM-906)", () => {
  it("needs View on each master", async () => {
    const owner = await ownerWithCompany();
    await worksheetContractor(owner.workspaceId, owner.userId, { name: "Ganesh Builders" });
    const member = await memberWith(owner, { "masters.contractors": ["read"] });
    const refused = await ask(member.cookie, {
      scope: "masters",
      modules: ["masters.contractors", "masters.suppliers"],
    });
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(refused)).toMatchObject({ details: { module: "masters.suppliers" } });

    const backup = await done(member.cookie, {
      scope: "masters",
      modules: ["masters.contractors"],
    });
    expect(backup).toMatchObject({ title: "Master records backup", detail: "1 module" });
    const files = await zipOf(member.cookie, backup);
    const lines = csvLines(files, "masters/contractors/contractors.csv");
    expect(lines[0]).toContain("ID,Contractor,Contact Person");
    expect(lines.join("\n")).toContain("Ganesh Builders");
  });
});

describe("backups: full Company (CM-906)", () => {
  it("is the Owner's alone and needs the company_backup code", async () => {
    const owner = await ownerWithCompany("Code Builders");
    const member = await memberWith(owner, { "masters.contractors": ["read"] });
    const forbidden = await ask(member.cookie, { scope: "company", code: "123456" });
    expect(forbidden.status).toBe(StatusCodes.FORBIDDEN);

    const missing = await ask(owner.cookie, { scope: "company" });
    expect(missing.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(missing)).toMatchObject({ code: "VALIDATION_ERROR" });

    const code = await codeFor(owner, "company_backup");
    const wrong = await ask(owner.cookie, {
      scope: "company",
      code: code === "111111" ? "222222" : "111111",
    });
    expect(wrong.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(wrong)).toMatchObject({ code: "ACTION_CODE_INVALID" });
    expect(
      await prisma.constructionReportingBackupJob.count({
        where: { workspaceId: owner.workspaceId, scope: "company" },
      }),
    ).toBe(0);

    // A code for another purpose does not do.
    const other = await codeFor(owner, "delete_company");
    expect((await ask(owner.cookie, { scope: "company", code: other })).status).toBe(
      StatusCodes.BAD_REQUEST,
    );
  });

  it("holds every module with amounts, and emails the Owner the link", async () => {
    const owner = await ownerWithCompany("Full Builders");
    const site = await siteOf(owner);
    await rentedSheet(owner, site.projectId, site.contractorId);
    const code = await codeFor(owner, "company_backup");
    const sentBefore = outbox.length;
    const backup = await done(owner.cookie, { scope: "company", code });
    expect(backup).toMatchObject({ title: "Full Company backup", includesMoney: true });
    expect(backup.modules.length).toBeGreaterThan(30);

    const files = await zipOf(owner.cookie, backup);
    const manifest = JSON.parse(text(files, "manifest.json")) as {
      modules: { key: string }[];
      project: unknown;
    };
    expect(manifest.project).toBeNull();
    expect(manifest.modules.map((module) => module.key)).toContain("company.settings");
    expect(csvLines(files, "company/company_profile.csv").join("\n")).toContain("Full Builders");
    expect(csvLines(files, "project/projects.csv").join("\n")).toContain("Tower A");
    expect(csvLines(files, "masters/contractors/contractors.csv").join("\n")).toContain(
      "Velan Constructions",
    );
    const sheets = csvLines(files, "equipment-usage/equipment_usage_sheets.csv");
    expect(sheets[0]).toContain("Hire Cost (₹)");
    expect(sheets[1]).toContain("12000.50");

    const mail = outbox.slice(sentBefore).find((sent) => sent.to === owner.email);
    expect(mail?.subject).toBe("Your full backup of Full Builders is ready");
    expect(mail?.text).toContain(`${BACKUPS_PATH}/${backup.id}/download?expires=`);
  });
});

describe("Download My Data (CM-906)", () => {
  it("holds the User's profile, Companies, devices, notifications and own audit events", async () => {
    const owner = await ownerWithCompany("Data Builders");
    const backup = await done(owner.cookie, { scope: "my_data" });
    expect(backup).toMatchObject({ scope: "my_data", title: "My data", projectId: null });
    const row = await prisma.constructionReportingBackupJob.findUniqueOrThrow({
      where: { id: backup.id },
    });
    expect(row.workspaceId).toBeNull();
    expect(row.modules).toEqual([]);

    const files = await zipOf(owner.cookie, backup);
    expect(csvLines(files, "my-data/profile.csv")[1]).toContain(owner.email);
    const companies = csvLines(files, "my-data/companies.csv");
    expect(companies[0]).toContain("Company,Role,Team Member ID,Name");
    expect(companies.join("\n")).toContain("Data Builders");
    expect(csvLines(files, "my-data/devices.csv")).toHaveLength(2);
    expect(text(files, "my-data/audit_events.json")).toContain("company.created");
    expect(Object.keys(files)).toContain("my-data/notifications.csv");
    const manifest = JSON.parse(text(files, "manifest.json")) as {
      company: unknown;
      modules: { key: string }[];
    };
    expect(manifest.company).toBeNull();
    expect(manifest.modules.map((module) => module.key)).toEqual([MY_DATA_MODULE]);

    const ready = await notificationsOf(owner.userId, "export.ready");
    expect(ready).toHaveLength(1);
    expect(ready[0]?.attachment).toMatchObject({ kind: "export", id: backup.id });

    // Listed with the User's own backups, in any Company.
    const list = await json<BackupsPage>(await listBackups(jsonRequest(BASE, owner.cookie)));
    expect(list.items.map((item) => item.id)).toContain(backup.id);
  });
});

describe("signed links (CM-906)", () => {
  it("open for the requester only, and refuse tampering, expiry and unfinished backups", async () => {
    const owner = await ownerWithCompany();
    const backup = await done(owner.cookie, {
      scope: "masters",
      modules: ["masters.tags"],
    });
    const href = backup.downloadHref ?? "";
    expect((await download(owner.cookie, href)).status).toBe(StatusCodes.OK);

    const tamperedSig = href.replace(/sig=([^&]+)/, (_, sig: string) => `sig=${sig.slice(0, -2)}AA`);
    const refused = await download(owner.cookie, tamperedSig);
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(refused)).toMatchObject({ code: "BACKUP_LINK_INVALID" });
    const later = href.replace(/expires=(\d+)/, (_, at: string) => `expires=${String(Number(at) + 86_400)}`);
    expect((await download(owner.cookie, later)).status).toBe(StatusCodes.FORBIDDEN);

    // Another User with the Owner's link.
    const member = await memberWith(owner, { "masters.tags": ["read"] });
    const notYours = await download(member.cookie, href);
    expect(notYours.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(notYours)).toMatchObject({ code: "BACKUP_LINK_INVALID" });
    // Nor is it theirs to read or delete.
    const params = { params: Promise.resolve({ id: backup.id }) };
    expect((await getBackup(jsonRequest(`${BASE}/${backup.id}`, member.cookie), params)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    expect(
      (await deleteBackup(jsonRequest(`${BASE}/${backup.id}/delete`, member.cookie, {}), params)).status,
    ).toBe(StatusCodes.NOT_FOUND);

    // A link signed with a passed expiry.
    const past = signedBackupPath(backupLinkSecret(), BACKUPS_PATH, {
      backupId: backup.id,
      requestedBy: owner.userId,
      expires: Math.floor(Date.now() / 1000) - 60,
    });
    const gone = await download(owner.cookie, past);
    expect(gone.status).toBe(StatusCodes.GONE);
    expect(await json(gone)).toMatchObject({ code: "BACKUP_LINK_EXPIRED" });

    // A backup still being made.
    const queuedId = newId();
    await prisma.constructionReportingBackupJob.create({
      data: {
        id: queuedId,
        workspaceId: owner.workspaceId,
        scope: "masters",
        modules: ["masters.tags"],
        requestedBy: owner.userId,
      },
    });
    const early = signedBackupPath(backupLinkSecret(), BACKUPS_PATH, {
      backupId: queuedId,
      requestedBy: owner.userId,
      expires: Math.floor(Date.now() / 1000) + 3600,
    });
    const notReady = await download(owner.cookie, early);
    expect(notReady.status).toBe(StatusCodes.CONFLICT);
    expect(await json(notReady)).toMatchObject({ code: "BACKUP_NOT_READY" });

    // The requester reads and deletes it; the link then stops working.
    const read = await getBackup(jsonRequest(`${BASE}/${backup.id}`, owner.cookie), params);
    expect(read.status).toBe(StatusCodes.OK);
    expect(
      (await deleteBackup(jsonRequest(`${BASE}/${backup.id}/delete`, owner.cookie, {}), params)).status,
    ).toBe(StatusCodes.NO_CONTENT);
    expect((await download(owner.cookie, href)).status).toBe(StatusCodes.NOT_FOUND);
  });
});

describe("backup limits and retention (CM-906)", () => {
  it("fails a backup over the size limit with the size message, and tells the requester", async () => {
    const owner = await ownerWithCompany();
    const { projectId, contractorId, departmentId } = await siteOf(owner);
    for (const date of ["2026-09-01", "2026-09-02", "2026-09-03"])
      await reportsWorksheet(owner.workspaceId, owner.userId, {
        projectId,
        sheetDate: date,
        contractorId,
        departmentId,
        remark: "x".repeat(400),
      });
    const small = createBackupJobs({ maxBytes: 600 });
    const worksheets = backupModule("site_work.daily_worksheet");
    if (worksheets == null) throw new Error("No worksheet module");
    const job = await small.request({
      workspaceId: owner.workspaceId,
      projectId,
      scope: "project",
      modules: [{ module: worksheets, money: false }],
      fromDate: null,
      toDate: null,
      includeData: true,
      includeMedia: false,
      requestedBy: owner.userId,
      notify: { workspaceId: owner.workspaceId, email: null },
    });
    expect(job).toMatchObject({ status: "failed", error: BACKUP_TOO_LARGE_MESSAGE });
    const failed = await notificationsOf(owner.userId, "backup.failed");
    expect(failed.map((row) => row.body)).toContain(BACKUP_TOO_LARGE_MESSAGE);
  });

  it("expires a backup after 7 days: file deleted, row expired, link gone", async () => {
    expect(DAILY_JOB_TYPES).toContain(BACKUP_RETENTION_JOB_TYPE);
    const owner = await ownerWithCompany();
    const backup = await done(owner.cookie, { scope: "masters", modules: ["masters.tags"] });
    const row = await prisma.constructionReportingBackupJob.findUniqueOrThrow({
      where: { id: backup.id },
    });
    const key = row.fileKey ?? "";
    expect(await objectStorage().head(key)).not.toBeNull();
    await prisma.constructionReportingBackupJob.update({
      where: { id: backup.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const id = await enqueue({
      type: BACKUP_RETENTION_JOB_TYPE,
      workspaceId: null,
      payload: { test: newId() },
      dedupeKey: `test:backup-retention:${newId()}`,
    });
    expect((await drainQueue({ ids: [id] })).failed).toBe(0);
    const after = await prisma.constructionReportingBackupJob.findUniqueOrThrow({
      where: { id: backup.id },
    });
    expect(after).toMatchObject({ status: "expired", fileKey: null });
    expect(await objectStorage().head(key)).toBeNull();
    const file = await prisma.constructionOrganizationStoredFile.findFirstOrThrow({ where: { key } });
    expect(file.deletedAt).not.toBeNull();
    const gone = await download(owner.cookie, backup.downloadHref ?? "");
    expect(gone.status).toBe(StatusCodes.GONE);
  });

  it("has a reader for every entity of the registry", () => {
    expect(missingBackupReaders()).toEqual([]);
  });

  it("refuses a fourth unfinished backup", async () => {
    const owner = await ownerWithCompany();
    for (let index = 0; index < 3; index += 1)
      await prisma.constructionReportingBackupJob.create({
        data: {
          id: newId(),
          workspaceId: owner.workspaceId,
          scope: "masters",
          modules: ["masters.tags"],
          requestedBy: owner.userId,
          status: "running",
        },
      });
    const refused = await ask(owner.cookie, { scope: "masters", modules: ["masters.tags"] });
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await json(refused)).toMatchObject({ code: "TOO_MANY_BACKUPS" });
  });
});
