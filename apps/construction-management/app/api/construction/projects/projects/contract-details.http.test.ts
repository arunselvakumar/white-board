import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as deleteProject } from "./[id]/delete/route";
import { GET as getProject } from "./[id]/route";
import { POST as updateProject } from "./[id]/update/route";
import { GET as listLabels } from "./custom-field-labels/route";
import { GET as listProjects, POST as createProject } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/projects/projects`;

type CustomField = { label: string; value: string };

type Project = {
  id: string;
  name: string;
  status: string;
  clientName: string | null;
  clientPhone: string | null;
  tenderRef: string | null;
  quotationNo: string | null;
  quotationDate: string | null;
  loaNo: string | null;
  loaDate: string | null;
  clientOrderNo: string | null;
  clientOrderDate: string | null;
  agreementNo: string | null;
  agreementDate: string | null;
  orderValue: number | null;
  customFields: CustomField[];
  updatedAt: string;
};

type ErrorBody = { code: string; details?: unknown };

/** ₹4,85,00,000 excluding GST, in paise. */
const ORDER_VALUE = 4_85_00_000_00;

const CONTRACT = {
  clientName: "  Sri   Balaji Developers ",
  clientPhone: "98431 22110",
  tenderRef: "SBD/T/2026/031",
  quotationNo: "SBD/Q/2026/114",
  quotationDate: "2026-02-10",
  loaNo: "SBD/LOA/2026/022",
  loaDate: "2026-03-05",
  clientOrderNo: "SBD/WO/2026/057",
  clientOrderDate: "2026-03-12",
  agreementNo: "SBD/AGR/2026/009",
  agreementDate: "2026-03-20",
  orderValue: ORDER_VALUE,
  customFields: [
    { label: "Site engineer", value: "Prabhu Saravanan" },
    { label: "Client architect", value: "Meenakshi Associates, Madurai" },
  ],
};

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function create(
  cookie: string,
  body: Record<string, unknown>,
): Promise<Project> {
  const response = await createProject(jsonRequest(BASE, cookie, body));
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<Project>(response);
}

async function read(cookie: string, id: string): Promise<Project> {
  const response = await getProject(
    jsonRequest(`${BASE}/${id}`, cookie),
    params(id),
  );
  expect(response.status).toBe(StatusCodes.OK);
  return json<Project>(response);
}

/** The Project form as the current screen sends it, plus `body`. */
function update(
  cookie: string,
  project: Project,
  body: Record<string, unknown>,
): Promise<Response> {
  return updateProject(
    jsonRequest(`${BASE}/${project.id}/update`, cookie, {
      name: project.name,
      status: project.status,
      expectedUpdatedAt: project.updatedAt,
      ...body,
    }),
    params(project.id),
  );
}

async function labels(cookie: string): Promise<string[]> {
  const response = await listLabels(
    jsonRequest(`${BASE}/custom-field-labels`, cookie),
  );
  expect(response.status).toBe(StatusCodes.OK);
  return (await json<{ items: string[] }>(response)).items;
}

async function assign(memberId: string, projectIds: string[]): Promise<void> {
  await prisma.constructionOrganizationTeamMemberProject.createMany({
    data: projectIds.map((projectId) => ({ memberId, projectId })),
  });
}

describe("Project contract details and custom fields HTTP (CM-413)", () => {
  it("saves every detail on create and reads it back", async () => {
    const owner = await ownerWithCompany();
    const kumari = await create(owner.cookie, {
      name: "Kumari Heights",
      ...CONTRACT,
    });
    expect(kumari).toMatchObject({
      clientName: "Sri Balaji Developers",
      clientPhone: "+919843122110",
      tenderRef: "SBD/T/2026/031",
      quotationNo: "SBD/Q/2026/114",
      quotationDate: "2026-02-10",
      loaNo: "SBD/LOA/2026/022",
      loaDate: "2026-03-05",
      clientOrderNo: "SBD/WO/2026/057",
      clientOrderDate: "2026-03-12",
      agreementNo: "SBD/AGR/2026/009",
      agreementDate: "2026-03-20",
      orderValue: ORDER_VALUE,
      customFields: CONTRACT.customFields,
    });
    expect(await read(owner.cookie, kumari.id)).toEqual(kumari);
    const page = await json<{ items: Project[] }>(
      await listProjects(jsonRequest(BASE, owner.cookie)),
    );
    expect(page.items).toEqual([kumari]);

    const audit = await prisma.constructionOrganizationAuditEvent.findFirst({
      where: { entityId: kumari.id, action: "project.created" },
    });
    expect(audit?.after).toMatchObject({
      clientPhone: "+919843122110",
      orderValue: ORDER_VALUE,
      customFields: CONTRACT.customFields,
    });

    // A Project with only a name has none.
    expect(
      await create(owner.cookie, { name: "Asaripallam Tower" }),
    ).toMatchObject({
      clientName: null,
      quotationDate: null,
      orderValue: null,
      customFields: [],
    });
  });

  it("keeps what an edit leaves out, clears null or blank, and replaces the custom fields in order", async () => {
    const owner = await ownerWithCompany();
    const kumari = await create(owner.cookie, {
      name: "Kumari Heights",
      ...CONTRACT,
    });

    // Today's Project form sends only name, status, address and dates.
    const kept = await update(owner.cookie, kumari, {
      status: "on_hold",
      address: "Vadasery, Nagercoil",
    });
    expect(kept.status).toBe(StatusCodes.OK);
    const afterKeep = await json<Project>(kept);
    expect(afterKeep).toMatchObject({
      status: "on_hold",
      clientName: "Sri Balaji Developers",
      quotationNo: "SBD/Q/2026/114",
      orderValue: ORDER_VALUE,
      customFields: CONTRACT.customFields,
    });

    const cleared = await update(owner.cookie, afterKeep, {
      clientName: null,
      clientPhone: "",
      quotationNo: "  ",
      loaDate: null,
      orderValue: null,
      customFields: [
        { label: "Soil report", value: "Hard rock at 2.4 m" },
        { label: "", value: "" },
        { label: "Site engineer", value: "Karthik Muthu" },
      ],
    });
    expect(cleared.status).toBe(StatusCodes.OK);
    const afterClear = await json<Project>(cleared);
    expect(afterClear).toMatchObject({
      clientName: null,
      clientPhone: null,
      quotationNo: null,
      loaDate: null,
      orderValue: null,
      // Left out, so kept.
      tenderRef: "SBD/T/2026/031",
      agreementDate: "2026-03-20",
      customFields: [
        { label: "Soil report", value: "Hard rock at 2.4 m" },
        { label: "Site engineer", value: "Karthik Muthu" },
      ],
    });
    expect(await read(owner.cookie, kumari.id)).toEqual(afterClear);
    const rows = await prisma.constructionProjectsCustomField.findMany({
      where: { projectId: kumari.id },
      orderBy: { position: "asc" },
    });
    expect(rows.map(({ label, position }) => ({ label, position }))).toEqual([
      { label: "Soil report", position: 0 },
      { label: "Site engineer", position: 1 },
    ]);

    const audit = await prisma.constructionOrganizationAuditEvent.findFirst({
      where: { entityId: kumari.id, action: "project.updated" },
      orderBy: { occurredAt: "desc" },
    });
    expect(audit?.before).toMatchObject({
      clientName: "Sri Balaji Developers",
      orderValue: ORDER_VALUE,
    });
    expect(audit?.after).toMatchObject({ clientName: null, orderValue: null });

    const emptied = await update(owner.cookie, afterClear, {
      customFields: [],
    });
    expect((await json<Project>(emptied)).customFields).toEqual([]);
  });

  it("refuses bad details with the code and the field or row", async () => {
    const owner = await ownerWithCompany();
    const attempt = async (body: Record<string, unknown>) => {
      const response = await createProject(
        jsonRequest(BASE, owner.cookie, { name: "Kumari Heights", ...body }),
      );
      return { status: response.status, body: await json<ErrorBody>(response) };
    };
    const refused = (code: string, details?: unknown) => ({
      status: StatusCodes.BAD_REQUEST,
      body: details === undefined ? { code } : { code, details },
    });
    expect(
      await attempt({
        customFields: [
          { label: "Site engineer", value: "Prabhu Saravanan" },
          { label: "", value: "" },
          { label: "site ENGINEER", value: "Karthik Muthu" },
        ],
      }),
    ).toMatchObject(refused("PROJECT_CUSTOM_FIELD_DUPLICATE", { index: 2 }));
    expect(
      await attempt({ customFields: [{ label: "", value: "Prabhu" }] }),
    ).toMatchObject(
      refused("PROJECT_CUSTOM_FIELD_LABEL_REQUIRED", { index: 0 }),
    );
    expect(
      await attempt({
        customFields: Array.from({ length: 21 }, (_, index) => ({
          label: `Field ${String(index + 1)}`,
          value: "Yes",
        })),
      }),
    ).toMatchObject(refused("PROJECT_CUSTOM_FIELDS_LIMIT"));
    expect(await attempt({ clientPhone: "12345" })).toMatchObject(
      refused("PROJECT_CLIENT_PHONE_INVALID"),
    );
    expect(await attempt({ loaNo: "x".repeat(61) })).toMatchObject(
      refused("PROJECT_REFERENCE_TOO_LONG", { field: "loaNo" }),
    );
    expect(await attempt({ agreementDate: "2026-02-30" })).toMatchObject(
      refused("PROJECT_DATE_INVALID", { field: "agreementDate" }),
    );
    expect(await attempt({ orderValue: -100 })).toMatchObject(
      refused("PROJECT_ORDER_VALUE_INVALID"),
    );
    expect(await attempt({ orderValue: 12.5 })).toMatchObject(
      refused("VALIDATION_ERROR"),
    );
    // Nothing was saved.
    expect(
      await prisma.constructionProjectsProject.count({
        where: { workspaceId: owner.workspaceId },
      }),
    ).toBe(0);
  });

  it("hides and keeps the order value for a Member without Financial", async () => {
    const owner = await ownerWithCompany();
    const kumari = await create(owner.cookie, {
      name: "Kumari Heights",
      ...CONTRACT,
    });
    const engineer = await memberWith(owner, {
      "projects.project": ["create", "read", "update"],
    });
    const accountant = await memberWith(owner, {
      "projects.project": ["read", "update", "financial"],
    });
    await assign(engineer.memberId, [kumari.id]);
    await assign(accountant.memberId, [kumari.id]);

    const seen = await read(engineer.cookie, kumari.id);
    expect(seen).toMatchObject({
      orderValue: null,
      clientName: "Sri Balaji Developers",
      customFields: CONTRACT.customFields,
    });
    const listed = await json<{ items: Project[] }>(
      await listProjects(jsonRequest(BASE, engineer.cookie)),
    );
    expect(listed.items[0]?.orderValue).toBeNull();
    expect((await read(accountant.cookie, kumari.id)).orderValue).toBe(
      ORDER_VALUE,
    );

    // The engineer's edit cannot change or clear it.
    const changed = await update(engineer.cookie, seen, {
      orderValue: 1,
      quotationNo: "SBD/Q/2026/115",
    });
    expect(changed.status).toBe(StatusCodes.OK);
    const afterChange = await json<Project>(changed);
    expect(afterChange).toMatchObject({
      orderValue: null,
      quotationNo: "SBD/Q/2026/115",
    });
    const cleared = await update(engineer.cookie, afterChange, {
      orderValue: null,
    });
    expect(cleared.status).toBe(StatusCodes.OK);
    expect((await read(owner.cookie, kumari.id)).orderValue).toBe(ORDER_VALUE);

    // Nor set it on a Project they add.
    const added = await create(engineer.cookie, {
      name: "Asaripallam Tower",
      orderValue: ORDER_VALUE,
    });
    expect(added.orderValue).toBeNull();
    const row = await prisma.constructionProjectsProject.findUnique({
      where: { id: added.id },
    });
    expect(row?.orderValue).toBeNull();

    // The accountant can.
    const revised = await update(
      accountant.cookie,
      await read(accountant.cookie, kumari.id),
      {
        orderValue: 5_00_00_000_00,
      },
    );
    expect((await json<Project>(revised)).orderValue).toBe(5_00_00_000_00);
  });

  it("refuses a stale edit and leaves the custom fields as they were", async () => {
    const owner = await ownerWithCompany();
    const kumari = await create(owner.cookie, {
      name: "Kumari Heights",
      customFields: CONTRACT.customFields,
    });
    const first = await update(owner.cookie, kumari, { status: "on_hold" });
    expect(first.status).toBe(StatusCodes.OK);
    const stale = await update(owner.cookie, kumari, {
      clientName: "Sakthi Builders",
      customFields: [{ label: "Soil report", value: "Hard rock" }],
    });
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await json(stale)).toMatchObject({ code: "PROJECT_CHANGED" });
    expect(await read(owner.cookie, kumari.id)).toMatchObject({
      clientName: null,
      customFields: CONTRACT.customFields,
    });
  });

  it("lists the Company's labels: most used first, case grouped, live Projects only", async () => {
    const owner = await ownerWithCompany();
    const other = await ownerWithCompany("Sakthi Constructions");
    expect(await labels(owner.cookie)).toEqual([]);
    const field = (label: string) => ({ label, value: "Yes" });
    await create(owner.cookie, {
      name: "Kumari Heights",
      customFields: [
        field("Site engineer"),
        field("Client architect"),
        field("Soil report"),
      ],
    });
    await create(owner.cookie, {
      name: "Asaripallam Tower",
      customFields: [field("Site engineer"), field("Client architect")],
    });
    await create(owner.cookie, {
      name: "Vadasery Plots",
      customFields: [field("SITE ENGINEER"), field("Assistant")],
    });
    // A deleted Project's labels do not count.
    for (const name of ["Zen Villas", "Parvathipuram Row Houses"]) {
      const gone = await create(owner.cookie, {
        name,
        customFields: [field("Soil report"), field("Zebra crossing")],
      });
      const deleted = await deleteProject(
        jsonRequest(`${BASE}/${gone.id}/delete`, owner.cookie, {}),
        params(gone.id),
      );
      expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    }
    // Another Company's labels are theirs.
    await create(other.cookie, {
      name: "Kumari Heights",
      customFields: [field("Other company only")],
    });

    expect(await labels(owner.cookie)).toEqual([
      "Site engineer",
      "Client architect",
      "Assistant",
      "Soil report",
    ]);

    const reader = await memberWith(owner, { "projects.project": ["read"] });
    expect(await labels(reader.cookie)).toHaveLength(4);
    const outsider = await memberWith(owner, {
      "organization.team_members": ["read"],
    });
    const denied = await listLabels(
      jsonRequest(`${BASE}/custom-field-labels`, outsider.cookie),
    );
    expect(denied.status).toBe(StatusCodes.FORBIDDEN);
  });
});
