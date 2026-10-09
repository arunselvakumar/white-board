import { randomUUID } from "node:crypto";

import { getCompanyAuthFromHeaders } from "@repo/auth/construction/server";
import { companyAuthStateFor } from "@repo/auth/construction/testing";
import { prisma } from "@repo/db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { nextSequenceNumber } from "@/src/shared-kernel/sequence/next-sequence-number";
import { addProject } from "@/test/companies";

import { POST as deleteRule } from "./[id]/delete/route";
import { POST as updateRule } from "./[id]/update/route";
import { GET as listRules, POST as createRule } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const mockedAuth = vi.mocked(getCompanyAuthFromHeaders);

const BASE =
  "http://localhost/api/construction/organization/settings/sequence-rules";

type RuleBody = {
  id: string;
  module: string;
  scope: string;
  projectId: string | null;
  isDefault: boolean;
  prefix: string;
  projectToken: string;
  startNumber: number;
  padding: number;
  separator: string;
  fiscalYearToken: boolean;
  issued: boolean;
  updatedAt: string;
};

function session(input: {
  userId: string | null;
  workspaceId: string | null;
  role?: "owner" | "member";
}) {
  mockedAuth.mockResolvedValue(companyAuthStateFor(input));
}

function owner(): { workspaceId: string; userId: string } {
  const company = { workspaceId: randomUUID(), userId: randomUUID() };
  session(company);
  return company;
}

const post = (url: string, body?: unknown) =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? null : JSON.stringify(body),
  });

const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

const SETTINGS = {
  prefix: "PR",
  projectToken: "",
  startNumber: 1,
  padding: 5,
  separator: "/",
  fiscalYearToken: true,
};

async function create(body: Record<string, unknown>): Promise<Response> {
  return createRule(
    post(BASE, {
      module: "purchase_request",
      projectId: null,
      ...SETTINGS,
      ...body,
    }),
  );
}

describe("Sequence ID rules HTTP (CM-114)", () => {
  it("is 401 without a Session and 403 for a Member without Settings", async () => {
    session({ userId: null, workspaceId: null });
    expect((await listRules(new Request(BASE))).status).toBe(
      StatusCodes.UNAUTHORIZED,
    );
    session({ userId: "user-x", workspaceId: randomUUID(), role: "member" });
    const denied = await create({});
    expect(denied.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(denied)).toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("creates one default per module and lists it", async () => {
    owner();
    const empty = await json<{ items: RuleBody[]; total: number }>(
      await listRules(new Request(BASE)),
    );
    expect(empty).toEqual({ items: [], total: 0 });

    const created = await create({ projectToken: "HO", startNumber: 10 });
    expect(created.status).toBe(StatusCodes.CREATED);
    const rule = await json<RuleBody>(created);
    expect(rule).toMatchObject({
      module: "purchase_request",
      scope: "workspace",
      isDefault: true,
      projectToken: "HO",
      startNumber: 10,
      issued: false,
    });

    const second = await create({ prefix: "PRQ" });
    expect(second.status).toBe(StatusCodes.CONFLICT);
    expect(await json(second)).toMatchObject({ code: "SEQUENCE_RULE_EXISTS" });

    await create({ module: "purchase_order", prefix: "PO" });
    const all = await json<{ items: RuleBody[]; total: number }>(
      await listRules(new Request(BASE)),
    );
    expect(all.items.map((item) => item.module)).toEqual([
      "purchase_request",
      "purchase_order",
    ]);
    const filtered = await json<{ items: RuleBody[]; total: number }>(
      await listRules(new Request(`${BASE}?module=purchase_order`)),
    );
    expect(filtered.total).toBe(1);
  });

  it("allows one rule per Project beside the default", async () => {
    const company = owner();
    const projectId = await addProject(company.workspaceId, company.userId);
    await create({});
    const project = await create({ projectId, projectToken: "P1" });
    expect(project.status).toBe(StatusCodes.CREATED);
    expect(await json(project)).toMatchObject({
      scope: "project",
      isDefault: false,
      projectId,
    });
    expect((await create({ projectId })).status).toBe(StatusCodes.CONFLICT);
    // Only a live Project of the Company may have a rule (CM-204).
    const unknown = await create({ projectId: randomUUID() });
    expect(unknown.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(unknown)).toMatchObject({ code: "PROJECT_NOT_FOUND" });
  });

  it("rejects invalid settings", async () => {
    owner();
    const zero = await create({ startNumber: 0 });
    expect(zero.status).toBe(StatusCodes.BAD_REQUEST);
    const spaced = await create({ prefix: "P R" });
    expect(spaced.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(spaced)).toMatchObject({
      code: "SEQUENCE_PREFIX_INVALID",
    });
  });

  it("updates the format with optimistic concurrency and audits it", async () => {
    const company = owner();
    const rule = await json<RuleBody>(await create({}));
    const updated = await updateRule(
      post(`${BASE}/${rule.id}/update`, {
        ...SETTINGS,
        prefix: "IND",
        separator: "-",
        expectedUpdatedAt: rule.updatedAt,
      }),
      params(rule.id),
    );
    expect(updated.status).toBe(StatusCodes.OK);
    expect(await json(updated)).toMatchObject({
      prefix: "IND",
      separator: "-",
      isDefault: true,
    });

    const stale = await updateRule(
      post(`${BASE}/${rule.id}/update`, {
        ...SETTINGS,
        expectedUpdatedAt: rule.updatedAt,
      }),
      params(rule.id),
    );
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await json(stale)).toMatchObject({ code: "SEQUENCE_RULE_CHANGED" });

    const audit = await prisma.constructionOrganizationAuditEvent.findMany({
      where: { workspaceId: company.workspaceId, entityId: rule.id },
      orderBy: { occurredAt: "asc" },
    });
    expect(audit.map((event) => event.action)).toEqual([
      "sequence_rule.created",
      "sequence_rule.updated",
    ]);
    expect(audit[1]?.before).toMatchObject({ prefix: "PR" });
    expect(audit[1]?.after).toMatchObject({ prefix: "IND" });

    const missing = await updateRule(
      post(`${BASE}/${randomUUID()}/update`, {
        ...SETTINGS,
        expectedUpdatedAt: rule.updatedAt,
      }),
      params(randomUUID()),
    );
    expect(missing.status).toBe(StatusCodes.NOT_FOUND);
  });

  it("deletes an unused rule but not one that issued a number", async () => {
    const company = owner();
    const unused = await json<RuleBody>(
      await create({ module: "delivery_note", prefix: "DN" }),
    );
    expect(
      (await deleteRule(post(`${BASE}/${unused.id}/delete`), params(unused.id)))
        .status,
    ).toBe(StatusCodes.NO_CONTENT);
    expect(
      (await deleteRule(post(`${BASE}/${unused.id}/delete`), params(unused.id)))
        .status,
    ).toBe(StatusCodes.NOT_FOUND);

    const used = await json<RuleBody>(await create({}));
    await prisma.$transaction((tx) =>
      nextSequenceNumber(tx, {
        workspaceId: company.workspaceId,
        module: "purchase_request",
        projectId: null,
        date: "2026-10-08",
        by: company.userId,
      }),
    );
    const listed = await json<{ items: RuleBody[] }>(
      await listRules(new Request(`${BASE}?module=purchase_request`)),
    );
    expect(listed.items[0]?.issued).toBe(true);
    const refused = await deleteRule(
      post(`${BASE}/${used.id}/delete`),
      params(used.id),
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await json(refused)).toMatchObject({
      code: "SEQUENCE_RULE_IN_USE",
    });
  });

  it("is on /api/docs with ConstructionOrganization components", async () => {
    const spec = await json<{
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    const base = "/api/construction/organization/settings/sequence-rules";
    expect(spec.paths[base]?.["get"]).toBeDefined();
    expect(spec.paths[base]?.["post"]).toBeDefined();
    expect(spec.paths[`${base}/{id}/update`]?.["post"]).toBeDefined();
    expect(spec.paths[`${base}/{id}/delete`]?.["post"]).toBeDefined();
    expect(
      spec.components.schemas[
        "CreateConstructionOrganizationSequenceRuleRequest"
      ],
    ).toBeDefined();
  });
});
