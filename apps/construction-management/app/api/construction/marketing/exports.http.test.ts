import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import ExcelJS from "exceljs";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import type { PermissionGrants } from "@/src/shared-kernel/access";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { bytesOf } from "@/test/files";
import { TEST_ORIGIN } from "@/test/sessions";

import { GET as exportCompanies } from "./companies/export/route";
import { POST as createCompany } from "./companies/route";
import { GET as exportVisits } from "./visits/export/route";
import { POST as createVisit } from "./visits/route";

const BASE = `${TEST_ORIGIN}/api/construction/marketing`;

type Session = { cookie: string; userId: string };
type Company = { id: string; name: string; contacts: { id: string }[] };

/** The Marketing Role's cells plus export on Visits and Companies. */
const EXPORTER: PermissionGrants = {
  "marketing.visits": ["create", "read", "update", "export"],
  "marketing.follow_ups": ["create", "read", "update"],
  "marketing.companies": ["create", "read", "update", "export"],
};

/** The Marketing Role as seeded: no export. */
const MARKETER: PermissionGrants = {
  "marketing.visits": ["create", "read", "update"],
  "marketing.follow_ups": ["create", "read", "update"],
  "marketing.companies": ["create", "read", "update"],
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function named(
  owner: Awaited<ReturnType<typeof ownerWithCompany>>,
  name: string,
  grants: PermissionGrants = EXPORTER,
) {
  const member = await memberWith(owner, grants);
  await prisma.constructionOrganizationTeamMember.update({
    where: { id: member.memberId },
    data: { name },
  });
  return member;
}

async function aCompany(
  who: Session,
  name: string,
  body: Record<string, unknown> = {},
): Promise<Company> {
  const response = await createCompany(
    jsonRequest(`${BASE}/companies`, who.cookie, {
      name: `${name} ${randomUUID().slice(0, 6)}`,
      city: "Coimbatore",
      primaryContact: { name: "Lakshmi", mobile: "9876543210" },
      ...body,
    }),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<Company>(response);
}

async function logVisit(
  who: Session,
  company: Company,
  body: Record<string, unknown> = {},
): Promise<{ id: string; number: string }> {
  const response = await createVisit(
    jsonRequest(`${BASE}/visits`, who.cookie, {
      status: "completed",
      prospectCompanyId: company.id,
      visitAt: new Date(Date.now() - 60_000).toISOString(),
      contactIds: company.contacts.map((contact) => contact.id),
      discussion: "Needs a 40 m PEB shed near Sulur.",
      ...body,
    }),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<{ id: string; number: string }>(response);
}

/** The sheet's header and rows, each row by its header's labels. */
async function sheet(response: Response) {
  expect(response.status).toBe(StatusCodes.OK);
  expect(response.headers.get("content-type")).toContain("spreadsheetml");
  expect(response.headers.get("content-disposition")).toContain("attachment");
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(
    Buffer.from(await bytesOf(response)) as unknown as ExcelJS.Buffer,
  );
  const rows: unknown[][] = [];
  book.worksheets[0]?.eachRow((row) => {
    rows.push((row.values as unknown[]).slice(1));
  });
  const [header = [], ...lines] = rows;
  return lines.map((line) =>
    Object.fromEntries(
      (header as string[]).map((label, index) => [label, line[index]]),
    ),
  );
}

function get(
  route: (request: Request) => Promise<Response>,
  path: string,
  who: Session,
  query: Record<string, string> = {},
) {
  const search = new URLSearchParams(query).toString();
  return route(
    jsonRequest(
      `${BASE}/${path}${search === "" ? "" : `?${search}`}`,
      who.cookie,
    ),
  );
}

describe("the Visits and Companies exports (ADR CM-0040 §2)", () => {
  it("exports the Visits list's filters and the caller's scope, and refuses without export", async () => {
    const owner = await ownerWithCompany();
    const ravi = await named(owner, "Ravi");
    const priya = await named(owner, "Priya");
    const plain = await named(owner, "Karthik", MARKETER);
    const kaveri = await aCompany(ravi, "Kaveri Steel");
    const pandian = await aCompany(priya, "Pandian Mills");
    const due = new Date(Date.now() + 5 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const quote = await logVisit(ravi, kaveri, {
      purpose: "quotation",
      interest: "hot",
      outcome: "Quote by Friday",
      nextFollowUp: { type: "call", dueDate: due },
    });
    const intro = await logVisit(ravi, kaveri, { purpose: "introduction" });
    const theirs = await logVisit(priya, pandian, { purpose: "quotation" });

    const refused = await get(exportVisits, "visits/export", plain);
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);

    const all = await sheet(await get(exportVisits, "visits/export", owner));
    expect(all.map((row) => row["Visit No."]).sort()).toEqual(
      [quote.number, intro.number, theirs.number].sort(),
    );
    const row = all.find((item) => item["Visit No."] === quote.number);
    expect(row).toMatchObject({
      "Prospect Company": kaveri.name,
      "Contacts met": "Lakshmi",
      "Visited by": "Ravi",
      Purpose: "Quotation",
      Status: "Completed",
      Interest: "Hot",
      Outcome: "Quote by Friday",
      "Checked in": "No",
    });
    expect(row?.["Date and time"]).toBeInstanceOf(Date);
    expect(row?.["Next Follow-up"]).toEqual(new Date(`${due}T00:00:00Z`));

    const quotations = await sheet(
      await get(exportVisits, "visits/export", owner, {
        purpose: "quotation",
      }),
    );
    expect(quotations.map((item) => item["Visit No."]).sort()).toEqual(
      [quote.number, theirs.number].sort(),
    );

    // Ravi without View all: his own Visits only.
    const own = await sheet(await get(exportVisits, "visits/export", ravi));
    expect(own.map((item) => item["Visit No."]).sort()).toEqual(
      [quote.number, intro.number].sort(),
    );
  });

  it("exports the Companies list's search and filters and the caller's scope, and refuses without export", async () => {
    const owner = await ownerWithCompany();
    const ravi = await named(owner, "Ravi");
    const priya = await named(owner, "Priya");
    const plain = await named(owner, "Karthik", MARKETER);
    const kaveri = await aCompany(ravi, "Kaveri Steel", {
      industry: "Steel",
    });
    const pandian = await aCompany(priya, "Pandian Mills");
    await logVisit(ravi, kaveri);

    const refused = await get(exportCompanies, "companies/export", plain);
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);

    const all = await sheet(
      await get(exportCompanies, "companies/export", owner),
    );
    expect(all.map((row) => row["Prospect Company"]).sort()).toEqual(
      [kaveri.name, pandian.name].sort(),
    );
    const row = all.find((item) => item["Prospect Company"] === kaveri.name);
    expect(row).toMatchObject({
      Industry: "Steel",
      City: "Coimbatore",
      Stage: "Contacted",
      "Assigned to": "Ravi",
      "Primary Contact": "Lakshmi",
      Mobile: "+919876543210",
    });
    expect(row?.["Last Visit"]).toBeInstanceOf(Date);

    const contacted = await sheet(
      await get(exportCompanies, "companies/export", owner, {
        stage: "contacted",
      }),
    );
    expect(contacted.map((item) => item["Prospect Company"])).toEqual([
      kaveri.name,
    ]);
    const searched = await sheet(
      await get(exportCompanies, "companies/export", owner, {
        search: "Pandian",
      }),
    );
    expect(searched.map((item) => item["Prospect Company"])).toEqual([
      pandian.name,
    ]);

    // Priya without View all: her own company only.
    const own = await sheet(
      await get(exportCompanies, "companies/export", priya),
    );
    expect(own.map((item) => item["Prospect Company"])).toEqual([pandian.name]);
  });
});
