import { prisma } from "@repo/construction-db";
import { describe, expect, it } from "vitest";

import { addProject, newCompany } from "@/test/companies";
import { trackingIssueRow } from "@/test/tracking";

describe("insertIssueRow (CM-801)", () => {
  it("numbers issues from the Issue & Snag rule and records the lifecycle and audit", async () => {
    const company = await newCompany();
    const by = company.ownerId;
    const projectId = await addProject(company.workspaceId, by);
    const first = await trackingIssueRow(company.workspaceId, projectId, by, {
      issueDate: "2026-10-14",
    });
    const second = await trackingIssueRow(company.workspaceId, projectId, by, {
      issueDate: "2026-10-14",
      status: "solved",
    });
    expect(first.number).toBe("ISS/26-27/00001");
    expect(second.number).toBe("ISS/26-27/00002");

    const rows = await prisma.constructionTrackingIssue.findMany({
      where: { id: { in: [first.id, second.id] } },
      orderBy: { number: "asc" },
    });
    expect(rows.map((row) => row.status)).toEqual(["open", "solved"]);
    expect(rows[0]?.siteLocation).toBeNull();
    expect(rows[0]?.solvedAt).toBeNull();
    expect(rows[1]?.solvedBy).toBe(by);

    const events = await prisma.constructionTrackingIssueEvent.findMany({
      where: { issueId: second.id },
      orderBy: { id: "asc" },
    });
    expect(events.map((event) => event.kind)).toEqual(["created", "solved"]);
    const audit = await prisma.constructionOrganizationAuditEvent.findFirst({
      where: { entityId: first.id, action: "issue.created" },
    });
    expect(audit?.after).toMatchObject({ number: first.number });
  });

  it("links a snag to the inspection it was raised from", async () => {
    const company = await newCompany();
    const by = company.ownerId;
    const projectId = await addProject(company.workspaceId, by);
    const inspectionId = crypto.randomUUID();
    await prisma.constructionTrackingInspection.create({
      data: {
        id: inspectionId,
        workspaceId: company.workspaceId,
        projectId,
        number: "IR/26-27/00001",
        inspectionDate: new Date("2026-10-14T00:00:00Z"),
        workDescription: "Column reinforcement",
        status: "rejected",
        decidedAt: new Date(),
        decidedBy: by,
        rejectionReason: "Cover blocks missing",
        createdBy: by,
        updatedBy: by,
      },
    });
    const snag = await trackingIssueRow(company.workspaceId, projectId, by, {
      sourceInspectionId: inspectionId,
      details: "Inspection IR/26-27/00001 rejected: Cover blocks missing",
    });
    const row = await prisma.constructionTrackingIssue.findUniqueOrThrow({
      where: { id: snag.id },
      include: { events: true },
    });
    expect(row.sourceInspectionId).toBe(inspectionId);
    expect(row.events[0]?.payload).toEqual({
      sourceInspectionId: inspectionId,
    });
  });
});
