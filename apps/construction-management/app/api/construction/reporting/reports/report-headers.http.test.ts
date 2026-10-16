import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import {
  decodePDFRawStream,
  PDFArray,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
} from "pdf-lib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { POST as createProgressReport } from "@/app/api/construction/site-work/progress-reports/route";
import { GET as downloadProgressReport } from "@/app/api/construction/site-work/progress-reports/[id]/download/route";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";
import { newId } from "@/src/shared-kernel/ids";
import { addProject, jsonRequest, ownerWithCompany } from "@/test/companies";
import { bytesOf } from "@/test/files";
import { TEST_ORIGIN } from "@/test/sessions";

import { GET as downloadReport } from "./[id]/download/route";
import type { ConstructionReportingReportJobResponseModel as Job } from "./report-models";
import { POST as requestReport } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/reporting/reports`;
const SEPTEMBER = { from: "2026-09-01", to: "2026-09-30" };

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

/** A PNG `width` wide, written to private storage under the Company. */
async function storeLogo(workspaceId: string, width: number): Promise<string> {
  const key = `companies/${workspaceId}/logos/${newId()}.png`;
  const bytes = await sharp({
    create: {
      width,
      height: 40,
      channels: 3,
      background: { r: 200, g: 120, b: 40 },
    },
  })
    .png()
    .toBuffer();
  await objectStorage().put(key, new Uint8Array(bytes), "image/png");
  return key;
}

/** The widths of the images a PDF embeds. */
function imageWidths(pdf: PDFDocument): number[] {
  return pdf.context.enumerateIndirectObjects().flatMap(([, object]) => {
    if (!(object instanceof PDFRawStream)) return [];
    if (object.dict.get(PDFName.of("Subtype")) !== PDFName.of("Image"))
      return [];
    const width = object.dict.get(PDFName.of("Width"));
    return width instanceof PDFNumber ? [width.asNumber()] : [];
  });
}

/** The first page's drawing operators. */
function firstPageContent(pdf: PDFDocument): string {
  const page = pdf.getPage(0);
  const contents = page.node.Contents();
  const streams =
    contents instanceof PDFArray
      ? contents.asArray().map((ref) => pdf.context.lookup(ref))
      : [contents];
  return streams
    .map((stream) =>
      stream instanceof PDFRawStream
        ? new TextDecoder().decode(decodePDFRawStream(stream).decode())
        : "",
    )
    .join("\n");
}

async function reportPdf(company: Company, projectId: string) {
  const response = await requestReport(
    jsonRequest(BASE, company.cookie, {
      kind: "labour_attendance",
      projectId,
      params: SEPTEMBER,
    }),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  const job = await json<Job>(response);
  expect(job.status).toBe("done");
  const file = await downloadReport(
    jsonRequest(`${BASE}/${job.id}/download?format=pdf`, company.cookie),
    { params: Promise.resolve({ id: job.id }) },
  );
  expect(file.status).toBe(StatusCodes.OK);
  return PDFDocument.load(await bytesOf(file));
}

describe("report headers and footers HTTP (ADR CM-0021 §2)", () => {
  it("prints the Project logo when it is used on reports, else the Company's, else none", async () => {
    const company = await ownerWithCompany("Logo Builders");
    const plain = await addProject(company.workspaceId, company.userId);
    expect(imageWidths(await reportPdf(company, plain))).toEqual([]);

    const companyLogo = await storeLogo(company.workspaceId, 50);
    await prisma.constructionOrganizationCompanyProfile.update({
      where: { workspaceId: company.workspaceId },
      data: { logoKey: companyLogo },
    });
    const ownLogo = await storeLogo(company.workspaceId, 200);
    const branded = await addProject(company.workspaceId, company.userId);
    await prisma.constructionProjectsProject.update({
      where: { id: branded },
      data: { logoKey: ownLogo, useLogoInReports: true },
    });
    const notUsed = await addProject(company.workspaceId, company.userId);
    await prisma.constructionProjectsProject.update({
      where: { id: notUsed },
      data: { logoKey: ownLogo, useLogoInReports: false },
    });

    expect(imageWidths(await reportPdf(company, branded))).toEqual([200]);
    expect(imageWidths(await reportPdf(company, notUsed))).toEqual([50]);
    expect(imageWidths(await reportPdf(company, plain))).toEqual([50]);
  });

  it("says who generated it and when in the footer", async () => {
    const company = await ownerWithCompany("Footer Builders");
    const projectId = await addProject(company.workspaceId, company.userId);
    const content = firstPageContent(await reportPdf(company, projectId));
    expect(content).toContain(
      Buffer.from("Generated by Arun Selva Kumar on ", "latin1")
        .toString("hex")
        .toUpperCase(),
    );
  });

  it("prints the Company logo on a Daily Progress Report when the Project's is not used", async () => {
    const company = await ownerWithCompany("DPR Logo Builders");
    const projectId = await addProject(company.workspaceId, company.userId);
    const companyLogo = await storeLogo(company.workspaceId, 64);
    await prisma.constructionOrganizationCompanyProfile.update({
      where: { workspaceId: company.workspaceId },
      data: { logoKey: companyLogo },
    });
    const created = await createProgressReport(
      jsonRequest(
        `${TEST_ORIGIN}/api/construction/site-work/progress-reports`,
        company.cookie,
        { projectId, date: "2026-09-10" },
      ),
    );
    expect(created.status).toBe(StatusCodes.CREATED);
    const report = await json<{ id: string; status: string }>(created);
    expect(report.status).toBe("done");
    const file = await downloadProgressReport(
      jsonRequest(
        `${TEST_ORIGIN}/api/construction/site-work/progress-reports/${report.id}/download`,
        company.cookie,
      ),
      { params: Promise.resolve({ id: report.id }) },
    );
    expect(file.status).toBe(StatusCodes.OK);
    const pdf = await PDFDocument.load(await bytesOf(file));
    expect(imageWidths(pdf)).toEqual([64]);
  });
});
