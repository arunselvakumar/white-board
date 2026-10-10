import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { Flag } from "@/src/shared-kernel/access";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import { addMaterial, addOpeningStock } from "@/test/procurement";

import { POST as approve } from "./[id]/approve/route";
import { POST as remove } from "./[id]/delete/route";
import { POST as markOrdered } from "./[id]/mark-ordered/route";
import { GET as pdf } from "./[id]/pdf/route";
import { POST as reject } from "./[id]/reject/route";
import { GET as getOne } from "./[id]/route";
import { POST as update } from "./[id]/update/route";
import { POST as bulkApprove } from "./bulk-approve/route";
import { POST as bulkReject } from "./bulk-reject/route";
import { GET as quantityInfo } from "./quantity-info/route";
import { GET as list, POST as create } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = "http://localhost/api/construction/procurement/purchase-requests";
const TODAY = todayIn("Asia/Kolkata");
const MENU = "procurement.purchase_requests";

type Pr = {
  id: string;
  number: string;
  projectId: string;
  approvalStatus: string;
  orderStatus: string;
  rejectionReason: string | null;
  updatedAt: string;
  commonRemark: string | null;
  requestDate: string;
  createdBy: { userId: string; name: string | null };
  items: {
    materialId: string;
    materialName: string;
    quantity: string;
    remark: string | null;
    pendingQty: string;
  }[];
  actions: Record<string, boolean>;
};

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function post(path: string, body: unknown): Request {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const get = (path: string) => new Request(`${BASE}${path}`);

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function code(response: Response): Promise<string> {
  return (await json<{ code: string }>(response)).code;
}

async function setup() {
  const company = await newCompany();
  const owner = { userId: company.ownerId, workspaceId: company.workspaceId };
  const projectId = await addProject(
    company.workspaceId,
    company.ownerId,
    "Tower A",
  );
  const cement = await addMaterial(company.workspaceId, company.ownerId, {
    name: "Cement OPC 53 Grade",
  });
  const sand = await addMaterial(company.workspaceId, company.ownerId, {
    name: "M Sand",
    uomId: cement.uomId,
  });
  actAs({ ...owner, role: "owner" });
  return { company, owner, projectId, cement, sand };
}

async function member(
  ctx: Awaited<ReturnType<typeof setup>>,
  flags: Flag[],
  onProject = true,
) {
  const added = await addMember(ctx.company.workspaceId, ctx.company.ownerId, {
    [MENU]: flags,
  });
  if (onProject)
    await prisma.constructionOrganizationTeamMemberProject.create({
      data: { memberId: added.memberId, projectId: ctx.projectId },
    });
  return {
    userId: added.userId,
    workspaceId: ctx.company.workspaceId,
    role: "member" as const,
  };
}

async function raise(
  ctx: Awaited<ReturnType<typeof setup>>,
  patch: Record<string, unknown> = {},
): Promise<Response> {
  return create(
    post("", {
      projectId: ctx.projectId,
      requestDate: TODAY,
      requiredDate: addDays(TODAY, 7),
      commonRemark: "For the 3rd floor slab",
      items: [
        { materialId: ctx.cement.id, quantity: "100" },
        { materialId: ctx.sand.id, quantity: "2.5" },
      ],
      ...patch,
    }),
  );
}

describe("Purchase Requests", () => {
  it("raises, numbers, reads and lists a request", async () => {
    const ctx = await setup();
    const response = await raise(ctx);
    expect(response.status).toBe(StatusCodes.CREATED);
    const pr = await json<Pr>(response);
    expect(pr.number).toMatch(/^PR\//);
    expect(pr.approvalStatus).toBe("pending");
    expect(pr.orderStatus).toBe("not_ordered");
    expect(pr.commonRemark).toBe("For the 3rd floor slab");
    expect(pr.items.map((item) => [item.materialName, item.quantity])).toEqual([
      ["Cement OPC 53 Grade", "100.000"],
      ["M Sand", "2.500"],
    ]);
    expect(pr.actions).toMatchObject({
      edit: true,
      approve: true,
      markOrdered: false,
    });

    const second = await json<Pr>(
      await raise(ctx, { items: [{ materialId: ctx.sand.id, quantity: "1" }] }),
    );
    expect(second.number).not.toBe(pr.number);

    const one = await getOne(get(`/${pr.id}`), params(pr.id));
    expect(one.status).toBe(StatusCodes.OK);
    expect(
      (await json<Pr & { purchaseOrders: unknown[] }>(one)).purchaseOrders,
    ).toEqual([]);

    const page = await json<{
      items: Pr[];
      total: number;
      facets: { materials: { name: string }[]; creators: unknown[] };
    }>(await list(get(`?projectId=${ctx.projectId}`)));
    expect(page.total).toBe(2);
    expect(page.items[0]?.id).toBe(second.id);
    expect(page.facets.materials.map((m) => m.name)).toEqual([
      "Cement OPC 53 Grade",
      "M Sand",
    ]);
    expect(page.facets.creators).toHaveLength(1);

    const byMaterial = await json<{ total: number }>(
      await list(
        get(`?projectId=${ctx.projectId}&materialId=${ctx.cement.id}`),
      ),
    );
    expect(byMaterial.total).toBe(1);
    const paged = await json<{ items: Pr[]; nextCursor: string | null }>(
      await list(get(`?projectId=${ctx.projectId}&limit=1`)),
    );
    expect(paged.items).toHaveLength(1);
    const next = await json<{ items: Pr[]; prevCursor: string | null }>(
      await list(
        get(
          `?projectId=${ctx.projectId}&limit=1&after=${paged.nextCursor ?? ""}`,
        ),
      ),
    );
    expect(next.items[0]?.id).toBe(pr.id);
    expect(next.prevCursor).not.toBeNull();
  });

  it("validates materials, dates and quantities", async () => {
    const ctx = await setup();
    const unknown = await raise(ctx, {
      items: [{ materialId: newId(), quantity: "1" }],
    });
    expect(unknown.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await code(unknown)).toBe("MATERIAL_NOT_FOUND");
    const early = await raise(ctx, { requiredDate: addDays(TODAY, -1) });
    expect(await code(early)).toBe("REQUIRED_DATE_BEFORE_REQUEST_DATE");
    const future = await raise(ctx, {
      requestDate: addDays(TODAY, 1),
      requiredDate: null,
    });
    expect(await code(future)).toBe("DATE_IN_FUTURE");
    const zero = await raise(ctx, {
      items: [{ materialId: ctx.cement.id, quantity: "0" }],
    });
    expect(await code(zero)).toBe("QUANTITY_INVALID");
    const location = await raise(ctx, {
      siteLocation: { type: "location", locationId: newId() },
    });
    expect(await code(location)).toBe("LOCATION_NOT_ON_PROJECT");
    const project = await create(
      post("", {
        projectId: newId(),
        requestDate: TODAY,
        items: [{ materialId: ctx.cement.id, quantity: "1" }],
      }),
    );
    expect(await code(project)).toBe("PROJECT_NOT_FOUND");
  });

  it("keeps per-line remarks only with separate remarks", async () => {
    const ctx = await setup();
    const pr = await json<Pr>(
      await raise(ctx, {
        separateRemarks: true,
        commonRemark: "ignored",
        items: [
          {
            materialId: ctx.cement.id,
            quantity: "10",
            remark: "53 grade only",
          },
        ],
      }),
    );
    expect(pr.commonRemark).toBeNull();
    expect(pr.items[0]?.remark).toBe("53 grade only");
  });

  it("needs the flags: create, Save & Approve, the Project", async () => {
    const ctx = await setup();
    actAs(await member(ctx, ["read"]));
    expect((await raise(ctx)).status).toBe(StatusCodes.FORBIDDEN);
    actAs(await member(ctx, ["read", "create"]));
    expect((await raise(ctx)).status).toBe(StatusCodes.CREATED);
    const noApprove = await raise(ctx, { approve: true });
    expect(noApprove.status).toBe(StatusCodes.FORBIDDEN);
    actAs(await member(ctx, ["read", "create", "approve"], false));
    expect((await raise(ctx)).status).toBe(StatusCodes.FORBIDDEN);
    actAs(await member(ctx, ["read", "create", "approve"]));
    const approved = await json<Pr>(await raise(ctx, { approve: true }));
    expect(approved.approvalStatus).toBe("approved");
    // Approve also allows Mark as Ordered.
    expect(approved.actions).toMatchObject({
      edit: false,
      approve: false,
      markOrdered: true,
    });
  });

  it("hides another Company's request (404)", async () => {
    const ctx = await setup();
    const pr = await json<Pr>(await raise(ctx));
    const other = await newCompany("Other Builders");
    actAs({
      userId: other.ownerId,
      workspaceId: other.workspaceId,
      role: "owner",
    });
    expect((await getOne(get(`/${pr.id}`), params(pr.id))).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    expect(
      (await approve(post(`/${pr.id}/approve`, {}), params(pr.id))).status,
    ).toBe(StatusCodes.NOT_FOUND);
  });

  it("edits a pending or rejected request, never an approved one", async () => {
    const ctx = await setup();
    const pr = await json<Pr>(await raise(ctx));
    const body = (updatedAt: string, patch: Record<string, unknown> = {}) => ({
      expectedUpdatedAt: updatedAt,
      requestDate: TODAY,
      items: [{ materialId: ctx.sand.id, quantity: "4" }],
      ...patch,
    });
    const edited = await json<Pr>(
      await update(post(`/${pr.id}/update`, body(pr.updatedAt)), params(pr.id)),
    );
    expect(edited.items.map((item) => item.quantity)).toEqual(["4.000"]);
    const stale = await update(
      post(`/${pr.id}/update`, body(pr.updatedAt)),
      params(pr.id),
    );
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await code(stale)).toBe("PURCHASE_REQUEST_CHANGED");

    const rejected = await json<Pr>(
      await reject(
        post(`/${pr.id}/reject`, { reason: "Wrong grade" }),
        params(pr.id),
      ),
    );
    expect(rejected).toMatchObject({
      approvalStatus: "rejected",
      rejectionReason: "Wrong grade",
    });
    const again = await reject(
      post(`/${pr.id}/reject`, { reason: "x" }),
      params(pr.id),
    );
    expect(await code(again)).toBe("PURCHASE_REQUEST_NOT_PENDING");
    const resubmitted = await json<Pr>(
      await update(
        post(`/${pr.id}/update`, body(rejected.updatedAt)),
        params(pr.id),
      ),
    );
    expect(resubmitted.approvalStatus).toBe("pending");
    expect(resubmitted.rejectionReason).toBeNull();

    const approved = await json<Pr>(
      await approve(post(`/${pr.id}/approve`, {}), params(pr.id)),
    );
    expect(approved.approvalStatus).toBe("approved");
    const refused = await update(
      post(`/${pr.id}/update`, body(approved.updatedAt)),
      params(pr.id),
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await code(refused)).toBe("PURCHASE_REQUEST_NOT_EDITABLE");
  });

  it("marks approved requests as ordered, refuses pending ones", async () => {
    const ctx = await setup();
    const pr = await json<Pr>(await raise(ctx));
    const pending = await markOrdered(
      post(`/${pr.id}/mark-ordered`, {}),
      params(pr.id),
    );
    expect(pending.status).toBe(StatusCodes.CONFLICT);
    expect(await code(pending)).toBe("PURCHASE_REQUEST_NOT_ORDERABLE");
    await approve(post(`/${pr.id}/approve`, {}), params(pr.id));
    const ordered = await json<Pr>(
      await markOrdered(post(`/${pr.id}/mark-ordered`, {}), params(pr.id)),
    );
    expect(ordered.orderStatus).toBe("ordered");
    const twice = await markOrdered(
      post(`/${pr.id}/mark-ordered`, {}),
      params(pr.id),
    );
    expect(await code(twice)).toBe("PURCHASE_REQUEST_NOT_ORDERABLE");
    const filtered = await json<{ total: number }>(
      await list(get(`?projectId=${ctx.projectId}&orderStatus=ordered`)),
    );
    expect(filtered.total).toBe(1);
  });

  it("bulk approves and rejects all or none", async () => {
    const ctx = await setup();
    const a = await json<Pr>(await raise(ctx));
    const b = await json<Pr>(await raise(ctx));
    const c = await json<Pr>(await raise(ctx));
    await approve(post(`/${c.id}/approve`, {}), params(c.id));
    const refused = await bulkApprove(
      post("/bulk-approve", { projectId: ctx.projectId, ids: [a.id, c.id] }),
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    const body = await json<{
      code: string;
      details: { refusals: { id: string; code: string }[] };
    }>(refused);
    expect(body.code).toBe("BULK_DECISION_REFUSED");
    expect(body.details.refusals).toEqual([
      expect.objectContaining({
        id: c.id,
        code: "PURCHASE_REQUEST_NOT_PENDING",
      }),
    ]);
    const stillPending = await json<Pr>(
      await getOne(get(`/${a.id}`), params(a.id)),
    );
    expect(stillPending.approvalStatus).toBe("pending");

    const otherProject = await addProject(
      ctx.company.workspaceId,
      ctx.company.ownerId,
    );
    const wrong = await bulkReject(
      post("/bulk-reject", {
        projectId: otherProject,
        ids: [a.id],
        reason: "No",
      }),
    );
    expect(await code(wrong)).toBe("BULK_DECISION_REFUSED");

    const ok = await bulkReject(
      post("/bulk-reject", {
        projectId: ctx.projectId,
        ids: [a.id, b.id],
        reason: "Over budget",
      }),
    );
    expect(await json(ok)).toEqual({ decided: 2 });
    const rejected = await json<{ total: number }>(
      await list(get(`?projectId=${ctx.projectId}&approvalStatus=rejected`)),
    );
    expect(rejected.total).toBe(2);

    actAs(await member(ctx, ["read", "approve"]));
    const noReject = await bulkReject(
      post("/bulk-reject", {
        projectId: ctx.projectId,
        ids: [c.id],
        reason: "x",
      }),
    );
    expect(noReject.status).toBe(StatusCodes.FORBIDDEN);
  });

  it("deletes a request; it is gone from reads", async () => {
    const ctx = await setup();
    const pr = await json<Pr>(await raise(ctx));
    const stale = await remove(
      post(`/${pr.id}/delete`, {
        expectedUpdatedAt: new Date(0).toISOString(),
      }),
      params(pr.id),
    );
    expect(await code(stale)).toBe("PURCHASE_REQUEST_CHANGED");
    const deleted = await remove(
      post(`/${pr.id}/delete`, { expectedUpdatedAt: pr.updatedAt }),
      params(pr.id),
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    expect((await getOne(get(`/${pr.id}`), params(pr.id))).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    const page = await json<{ total: number }>(
      await list(get(`?projectId=${ctx.projectId}`)),
    );
    expect(page.total).toBe(0);
  });

  it("applies the back-dated limit to the Request Date", async () => {
    const ctx = await setup();
    await prisma.constructionOrganizationBackdatedEntryPolicy.create({
      data: {
        id: newId(),
        workspaceId: ctx.company.workspaceId,
        createDays: 0,
        createOverrideDesignationIds: [],
        editDays: 0,
        editOverrideDesignationIds: [],
        modules: {
          purchase_request: {
            mode: "custom",
            create: { days: 3, overrideDesignationIds: [] },
            edit: { days: 3, overrideDesignationIds: [] },
          },
        },
        createdBy: ctx.company.ownerId,
        updatedBy: ctx.company.ownerId,
      },
    });
    actAs(await member(ctx, ["read", "create"]));
    const old = await raise(ctx, {
      requestDate: addDays(TODAY, -10),
      requiredDate: null,
    });
    expect(old.status).toBe(StatusCodes.FORBIDDEN);
    expect(await code(old)).toBe("BACKDATED_CREATE_BLOCKED");
    expect(
      (
        await raise(ctx, {
          requestDate: addDays(TODAY, -2),
          requiredDate: null,
        })
      ).status,
    ).toBe(StatusCodes.CREATED);
  });

  it("shows Available Stock and Balanced estimated qty", async () => {
    const ctx = await setup();
    const location = { kind: "project" as const, id: ctx.projectId };
    await addOpeningStock(
      ctx.company.workspaceId,
      ctx.company.ownerId,
      location,
      ctx.cement.id,
      "40",
    );
    await prisma.constructionProcurementStockSetting.create({
      data: {
        id: newId(),
        workspaceId: ctx.company.workspaceId,
        locationKind: "project",
        locationId: ctx.projectId,
        materialId: ctx.cement.id,
        estimatedQty: "500",
        createdBy: ctx.company.ownerId,
        updatedBy: ctx.company.ownerId,
      },
    });
    await raise(ctx); // 100 cement requested, not yet ordered
    const response = await quantityInfo(
      get(
        `/quantity-info?projectId=${ctx.projectId}&materialIds=${ctx.cement.id},${ctx.sand.id}`,
      ),
    );
    expect(response.status).toBe(StatusCodes.OK);
    expect((await json<{ items: unknown[] }>(response)).items).toEqual([
      {
        materialId: ctx.cement.id,
        availableStock: "40.000",
        estimatedQty: "500.000",
        onTheWay: "100.000",
        balancedEstimatedQty: "360.000",
      },
      {
        materialId: ctx.sand.id,
        availableStock: "0.000",
        estimatedQty: null,
        onTheWay: "2.500",
        balancedEstimatedQty: null,
      },
    ]);
  });

  it("prints the PDF with print, refuses without it", async () => {
    const ctx = await setup();
    const pr = await json<Pr>(await raise(ctx));
    const response = await pdf(get(`/${pr.id}/pdf?inline=1`), params(pr.id));
    expect(response.status).toBe(StatusCodes.OK);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toMatch(
      /^inline; filename="PR-/,
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    actAs(await member(ctx, ["read"]));
    expect((await pdf(get(`/${pr.id}/pdf`), params(pr.id))).status).toBe(
      StatusCodes.FORBIDDEN,
    );
  });

  it("is on /api/docs", async () => {
    const document = await json<{ paths: Record<string, unknown> }>(
      getOpenApi(),
    );
    for (const path of [
      "/api/construction/procurement/purchase-requests",
      "/api/construction/procurement/purchase-requests/{id}",
      "/api/construction/procurement/purchase-requests/{id}/approve",
      "/api/construction/procurement/purchase-requests/bulk-reject",
      "/api/construction/procurement/purchase-requests/quantity-info",
      "/api/construction/procurement/purchase-requests/{id}/pdf",
    ])
      expect(document.paths[path], path).toBeDefined();
  });
});
