import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { newId } from "@/src/shared-kernel/ids";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { bytesOf, pngBytes } from "@/test/files";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as activateVendor } from "./[id]/activate/route";
import { POST as deactivateVendor } from "./[id]/deactivate/route";
import { POST as deleteVendor } from "./[id]/delete/route";
import { POST as deleteDocument } from "./[id]/documents/[docId]/delete/route";
import { GET as getDocument } from "./[id]/documents/[docId]/route";
import {
  GET as listDocuments,
  POST as addDocument,
} from "./[id]/documents/route";
import { POST as removePhoto } from "./[id]/photo/remove/route";
import { GET as getPhoto, POST as setPhoto } from "./[id]/photo/route";
import { GET as getVendor } from "./[id]/route";
import { POST as updateVendor } from "./[id]/update/route";
import { GET as vendorOptions } from "./options/route";
import { GET as listVendors, POST as createVendor } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/labour/vendors`;

type Rate = {
  labourCategoryId: string;
  labourCategoryName: string | null;
  ratePerDay: number | null;
  overtimePerHour: number | null;
};

type Shift = {
  id: string;
  name: string;
  startTime: string | null;
  endTime: string | null;
  rates: Rate[];
};

type Vendor = {
  id: string;
  name: string;
  joiningDate: string;
  contactNumber: string | null;
  address: string | null;
  isActive: boolean;
  hasRateCard: boolean;
  projects: { id: string; name: string }[];
  shifts: Shift[];
  openingBalance: number | null;
  balance: number | null;
  updatedAt: string;
};

type Summary = {
  id: string;
  name: string;
  isActive: boolean;
  hasRateCard: boolean;
  shiftCount: number;
  projects: { id: string; name: string }[];
  balance: number | null;
};

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function seedProject(workspaceId: string, name: string) {
  const id = newId();
  await prisma.constructionProjectsProject.create({
    data: { id, workspaceId, name, createdBy: "test", updatedBy: "test" },
  });
  return id;
}

async function seedCategory(
  workspaceId: string,
  name: string,
  disabled = false,
) {
  const id = newId();
  await prisma.constructionMastersLabourCategory.create({
    data: {
      id,
      workspaceId,
      name: `${name} ${id.slice(-6)}`,
      disabledAt: disabled ? new Date() : null,
      createdBy: "test",
      updatedBy: "test",
    },
  });
  return id;
}

async function fixtures(company: Company) {
  const [tower, villa, mason, helper, welder] = await Promise.all([
    seedProject(company.workspaceId, "Tower A"),
    seedProject(company.workspaceId, "Villa Phase 2"),
    seedCategory(company.workspaceId, "Mason"),
    seedCategory(company.workspaceId, "Helper"),
    seedCategory(company.workspaceId, "Welder", true),
  ]);
  return { tower, villa, mason, helper, welder };
}

async function create(company: { cookie: string }, body: unknown) {
  return createVendor(jsonRequest(BASE, company.cookie, body));
}

function rateCard(mason: string, helper: string) {
  return [
    {
      name: "Shift 1",
      startTime: "08:00",
      endTime: "17:00",
      rates: [
        {
          labourCategoryId: mason,
          ratePerDay: 90_000,
          overtimePerHour: 12_000,
        },
        {
          labourCategoryId: helper,
          ratePerDay: 55_000,
          overtimePerHour: 7_000,
        },
      ],
    },
    {
      name: "Night",
      rates: [
        {
          labourCategoryId: mason,
          ratePerDay: 100_000,
          overtimePerHour: 15_000,
        },
      ],
    },
  ];
}

function upload(
  url: string,
  cookie: string,
  bytes: Uint8Array<ArrayBuffer>,
  type: string,
) {
  return new Request(url, {
    method: "POST",
    headers: { cookie, "content-type": type },
    body: bytes,
  });
}

async function ledger(workspaceId: string, vendorId: string) {
  return prisma.constructionLabourLedgerEntry.findMany({
    where: { workspaceId, partyType: "vendor", partyId: vendorId },
    orderBy: { createdAt: "asc" },
  });
}

describe("Vendors HTTP (CM-208, CM-209)", () => {
  it("adds a vendor with a rate card and posts the opening balance to the ledger", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const response = await create(company, {
      name: "  Muthu Gang ",
      joiningDate: "2026-04-01",
      contactNumber: "77081 65767",
      address: "Kottar, Nagercoil",
      projectIds: [f.villa, f.tower],
      shifts: rateCard(f.mason, f.helper),
      openingBalance: 2_500_000,
    });
    expect(response.status).toBe(StatusCodes.CREATED);
    const vendor = await json<Vendor>(response);
    expect(vendor).toMatchObject({
      name: "Muthu Gang",
      joiningDate: "2026-04-01",
      contactNumber: "+917708165767",
      isActive: true,
      hasRateCard: true,
      openingBalance: 2_500_000,
      balance: 2_500_000,
    });
    expect(vendor.projects.map((project) => project.name)).toEqual([
      "Tower A",
      "Villa Phase 2",
    ]);
    expect(vendor.shifts.map((shift) => shift.name)).toEqual([
      "Shift 1",
      "Night",
    ]);
    expect(vendor.shifts[0]?.rates[0]).toMatchObject({
      labourCategoryId: f.mason,
      ratePerDay: 90_000,
      overtimePerHour: 12_000,
    });
    expect(vendor.shifts[0]?.rates[0]?.labourCategoryName).toMatch(/^Mason/);

    const entries = await ledger(company.workspaceId, vendor.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "opening",
      amount: 2_500_000,
      sourceType: "vendor",
      sourceId: vendor.id,
      projectId: null,
    });
    expect(entries[0]?.entryDate.toISOString().slice(0, 10)).toBe("2026-04-01");

    const fetched = await getVendor(
      jsonRequest(`${BASE}/${vendor.id}`, company.cookie),
      params(vendor.id),
    );
    expect(fetched.status).toBe(StatusCodes.OK);
    expect((await json<Vendor>(fetched)).shifts).toEqual(vendor.shifts);
  });

  it("saves a vendor without a rate card and without an opening entry", async () => {
    const company = await ownerWithCompany();
    const response = await create(company, {
      name: "Sundar Gang",
      joiningDate: "2026-09-01",
    });
    expect(response.status).toBe(StatusCodes.CREATED);
    const vendor = await json<Vendor>(response);
    expect(vendor).toMatchObject({
      hasRateCard: false,
      shifts: [],
      projects: [],
      openingBalance: 0,
      balance: 0,
    });
    expect(await ledger(company.workspaceId, vendor.id)).toHaveLength(0);
  });

  it("refuses bad input with domain codes", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const attempt = async (patch: object) => {
      const response = await create(company, {
        name: "Gang",
        joiningDate: "2026-04-01",
        ...patch,
      });
      return {
        status: response.status,
        ...(await json<{ code: string }>(response)),
      };
    };
    expect(await attempt({ name: " " })).toMatchObject({
      status: StatusCodes.BAD_REQUEST,
      code: "VENDOR_NAME_REQUIRED",
    });
    expect(await attempt({ joiningDate: "2026-13-01" })).toMatchObject({
      code: "VENDOR_JOINING_DATE_INVALID",
    });
    expect(
      await attempt({
        shifts: [
          {
            name: "Shift 1",
            rates: [
              { labourCategoryId: f.mason, ratePerDay: 1, overtimePerHour: 1 },
              { labourCategoryId: f.mason, ratePerDay: 2, overtimePerHour: 2 },
            ],
          },
        ],
      }),
    ).toMatchObject({
      status: StatusCodes.BAD_REQUEST,
      code: "DUPLICATE_SHIFT_CATEGORY",
      details: { shiftIndex: 0, rateIndex: 1 },
    });
    expect(
      await attempt({ shifts: [{ name: "Shift 1", rates: [] }] }),
    ).toMatchObject({ code: "SHIFT_RATES_REQUIRED" });
    expect(await attempt({ projectIds: [newId()] })).toMatchObject({
      status: StatusCodes.BAD_REQUEST,
      code: "PROJECT_NOT_FOUND",
    });
    const shiftWith = (labourCategoryId: string) => [
      {
        name: "Shift 1",
        rates: [{ labourCategoryId, ratePerDay: 1, overtimePerHour: 1 }],
      },
    ];
    expect(await attempt({ shifts: shiftWith(newId()) })).toMatchObject({
      code: "LABOUR_CATEGORY_NOT_FOUND",
    });
    expect(await attempt({ shifts: shiftWith(f.welder) })).toMatchObject({
      code: "LABOUR_CATEGORY_DISABLED",
    });
  });

  it("updates details, projects and the whole rate card; a removed shift is soft-deleted", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const created = await json<Vendor>(
      await create(company, {
        name: "Muthu Gang",
        joiningDate: "2026-04-01",
        projectIds: [f.tower],
        shifts: rateCard(f.mason, f.helper),
        openingBalance: 100_000,
      }),
    );
    const [day, night] = created.shifts;
    if (day == null || night == null) throw new Error("no shifts");

    const response = await updateVendor(
      jsonRequest(`${BASE}/${created.id}/update`, company.cookie, {
        name: "Muthu Gang (Nagercoil)",
        joiningDate: "2026-04-02",
        projectIds: [f.villa],
        shifts: [
          {
            id: day.id,
            name: "Day",
            startTime: "09:00",
            endTime: "18:00",
            rates: [
              {
                labourCategoryId: f.mason,
                ratePerDay: 95_000,
                overtimePerHour: 13_000,
              },
            ],
          },
          {
            name: "Evening",
            rates: [
              {
                labourCategoryId: f.helper,
                ratePerDay: 60_000,
                overtimePerHour: 8_000,
              },
            ],
          },
        ],
        openingBalance: 150_000,
        expectedUpdatedAt: created.updatedAt,
      }),
      params(created.id),
    );
    expect(response.status).toBe(StatusCodes.OK);
    const updated = await json<Vendor>(response);
    expect(updated.name).toBe("Muthu Gang (Nagercoil)");
    expect(updated.projects.map((project) => project.id)).toEqual([f.villa]);
    expect(
      updated.shifts.map((shift) => [shift.name, shift.startTime]),
    ).toEqual([
      ["Day", "09:00"],
      ["Evening", null],
    ]);
    expect(updated.shifts[0]?.id).toBe(day.id);
    expect(updated.shifts[0]?.rates).toEqual([
      expect.objectContaining({
        labourCategoryId: f.mason,
        ratePerDay: 95_000,
      }),
    ]);
    expect(updated.openingBalance).toBe(150_000);
    expect(updated.balance).toBe(150_000);

    const removed = await prisma.constructionLabourVendorShift.findUnique({
      where: { id: night.id },
      include: { rates: true },
    });
    expect(removed?.deletedAt).not.toBeNull();
    expect(removed?.rates).toHaveLength(1);

    const entries = await ledger(company.workspaceId, created.id);
    expect(entries.map((entry) => entry.amount)).toEqual([
      100_000, -100_000, 150_000,
    ]);
    expect(entries[1]?.reversesEntryId).toBe(entries[0]?.id);
    expect(entries[2]?.entryDate.toISOString().slice(0, 10)).toBe("2026-04-02");

    // The form opened before this save is now stale.
    const stale = await updateVendor(
      jsonRequest(`${BASE}/${created.id}/update`, company.cookie, {
        name: "Late edit",
        joiningDate: "2026-04-01",
        expectedUpdatedAt: created.updatedAt,
      }),
      params(created.id),
    );
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect((await json<{ code: string }>(stale)).code).toBe("VENDOR_CHANGED");

    // An unchanged opening balance writes no entries.
    await updateVendor(
      jsonRequest(`${BASE}/${created.id}/update`, company.cookie, {
        name: "Muthu Gang (Nagercoil)",
        joiningDate: "2026-04-02",
        projectIds: [f.villa],
        shifts: [],
        expectedUpdatedAt: updated.updatedAt,
      }),
      params(created.id),
    );
    expect(await ledger(company.workspaceId, created.id)).toHaveLength(3);
  });

  it("lists with search, project and active filters, and activates and deactivates", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const muthu = await json<Vendor>(
      await create(company, {
        name: "Muthu Gang",
        joiningDate: "2026-04-01",
        projectIds: [f.tower],
        shifts: rateCard(f.mason, f.helper),
        openingBalance: 50_000,
      }),
    );
    const sundar = await json<Vendor>(
      await create(company, {
        name: "Sundar Gang",
        joiningDate: "2026-04-01",
        contactNumber: "9123456780",
        projectIds: [f.villa],
      }),
    );
    const list = async (query = "") => {
      const response = await listVendors(
        jsonRequest(`${BASE}${query}`, company.cookie),
      );
      expect(response.status).toBe(StatusCodes.OK);
      return json<{ items: Summary[]; total: number }>(response);
    };
    const all = await list();
    expect(all.total).toBe(2);
    expect(all.items.map((item) => item.name)).toEqual([
      "Sundar Gang",
      "Muthu Gang",
    ]);
    expect(all.items[1]).toMatchObject({
      shiftCount: 2,
      hasRateCard: true,
      balance: 50_000,
    });
    expect((await list("?q=muthu")).items.map((item) => item.id)).toEqual([
      muthu.id,
    ]);
    expect((await list("?q=23456")).items.map((item) => item.id)).toEqual([
      sundar.id,
    ]);
    expect(
      (await list(`?projectId=${f.villa}`)).items.map((item) => item.id),
    ).toEqual([sundar.id]);

    const deactivated = await deactivateVendor(
      jsonRequest(`${BASE}/${sundar.id}/deactivate`, company.cookie, {}),
      params(sundar.id),
    );
    expect((await json<Vendor>(deactivated)).isActive).toBe(false);
    expect((await list("?active=true")).items.map((item) => item.id)).toEqual([
      muthu.id,
    ]);
    expect((await list("?active=false")).items.map((item) => item.id)).toEqual([
      sundar.id,
    ]);
    const activated = await activateVendor(
      jsonRequest(`${BASE}/${sundar.id}/activate`, company.cookie, {}),
      params(sundar.id),
    );
    expect((await json<Vendor>(activated)).isActive).toBe(true);

    const paged = await list("?limit=1");
    expect(paged.items).toHaveLength(1);
    expect(paged.total).toBe(2);
  });

  it("deletes a vendor without records and reverses its opening entry; refuses one with attendance", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const fresh = await json<Vendor>(
      await create(company, {
        name: "Fresh Gang",
        joiningDate: "2026-04-01",
        openingBalance: 30_000,
      }),
    );
    const deleted = await deleteVendor(
      jsonRequest(`${BASE}/${fresh.id}/delete`, company.cookie, {}),
      params(fresh.id),
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    const entries = await ledger(company.workspaceId, fresh.id);
    expect(entries.reduce((sum, entry) => sum + entry.amount, 0)).toBe(0);
    const gone = await getVendor(
      jsonRequest(`${BASE}/${fresh.id}`, company.cookie),
      params(fresh.id),
    );
    expect(gone.status).toBe(StatusCodes.NOT_FOUND);

    const worked = await json<Vendor>(
      await create(company, {
        name: "Worked Gang",
        joiningDate: "2026-04-01",
        projectIds: [f.tower],
      }),
    );
    await prisma.constructionLabourVendorAttendance.create({
      data: {
        id: newId(),
        workspaceId: company.workspaceId,
        projectId: f.tower,
        vendorId: worked.id,
        attendanceDate: new Date("2026-10-01T00:00:00Z"),
        totalPay: 0,
        createdBy: "test",
        updatedBy: "test",
      },
    });
    const refused = await deleteVendor(
      jsonRequest(`${BASE}/${worked.id}/delete`, company.cookie, {}),
      params(worked.id),
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect((await json<{ code: string }>(refused)).code).toBe(
      "VENDOR_HAS_RECORDS",
    );
  });

  it("lists options for a Project: active assigned vendors with live shifts", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const onTower = await json<Vendor>(
      await create(company, {
        name: "Tower Gang",
        joiningDate: "2026-04-01",
        projectIds: [f.tower],
        shifts: rateCard(f.mason, f.helper),
      }),
    );
    const inactive = await json<Vendor>(
      await create(company, {
        name: "Idle Gang",
        joiningDate: "2026-04-01",
        projectIds: [f.tower],
      }),
    );
    await deactivateVendor(
      jsonRequest(`${BASE}/${inactive.id}/deactivate`, company.cookie, {}),
      params(inactive.id),
    );
    await create(company, {
      name: "Villa Gang",
      joiningDate: "2026-04-01",
      projectIds: [f.villa],
    });

    const options = (cookie: string, projectId: string) =>
      vendorOptions(
        jsonRequest(`${BASE}/options?projectId=${projectId}`, cookie),
      );
    const response = await options(company.cookie, f.tower);
    expect(response.status).toBe(StatusCodes.OK);
    const body = await json<{
      items: { id: string; shifts: Shift[]; hasRateCard: boolean }[];
    }>(response);
    expect(body.items.map((item) => item.id)).toEqual([onTower.id]);
    expect(body.items[0]?.shifts[0]?.rates[0]?.ratePerDay).toBe(90_000);

    expect((await options(company.cookie, newId())).status).toBe(
      StatusCodes.NOT_FOUND,
    );

    // A Member with Attendance read needs to be on the Project.
    const member = await memberWith(company, {
      "labour.attendance": ["read"],
    });
    expect((await options(member.cookie, f.tower)).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    await prisma.constructionOrganizationTeamMemberProject.create({
      data: { memberId: member.memberId, projectId: f.tower },
    });
    const allowed = await options(member.cookie, f.tower);
    expect(allowed.status).toBe(StatusCodes.OK);
    const redacted = await json<{ items: { shifts: Shift[] }[] }>(allowed);
    expect(redacted.items[0]?.shifts[0]?.rates[0]).toMatchObject({
      ratePerDay: null,
      overtimePerHour: null,
    });
  });

  it("hides amounts without Financial, refuses amounts from such a Member, and 403s without the menu", async () => {
    const company = await ownerWithCompany();
    const f = await fixtures(company);
    const vendor = await json<Vendor>(
      await create(company, {
        name: "Muthu Gang",
        joiningDate: "2026-04-01",
        shifts: rateCard(f.mason, f.helper),
        openingBalance: 75_000,
      }),
    );
    const clerk = await memberWith(company, {
      "masters.vendors": ["read", "update", "create"],
    });
    const seen = await json<Vendor>(
      await getVendor(
        jsonRequest(`${BASE}/${vendor.id}`, clerk.cookie),
        params(vendor.id),
      ),
    );
    expect(seen.openingBalance).toBeNull();
    expect(seen.balance).toBeNull();
    expect(seen.shifts[0]?.rates[0]).toMatchObject({
      ratePerDay: null,
      overtimePerHour: null,
    });
    const listed = await json<{ items: Summary[] }>(
      await listVendors(jsonRequest(BASE, clerk.cookie)),
    );
    expect(listed.items[0]?.balance).toBeNull();

    // Renaming a shift with null rates keeps the amounts.
    const kept = await updateVendor(
      jsonRequest(`${BASE}/${vendor.id}/update`, clerk.cookie, {
        name: "Muthu Gang",
        joiningDate: "2026-04-01",
        shifts: seen.shifts.map((shift) => ({
          ...shift,
          name: `${shift.name} (site)`,
        })),
        expectedUpdatedAt: seen.updatedAt,
      }),
      params(vendor.id),
    );
    expect(kept.status).toBe(StatusCodes.OK);
    const owner = await json<Vendor>(
      await getVendor(
        jsonRequest(`${BASE}/${vendor.id}`, company.cookie),
        params(vendor.id),
      ),
    );
    expect(owner.shifts[0]?.name).toBe("Shift 1 (site)");
    expect(owner.shifts[0]?.rates[0]?.ratePerDay).toBe(90_000);
    expect(owner.openingBalance).toBe(75_000);

    const priced = await create(clerk, {
      name: "Priced Gang",
      joiningDate: "2026-04-01",
      openingBalance: 10,
    });
    // Financial hides amounts; it does not stop entering them (same rule
    // as labourers, whose wage is required on create).
    expect(priced.status).toBe(StatusCodes.CREATED);
    expect((await json<Vendor>(priced)).openingBalance).toBeNull();

    const outsider = await memberWith(company, {
      "masters.labours": ["read"],
    });
    expect((await listVendors(jsonRequest(BASE, outsider.cookie))).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect(
      (await create(outsider, { name: "Nope", joiningDate: "2026-04-01" }))
        .status,
    ).toBe(StatusCodes.FORBIDDEN);
  });

  it("keeps a photo and documents (party files, owner type vendor)", async () => {
    const company = await ownerWithCompany();
    const vendor = await json<Vendor & { photoUrl: string | null }>(
      await create(company, { name: "Muthu Gang", joiningDate: "2026-04-01" }),
    );
    expect(vendor.photoUrl).toBeNull();
    const url = `${BASE}/${vendor.id}`;
    const photo = await setPhoto(
      upload(`${url}/photo`, company.cookie, pngBytes(), "image/png"),
      params(vendor.id),
    );
    expect(photo.status).toBe(StatusCodes.OK);
    const { photoUrl } = await json<{ photoUrl: string }>(photo);
    expect(photoUrl).toMatch(
      new RegExp(`^/api/construction/labour/vendors/${vendor.id}/photo\\?v=`),
    );
    const fetched = await json<{ photoUrl: string | null }>(
      await getVendor(jsonRequest(url, company.cookie), params(vendor.id)),
    );
    expect(fetched.photoUrl).toBe(photoUrl);
    const streamed = await getPhoto(
      jsonRequest(`${url}/photo`, company.cookie),
      params(vendor.id),
    );
    expect(await bytesOf(streamed)).toEqual(pngBytes());
    await removePhoto(
      jsonRequest(`${url}/photo/remove`, company.cookie, {}),
      params(vendor.id),
    );

    const pdf = Uint8Array.from(
      new TextEncoder().encode("%PDF-1.7\nlicence\n%%EOF"),
    );
    const added = await addDocument(
      upload(
        `${url}/documents?fileName=${encodeURIComponent("CLRA licence.pdf")}`,
        company.cookie,
        pdf,
        "application/pdf",
      ),
      params(vendor.id),
    );
    expect(added.status).toBe(StatusCodes.CREATED);
    const document = await json<{ id: string; fileName: string }>(added);
    expect(document.fileName).toBe("CLRA licence.pdf");
    const listed = await json<{ items: { id: string }[] }>(
      await listDocuments(
        jsonRequest(`${url}/documents`, company.cookie),
        params(vendor.id),
      ),
    );
    expect(listed.items.map((item) => item.id)).toEqual([document.id]);
    const docParams = {
      params: Promise.resolve({ id: vendor.id, docId: document.id }),
    };
    const download = await getDocument(
      jsonRequest(`${url}/documents/${document.id}`, company.cookie),
      docParams,
    );
    expect(await bytesOf(download)).toEqual(pdf);
    const removed = await deleteDocument(
      jsonRequest(`${url}/documents/${document.id}/delete`, company.cookie, {}),
      docParams,
    );
    expect(removed.status).toBe(StatusCodes.NO_CONTENT);
  });

  it("keeps Companies apart", async () => {
    const first = await ownerWithCompany();
    const second = await ownerWithCompany("Sakthi Constructions");
    const vendor = await json<Vendor>(
      await create(first, { name: "Muthu Gang", joiningDate: "2026-04-01" }),
    );
    const response = await getVendor(
      jsonRequest(`${BASE}/${vendor.id}`, second.cookie),
      params(vendor.id),
    );
    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    const update = await updateVendor(
      jsonRequest(`${BASE}/${vendor.id}/update`, second.cookie, {
        name: "Stolen",
        joiningDate: "2026-04-01",
        expectedUpdatedAt: vendor.updatedAt,
      }),
      params(vendor.id),
    );
    expect(update.status).toBe(StatusCodes.NOT_FOUND);
    const list = await json<{ total: number }>(
      await listVendors(jsonRequest(BASE, second.cookie)),
    );
    expect(list.total).toBe(0);
  });

  it("is listed in the OpenAPI document", async () => {
    const response = getOpenApi();
    const document = await json<{
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    }>(response);
    for (const path of [
      "/api/construction/labour/vendors",
      "/api/construction/labour/vendors/options",
      "/api/construction/labour/vendors/{id}",
      "/api/construction/labour/vendors/{id}/update",
      "/api/construction/labour/vendors/{id}/activate",
      "/api/construction/labour/vendors/{id}/deactivate",
      "/api/construction/labour/vendors/{id}/delete",
      "/api/construction/labour/vendors/{id}/photo",
      "/api/construction/labour/vendors/{id}/documents",
    ])
      expect(document.paths[path], path).toBeDefined();
    expect(
      document.components.schemas["CreateConstructionLabourVendorRequest"],
    ).toBeDefined();
  });
});
