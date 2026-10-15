import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { trackingDirectory } from "@/src/composition/tracking-directory";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import { addContractor } from "@/test/procurement";
import { sharedAssign } from "@/test/site-work";
import { trackingDrawing, trackingMaster } from "@/test/tracking";

import { GET as getAccess } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = "http://localhost/api/construction/tracking/access";

type Access = { projectId: string; menus: Record<string, string[]> };

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("GET /api/construction/tracking/access (CM-801)", () => {
  it("gives the Owner every flag of the three menus and Tags", async () => {
    const company = await newCompany();
    const projectId = await addProject(company.workspaceId, company.ownerId);
    actAs({ userId: company.ownerId, workspaceId: company.workspaceId });
    const response = await getAccess(
      new Request(`${BASE}?projectId=${projectId}`),
    );
    expect(response.status).toBe(StatusCodes.OK);
    const body = await json<Access>(response);
    expect(body.projectId).toBe(projectId);
    expect(body.menus["tracking.tasks"]).toEqual(
      expect.arrayContaining(["create", "view_all", "financial"]),
    );
    expect(body.menus["tracking.issues"]).toEqual(
      expect.arrayContaining(["approve", "reject", "view_all"]),
    );
    expect(body.menus["tracking.inspection_requests"]).toContain("approve");
    expect(body.menus["masters.tags"]).toEqual([
      "create",
      "read",
      "update",
      "delete",
    ]);
  });

  it("gives a member their grants only on a Project they are on", async () => {
    const company = await newCompany();
    const projectId = await addProject(company.workspaceId, company.ownerId);
    const other = await addProject(company.workspaceId, company.ownerId);
    const member = await addMember(company.workspaceId, company.ownerId, {
      "tracking.issues": ["create", "read"],
      "masters.tags": ["read"],
    });
    await sharedAssign(member.memberId, projectId);
    actAs({
      userId: member.userId,
      workspaceId: company.workspaceId,
      role: "member",
    });
    const on = await json<Access>(
      await getAccess(new Request(`${BASE}?projectId=${projectId}`)),
    );
    expect(on.menus["tracking.issues"]).toEqual(["create", "read"]);
    expect(on.menus["tracking.tasks"]).toEqual([]);
    expect(on.menus["masters.tags"]).toEqual(["read"]);
    const off = await json<Access>(
      await getAccess(new Request(`${BASE}?projectId=${other}`)),
    );
    expect(off.menus["tracking.issues"]).toEqual([]);
    expect(off.menus["masters.tags"]).toEqual(["read"]);
  });

  it("answers 404 for another Company's Project and 400 without one", async () => {
    const company = await newCompany();
    const stranger = await newCompany("Other Builders");
    const theirs = await addProject(stranger.workspaceId, stranger.ownerId);
    actAs({ userId: company.ownerId, workspaceId: company.workspaceId });
    const response = await getAccess(
      new Request(`${BASE}?projectId=${theirs}`),
    );
    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expect((await json<{ code: string }>(response)).code).toBe(
      "PROJECT_NOT_FOUND",
    );
    expect((await getAccess(new Request(BASE))).status).toBe(
      StatusCodes.BAD_REQUEST,
    );
  });

  it("is on /api/docs", async () => {
    const document = await json<{ paths: Record<string, unknown> }>(
      getOpenApi(),
    );
    expect(document.paths["/api/construction/tracking/access"]).toBeDefined();
  });
});

describe("TrackingDirectory (CM-801)", () => {
  it("validates a request's references in one call", async () => {
    const company = await newCompany();
    const stranger = await newCompany("Other Builders");
    const by = company.ownerId;
    const projectId = await addProject(company.workspaceId, by, "Tower A");
    const otherProject = await addProject(company.workspaceId, by);
    const member = await addMember(company.workspaceId, by, {});
    const offProject = await addMember(company.workspaceId, by, {});
    await sharedAssign(member.memberId, projectId);
    const contractorOn = await addContractor(company.workspaceId, by, [
      projectId,
    ]);
    const contractorOff = await addContractor(company.workspaceId, by);
    const theirContractor = await addContractor(
      stranger.workspaceId,
      stranger.ownerId,
    );
    const category = await trackingMaster(
      "issue_category",
      company.workspaceId,
      by,
      {
        disabled: true,
      },
    );
    const tag = await trackingMaster("tag", company.workspaceId, by);
    const drawing = await trackingDrawing(company.workspaceId, projectId, by);
    const elsewhere = await trackingDrawing(
      company.workspaceId,
      otherProject,
      by,
    );
    const owner =
      await prisma.constructionOrganizationTeamMember.findFirstOrThrow({
        where: { workspaceId: company.workspaceId, isOwner: true },
      });

    const found = await trackingDirectory.references(
      prisma,
      company.workspaceId,
      projectId,
      {
        memberIds: [member.memberId, offProject.memberId, owner.id],
        contractorIds: [contractorOn, contractorOff, theirContractor],
        issueCategoryIds: [category],
        tagIds: [tag],
        drawingIds: [drawing, elsewhere],
      },
    );
    expect(found.project).toEqual({
      id: projectId,
      name: "Tower A",
      structure: "wings",
    });
    expect(found.members.get(member.memberId)).toMatchObject({
      active: true,
      onProject: true,
    });
    expect(found.members.get(offProject.memberId)?.onProject).toBe(false);
    expect(found.members.get(owner.id)?.onProject).toBe(true);
    expect(found.contractors.get(contractorOn)?.onProject).toBe(true);
    expect(found.contractors.get(contractorOff)?.onProject).toBe(false);
    expect(found.contractors.has(theirContractor)).toBe(false);
    expect(found.issueCategories.get(category)?.disabled).toBe(true);
    expect(found.tags.get(tag)?.disabled).toBe(false);
    expect(found.drawings.get(drawing)?.onProject).toBe(true);
    expect(found.drawings.get(elsewhere)?.onProject).toBe(false);

    const none = await trackingDirectory.references(
      prisma,
      stranger.workspaceId,
      projectId,
      {},
    );
    expect(none.project).toBeNull();
  });

  it("offers pickers on the Project: enabled masters, assigned Contractors", async () => {
    const company = await newCompany();
    const by = company.ownerId;
    const projectId = await addProject(company.workspaceId, by);
    const member = await addMember(company.workspaceId, by, {});
    await sharedAssign(member.memberId, projectId);
    await addMember(company.workspaceId, by, {});
    const contractorOn = await addContractor(company.workspaceId, by, [
      projectId,
    ]);
    await addContractor(company.workspaceId, by);
    const disabled = await trackingMaster(
      "issue_category",
      company.workspaceId,
      by,
      {
        disabled: true,
      },
    );
    const options = await trackingDirectory.options(
      prisma,
      company.workspaceId,
      projectId,
      ["members", "contractors", "issueCategories", "units"],
    );
    expect(options.members.map((item) => item.id)).toContain(member.memberId);
    expect(options.members.every((item) => item.onProject)).toBe(true);
    expect(options.contractors.map((item) => item.id)).toEqual([contractorOn]);
    // The 14 seeds of CM-0019 §1; the disabled one is left out.
    expect(options.issueCategories).toHaveLength(14);
    expect(options.issueCategories.map((item) => item.id)).not.toContain(
      disabled,
    );
    expect(options.units.length).toBeGreaterThan(0);
    expect(options.tags).toEqual([]);
  });
});
