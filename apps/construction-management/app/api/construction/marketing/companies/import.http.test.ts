import { prisma } from "@repo/construction-db";
import ExcelJS from "exceljs";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import type { PermissionGrants } from "@/src/shared-kernel/access";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import type { ImportConstructionMarketingProspectCompaniesResponse as ImportResult } from "./company-models";
import { GET as importTemplate } from "./import-template/route";
import { POST as importCompanies } from "./import/route";
import { POST as create } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/marketing/companies`;
const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const HEADERS = [
  "Name",
  "City",
  "Phone",
  "Primary Contact name",
  "Primary Contact mobile",
];

/** The default Marketing Role's cells (ADR CM-0040 §3): no import. */
const MARKETING: PermissionGrants = {
  "marketing.visits": ["create", "read", "update"],
  "marketing.follow_ups": ["create", "read", "update"],
  "marketing.companies": ["create", "read", "update"],
};

const IMPORTER: PermissionGrants = {
  ...MARKETING,
  "marketing.companies": ["create", "read", "update", "import"],
};

async function sheet(rows: ExcelJS.CellValue[][]): Promise<Uint8Array> {
  const book = new ExcelJS.Workbook();
  const target = book.addWorksheet("Prospect Companies");
  target.addRow(HEADERS);
  for (const row of rows) target.addRow(row);
  const written = (await book.xlsx.writeBuffer()) as unknown as Uint8Array;
  return Uint8Array.from(written);
}

function upload(cookie: string, bytes: Uint8Array, type = XLSX): Request {
  return new Request(`${BASE}/import`, {
    method: "POST",
    headers: { cookie, "content-type": type },
    body: Uint8Array.from(bytes),
  });
}

async function add(cookie: string, name: string): Promise<void> {
  const response = await create(jsonRequest(BASE, cookie, { name }));
  expect(response.status).toBe(StatusCodes.CREATED);
}

describe("Prospect Company import (ADR CM-0040 §11)", () => {
  it("refuses the import and its template without Companies import", async () => {
    const owner = await ownerWithCompany();
    const member = await memberWith(owner, MARKETING);

    const refused = await importCompanies(
      upload(member.cookie, await sheet([["Kaveri Steel"]])),
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    const template = await importTemplate(
      jsonRequest(`${BASE}/import-template`, member.cookie),
    );
    expect(template.status).toBe(StatusCodes.FORBIDDEN);
    await expect(
      prisma.constructionMarketingProspectCompany.count({
        where: { workspaceId: owner.workspaceId },
      }),
    ).resolves.toBe(0);
  });

  it("downloads the template with the five columns", async () => {
    const owner = await ownerWithCompany();
    const response = await importTemplate(
      jsonRequest(`${BASE}/import-template`, owner.cookie),
    );
    expect(response.status).toBe(StatusCodes.OK);
    expect(response.headers.get("content-type")).toBe(XLSX);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await response.arrayBuffer());
    const first = book.worksheets[0];
    const headers = (first?.getRow(1).values as unknown[]).slice(1);
    expect(headers).toEqual(HEADERS);
  });

  it("creates only the valid rows, assigned to the importer at New, and reports duplicates and invalid rows", async () => {
    const owner = await ownerWithCompany();
    const importer = await memberWith(owner, IMPORTER);
    const other = await memberWith(owner, MARKETING);
    // A live company the importer cannot see: still a duplicate.
    await add(other.cookie, "Sri Balaji Builders");

    const response = await importCompanies(
      upload(
        importer.cookie,
        await sheet([
          ["Kaveri Steel", "Salem", "0427 2345678", "Lakshmi", 9840012345],
          ["sri  balaji BUILDERS", "Chennai"],
          ["KAVERI   steel", "Erode"],
          ["Pandian Mills", "Madurai", "call me"],
          [null, "Tiruppur"],
          ["Madurai Mills", null, null, null, "98765 43210"],
          ["Anugraha Steel"],
        ]),
      ),
    );
    expect(response.status).toBe(StatusCodes.OK);
    const result = (await response.json()) as ImportResult;
    expect(result).toMatchObject({ created: 2, duplicates: 2, invalid: 3 });
    expect(result.companies.map((item) => [item.row, item.name])).toEqual([
      [2, "Kaveri Steel"],
      [8, "Anugraha Steel"],
    ]);
    expect(result.problems).toEqual([
      {
        row: 3,
        name: "sri balaji BUILDERS",
        reason: "duplicate",
        field: null,
        message: "A Prospect Company with this name already exists.",
      },
      {
        row: 4,
        name: "KAVERI steel",
        reason: "duplicate",
        field: null,
        message: "Row 2 has the same name.",
      },
      {
        row: 5,
        name: "Pandian Mills",
        reason: "invalid",
        field: "phone",
        message:
          "Enter a phone number: digits, with spaces or dashes if you like.",
      },
      {
        row: 6,
        name: null,
        reason: "invalid",
        field: "name",
        message: "Enter the company's name.",
      },
      {
        row: 7,
        name: "Madurai Mills",
        reason: "invalid",
        field: "contactName",
        message: "Enter the primary Contact's name for this mobile.",
      },
    ]);

    const companies =
      await prisma.constructionMarketingProspectCompany.findMany({
        where: { workspaceId: owner.workspaceId, deletedAt: null },
        include: { contacts: true, stageChanges: true },
        orderBy: { name: "asc" },
      });
    expect(companies.map((company) => company.name)).toEqual([
      "Anugraha Steel",
      "Kaveri Steel",
      "Sri Balaji Builders",
    ]);
    const kaveri = companies.find((company) => company.name === "Kaveri Steel");
    expect(kaveri).toMatchObject({
      city: "Salem",
      phone: "0427 2345678",
      stage: "new",
      source: null,
      assignedMemberId: importer.memberId,
      createdBy: importer.userId,
    });
    expect(kaveri?.contacts).toEqual([
      expect.objectContaining({
        name: "Lakshmi",
        mobile: "+919840012345",
        isPrimary: true,
      }),
    ]);
    expect(kaveri?.stageChanges).toEqual([
      expect.objectContaining({ fromStage: null, toStage: "new" }),
    ]);
    const anugraha = companies.find(
      (company) => company.name === "Anugraha Steel",
    );
    expect(anugraha?.contacts).toEqual([]);
    expect(anugraha?.assignedMemberId).toBe(importer.memberId);
    await expect(
      prisma.constructionOrganizationAuditEvent.count({
        where: {
          workspaceId: owner.workspaceId,
          action: "prospect_company.created",
          actorUserId: importer.userId,
        },
      }),
    ).resolves.toBe(2);
  });

  it("assigns the Owner's imports to the Owner's member", async () => {
    const owner = await ownerWithCompany();
    const response = await importCompanies(
      upload(owner.cookie, await sheet([["Kaveri Steel"]])),
    );
    expect(response.status).toBe(StatusCodes.OK);
    const self =
      await prisma.constructionOrganizationTeamMember.findFirstOrThrow({
        where: { workspaceId: owner.workspaceId, isOwner: true },
      });
    await expect(
      prisma.constructionMarketingProspectCompany.findFirstOrThrow({
        where: { workspaceId: owner.workspaceId },
      }),
    ).resolves.toMatchObject({ assignedMemberId: self.id });
  });

  it("refuses a file that is not an .xlsx and creates nothing", async () => {
    const owner = await ownerWithCompany();
    const response = await importCompanies(
      upload(
        owner.cookie,
        new TextEncoder().encode("Name,City\nKaveri Steel,Salem"),
        "text/csv",
      ),
    );
    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    await expect(response.json()).resolves.toMatchObject({
      code: "IMPORT_FILE_INVALID",
    });
    await expect(
      prisma.constructionMarketingProspectCompany.count({
        where: { workspaceId: owner.workspaceId },
      }),
    ).resolves.toBe(0);
  });
});
