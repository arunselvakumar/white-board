import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { POST as createProject } from "@/app/api/construction/projects/projects/route";
import { jsonRequest, ownerWithCompany } from "@/test/companies";

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function lists(projectId: string) {
  const where = { projectId, deletedAt: null };
  const [stages, sources, reasons] = await Promise.all([
    prisma.constructionSalesFunnelStage.findMany({
      where,
      orderBy: { sortOrder: "asc" },
    }),
    prisma.constructionSalesLeadSource.findMany({ where }),
    prisma.constructionSalesLostReason.findMany({ where }),
  ]);
  return { stages, sources, reasons };
}

describe("Sales seeds on ProjectCreated through the route (CM-1001, CM-0022 §2)", () => {
  it("gives a Project made through the route the default lists", async () => {
    const owner = await ownerWithCompany();
    const response = await createProject(
      jsonRequest(
        "http://localhost/api/construction/projects/projects",
        owner.cookie,
        {
          name: "Sai Residency",
          projectType: "residential",
        },
      ),
    );
    expect(response.status).toBe(StatusCodes.CREATED);
    const { id } = await json<{ id: string }>(response);
    const { stages, sources, reasons } = await lists(id);
    expect(stages.map((s) => [s.name, s.sortOrder])).toEqual([
      ["New", 1],
      ["Contacted", 2],
      ["Site Visit", 3],
      ["Negotiation", 4],
    ]);
    expect(
      stages.every((s) => s.isSeed && s.workspaceId === owner.workspaceId),
    ).toBe(true);
    expect(sources.map((s) => s.name).sort()).toEqual([
      "Hoarding",
      "Property portal",
      "Referral",
      "Social media",
      "Walk-in",
      "Website",
    ]);
    expect(reasons).toHaveLength(5);
  });
});
