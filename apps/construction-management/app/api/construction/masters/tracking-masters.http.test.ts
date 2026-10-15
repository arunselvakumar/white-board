import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { SEED_ISSUE_CATEGORIES } from "@/src/masters/infrastructure/seed-company-masters";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";
import { trackingIssueRow, trackingTaskRow } from "@/test/tracking";

import { POST as deleteCategory } from "./issue-categories/[id]/delete/route";
import { POST as disableCategory } from "./issue-categories/[id]/disable/route";
import { POST as enableCategory } from "./issue-categories/[id]/enable/route";
import { GET as getCategory } from "./issue-categories/[id]/route";
import { POST as updateCategory } from "./issue-categories/[id]/update/route";
import {
  GET as listCategories,
  POST as createCategory,
} from "./issue-categories/route";
import { POST as deleteTag } from "./tags/[id]/delete/route";
import { POST as updateTag } from "./tags/[id]/update/route";
import { POST as ensureTag } from "./tags/ensure/route";
import { GET as listTags, POST as createTag } from "./tags/route";

const BASE = `${TEST_ORIGIN}/api/construction/masters`;
const CATEGORIES = `${BASE}/issue-categories`;
const TAGS = `${BASE}/tags`;

type Row = {
  id: string;
  name: string;
  isSeed?: boolean;
  disabled?: boolean;
  inUse: boolean;
  updatedAt: string;
};

type List = {
  items: Row[];
  total: number;
  can: { create: boolean; update: boolean; delete: boolean };
};

const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function codeOf(response: Response): Promise<string> {
  return (await json<{ code: string }>(response)).code;
}

describe("Issue Categories (CM-801, ADR CM-0019 §1)", () => {
  it("seeds a new Company with the 14 of modules/05", async () => {
    const company = await ownerWithCompany();
    const list = await json<List>(
      await listCategories(jsonRequest(CATEGORIES, company.cookie)),
    );
    expect(list.items.map((item) => item.name)).toEqual(SEED_ISSUE_CATEGORIES);
    expect(list.total).toBe(14);
    expect(list.items.every((item) => item.isSeed === true)).toBe(true);
    expect(list.can).toEqual({ create: true, update: true, delete: true });
  });

  it("adds, renames (seeds too), disables and keeps names unique in any case", async () => {
    const company = await ownerWithCompany();
    const created = await createCategory(
      jsonRequest(CATEGORIES, company.cookie, { name: "  Waterproofing " }),
    );
    expect(created.status).toBe(StatusCodes.CREATED);
    const row = await json<Row>(created);
    expect(row).toMatchObject({
      name: "Waterproofing",
      isSeed: false,
      disabled: false,
      inUse: false,
    });
    const duplicate = await createCategory(
      jsonRequest(CATEGORIES, company.cookie, { name: "WATERPROOFING" }),
    );
    expect(duplicate.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(duplicate)).toBe("ISSUE_CATEGORY_NAME_IN_USE");
    const empty = await createCategory(
      jsonRequest(CATEGORIES, company.cookie, { name: "   " }),
    );
    expect(await codeOf(empty)).toBe("ISSUE_CATEGORY_NAME_REQUIRED");

    const list = await json<List>(
      await listCategories(jsonRequest(CATEGORIES, company.cookie)),
    );
    const rfi = list.items.find((item) => item.name === "RFI");
    if (rfi == null) throw new Error("No RFI seed");
    const renamed = await updateCategory(
      jsonRequest(`${CATEGORIES}/${rfi.id}/update`, company.cookie, {
        name: "Request for Information",
        expectedUpdatedAt: rfi.updatedAt,
      }),
      params(rfi.id),
    );
    expect(renamed.status).toBe(StatusCodes.OK);
    expect(await json<Row>(renamed)).toMatchObject({
      name: "Request for Information",
      isSeed: true,
    });
    const stale = await updateCategory(
      jsonRequest(`${CATEGORIES}/${rfi.id}/update`, company.cookie, {
        name: "RFI again",
        expectedUpdatedAt: rfi.updatedAt,
      }),
      params(rfi.id),
    );
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(stale)).toBe("ISSUE_CATEGORY_CHANGED");

    const disabled = await disableCategory(
      jsonRequest(`${CATEGORIES}/${row.id}/disable`, company.cookie, {}),
      params(row.id),
    );
    expect((await json<Row>(disabled)).disabled).toBe(true);
    const enabledOnly = await json<List>(
      await listCategories(
        jsonRequest(`${CATEGORIES}?status=enabled`, company.cookie),
      ),
    );
    expect(enabledOnly.items.map((item) => item.id)).not.toContain(row.id);
    const enabled = await enableCategory(
      jsonRequest(`${CATEGORIES}/${row.id}/enable`, company.cookie, {}),
      params(row.id),
    );
    expect((await json<Row>(enabled)).disabled).toBe(false);
    expect(
      await prisma.constructionOrganizationAuditEvent.count({
        where: {
          workspaceId: company.workspaceId,
          entityType: "issue_category",
        },
      }),
    ).toBe(4);
  });

  it("deletes a category only while no live issue names it", async () => {
    const company = await ownerWithCompany();
    const projectId = await addProject(company.workspaceId, company.userId);
    const list = await json<List>(
      await listCategories(jsonRequest(CATEGORIES, company.cookie)),
    );
    const [quality, safety, other] = ["Quality", "Safety", "Other"].map(
      (name) => list.items.find((item) => item.name === name),
    );
    if (quality == null || safety == null || other == null)
      throw new Error("Seeds missing");
    await trackingIssueRow(company.workspaceId, projectId, company.userId, {
      categoryId: quality.id,
    });
    await trackingIssueRow(company.workspaceId, projectId, company.userId, {
      categoryId: safety.id,
      deleted: true,
    });

    const refused = await deleteCategory(
      jsonRequest(`${CATEGORIES}/${quality.id}/delete`, company.cookie, {}),
      params(quality.id),
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(refused)).toBe("ISSUE_CATEGORY_IN_USE");
    const shown = await json<Row>(
      await getCategory(
        jsonRequest(`${CATEGORIES}/${quality.id}`, company.cookie),
        params(quality.id),
      ),
    );
    expect(shown.inUse).toBe(true);

    // A deleted issue does not count; an unused seed can go.
    for (const row of [safety, other])
      expect(
        (
          await deleteCategory(
            jsonRequest(`${CATEGORIES}/${row.id}/delete`, company.cookie, {}),
            params(row.id),
          )
        ).status,
      ).toBe(StatusCodes.NO_CONTENT);
    const after = await json<List>(
      await listCategories(jsonRequest(CATEGORIES, company.cookie)),
    );
    expect(after.total).toBe(12);
    // The name is free again.
    expect(
      (
        await createCategory(
          jsonRequest(CATEGORIES, company.cookie, { name: "other" }),
        )
      ).status,
    ).toBe(StatusCodes.CREATED);
  });

  it("lets a member read without changing, by their grants", async () => {
    const company = await ownerWithCompany();
    const reader = await memberWith(company, {
      "masters.issue_categories": ["read"],
    });
    const list = await json<List>(
      await listCategories(jsonRequest(CATEGORIES, reader.cookie)),
    );
    expect(list.can).toEqual({ create: false, update: false, delete: false });
    const refused = await createCategory(
      jsonRequest(CATEGORIES, reader.cookie, { name: "Electrical" }),
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    const stranger = await memberWith(company, {});
    expect(
      (await listCategories(jsonRequest(CATEGORIES, stranger.cookie))).status,
    ).toBe(StatusCodes.FORBIDDEN);
  });
});

describe("Tags (CM-801, ADR CM-0019 §1)", () => {
  it("adds, renames, ensures inline and keeps names unique in any case", async () => {
    const company = await ownerWithCompany();
    const empty = await json<List>(
      await listTags(jsonRequest(TAGS, company.cookie)),
    );
    expect(empty).toMatchObject({ items: [], total: 0 });

    const created = await createTag(
      jsonRequest(TAGS, company.cookie, { name: "Critical path" }),
    );
    expect(created.status).toBe(StatusCodes.CREATED);
    const tag = await json<Row>(created);
    expect(tag).not.toHaveProperty("disabled");
    const duplicate = await createTag(
      jsonRequest(TAGS, company.cookie, { name: "critical PATH" }),
    );
    expect(await codeOf(duplicate)).toBe("TAG_NAME_IN_USE");

    const found = await ensureTag(
      jsonRequest(`${TAGS}/ensure`, company.cookie, {
        name: " CRITICAL path ",
      }),
    );
    expect(found.status).toBe(StatusCodes.OK);
    expect((await json<Row>(found)).id).toBe(tag.id);
    const made = await ensureTag(
      jsonRequest(`${TAGS}/ensure`, company.cookie, { name: "Monsoon" }),
    );
    expect(made.status).toBe(StatusCodes.CREATED);

    const renamed = await updateTag(
      jsonRequest(`${TAGS}/${tag.id}/update`, company.cookie, {
        name: "Critical",
        expectedUpdatedAt: tag.updatedAt,
      }),
      params(tag.id),
    );
    expect((await json<Row>(renamed)).name).toBe("Critical");
    const list = await json<List>(
      await listTags(jsonRequest(TAGS, company.cookie)),
    );
    expect(list.items.map((item) => item.name)).toEqual([
      "Critical",
      "Monsoon",
    ]);
  });

  it("deletes a tag only while no live task carries it", async () => {
    const company = await ownerWithCompany();
    const projectId = await addProject(company.workspaceId, company.userId);
    const [used, gone] = await Promise.all(
      ["Slab", "Finishing"].map(async (name) =>
        json<Row>(await createTag(jsonRequest(TAGS, company.cookie, { name }))),
      ),
    );
    if (used == null || gone == null) throw new Error("No tags");
    await trackingTaskRow(company.workspaceId, projectId, company.userId, {
      tagIds: [used.id],
    });
    await trackingTaskRow(company.workspaceId, projectId, company.userId, {
      tagIds: [gone.id],
      deleted: true,
    });
    const list = await json<List>(
      await listTags(jsonRequest(TAGS, company.cookie)),
    );
    expect(
      Object.fromEntries(list.items.map((item) => [item.name, item.inUse])),
    ).toEqual({ Finishing: false, Slab: true });

    const refused = await deleteTag(
      jsonRequest(`${TAGS}/${used.id}/delete`, company.cookie, {}),
      params(used.id),
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(refused)).toBe("TAG_IN_USE");
    expect(
      (
        await deleteTag(
          jsonRequest(`${TAGS}/${gone.id}/delete`, company.cookie, {}),
          params(gone.id),
        )
      ).status,
    ).toBe(StatusCodes.NO_CONTENT);
  });

  it("needs Tags Create to create inline", async () => {
    const company = await ownerWithCompany();
    const picker = await memberWith(company, { "masters.tags": ["read"] });
    const refused = await ensureTag(
      jsonRequest(`${TAGS}/ensure`, picker.cookie, { name: "Shuttering" }),
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    const creator = await memberWith(company, {
      "masters.tags": ["create", "read"],
    });
    expect(
      (
        await ensureTag(
          jsonRequest(`${TAGS}/ensure`, creator.cookie, { name: "Shuttering" }),
        )
      ).status,
    ).toBe(StatusCodes.CREATED);
  });

  it("is on /api/docs", async () => {
    const document = await json<{ paths: Record<string, unknown> }>(
      getOpenApi(),
    );
    for (const path of [
      "/api/construction/masters/issue-categories",
      "/api/construction/masters/issue-categories/{id}",
      "/api/construction/masters/issue-categories/{id}/update",
      "/api/construction/masters/issue-categories/{id}/disable",
      "/api/construction/masters/issue-categories/{id}/enable",
      "/api/construction/masters/issue-categories/{id}/delete",
      "/api/construction/masters/tags",
      "/api/construction/masters/tags/ensure",
      "/api/construction/masters/tags/{id}",
      "/api/construction/masters/tags/{id}/update",
      "/api/construction/masters/tags/{id}/delete",
    ])
      expect(document.paths[path], path).toBeDefined();
    expect(
      document.paths["/api/construction/masters/tags/{id}/disable"],
    ).toBeUndefined();
  });
});
