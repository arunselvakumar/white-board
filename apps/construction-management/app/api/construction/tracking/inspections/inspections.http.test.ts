import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { POST as deleteDrawing } from "@/app/api/construction/projects/projects/[id]/drawings/[drawingId]/delete/route";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { Flag } from "@/src/shared-kernel/access";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import { addContractor } from "@/test/procurement";
import {
  sharedAssign,
  worksheetDepartment,
  worksheetLocation,
} from "@/test/site-work";
import { pngBytes } from "@/test/files";
import { trackingDrawing, trackingIssueRow } from "@/test/tracking";

import { POST as removeFile } from "../documents/[type]/[id]/files/[fileId]/delete/route";
import { GET as listFiles } from "../documents/[type]/[id]/files/route";
import { POST as startUpload } from "../documents/[type]/[id]/files/uploads/route";
import {
  jsonPost,
  trackingDocumentBase,
  trackingDocumentParams,
  trackingFileParams,
  uploadTrackingFile,
} from "../documents/document-test-fixtures";

import { POST as approve } from "./[id]/approve/route";
import { POST as remove } from "./[id]/delete/route";
import { POST as deleteObservation } from "./[id]/observations/[observationId]/delete/route";
import {
  GET as listObservations,
  POST as observe,
} from "./[id]/observations/route";
import { GET as reinspection } from "./[id]/reinspection/route";
import { POST as reject } from "./[id]/reject/route";
import { GET as listRemarks, POST as remark } from "./[id]/remarks/route";
import { GET as getOne } from "./[id]/route";
import { POST as update } from "./[id]/update/route";
import { POST as bulkApprove } from "./bulk-approve/route";
import { POST as bulkReject } from "./bulk-reject/route";
import { GET as formOptions } from "./form-options/route";
import { GET as list, POST as create } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = "http://localhost/api/construction/tracking/inspections";
const TODAY = todayIn("Asia/Kolkata");
const MENU = "tracking.inspection_requests";

type Ref = { id: string; number: string; status: string };
type Inspection = {
  id: string;
  number: string;
  inspectionDate: string;
  inspectionTime: string | null;
  status: string;
  department: { id: string; name: string | null } | null;
  contractor: { id: string; name: string | null } | null;
  inspector: { memberId: string; name: string | null } | null;
  workDescription: string;
  siteLocation: unknown;
  drawings: {
    id: string;
    name: string | null;
    albumId: string | null;
    albumName: string | null;
  }[];
  decidedAt: string | null;
  decidedBy: { userId: string; name: string | null } | null;
  rejectionReason: string | null;
  reinspectionOf: Ref | null;
  reinspections: Ref[];
  snags: { id: string; number: string }[];
  updatedAt: string;
  actions: {
    edit: boolean;
    delete: boolean;
    approve: boolean;
    reject: boolean;
    observe: boolean;
    remark: boolean;
    reinspect: boolean;
    raiseSnag: boolean;
    print: boolean;
  };
};
type Page = {
  items: Inspection[];
  total: number;
  counts: Record<string, number>;
};
type ErrorBody = {
  code: string;
  details?: { field?: string; ids?: string[] };
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

async function setup() {
  const company = await newCompany();
  const by = company.ownerId;
  const owner = {
    userId: by,
    workspaceId: company.workspaceId,
    role: "owner" as const,
  };
  const projectId = await addProject(company.workspaceId, by, "Tower A");
  const contractorId = await addContractor(company.workspaceId, by, [
    projectId,
  ]);
  const departmentId = await worksheetDepartment(company.workspaceId, by, {
    name: "Civil",
  });
  actAs(owner);
  return { company, by, owner, projectId, contractorId, departmentId };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function member(
  ctx: Ctx,
  grants: Record<string, Flag[]>,
  onProject = true,
) {
  const added = await addMember(ctx.company.workspaceId, ctx.by, grants);
  if (onProject) await sharedAssign(added.memberId, ctx.projectId);
  return {
    memberId: added.memberId,
    actor: {
      userId: added.userId,
      workspaceId: ctx.company.workspaceId,
      role: "member" as const,
    },
  };
}

function raise(ctx: Ctx, patch: Record<string, unknown> = {}) {
  return create(
    post("", {
      projectId: ctx.projectId,
      inspectionDate: TODAY,
      inspectionTime: "10:30",
      workDescription: "Slab reinforcement before the pour",
      contractorId: ctx.contractorId,
      departmentId: ctx.departmentId,
      ...patch,
    }),
  );
}

async function raised(ctx: Ctx, patch: Record<string, unknown> = {}) {
  const response = await raise(ctx, patch);
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<Inspection>(response);
}

const one = async (id: string) =>
  json<Inspection>(await getOne(get(`/${id}`), params(id)));

describe("Inspection Requests (CM-804)", () => {
  it("numbers requests from the InspectionRequest rule and never reuses one", async () => {
    const ctx = await setup();
    const first = await raised(ctx);
    expect(first).toMatchObject({
      number: "IR/26-27/00001",
      status: "pending",
      inspectionTime: "10:30",
      contractor: { id: ctx.contractorId },
      department: { id: ctx.departmentId, name: "Civil" },
      inspector: null,
      reinspectionOf: null,
      actions: {
        edit: true,
        delete: true,
        approve: true,
        reject: true,
        observe: true,
        remark: true,
        reinspect: false,
        raiseSnag: true,
      },
    });
    const second = await raised(ctx);
    expect(second.number).toBe("IR/26-27/00002");
    expect(
      (
        await remove(
          post(`/${second.id}/delete`, { expectedUpdatedAt: second.updatedAt }),
          params(second.id),
        )
      ).status,
    ).toBe(StatusCodes.NO_CONTENT);
    expect((await raised(ctx)).number).toBe("IR/26-27/00003");
  });

  it("honours the Project's own numbering rule", async () => {
    const ctx = await setup();
    await prisma.constructionOrganizationSequenceRule.create({
      data: {
        id: newId(),
        workspaceId: ctx.company.workspaceId,
        module: "inspection_request",
        projectId: ctx.projectId,
        prefix: "QC",
        projectToken: "TA",
        startNumber: 7,
        padding: 3,
        createdBy: ctx.by,
        updatedBy: ctx.by,
      },
    });
    expect((await raised(ctx)).number).toBe("QC/26-27/TA/007");
    const other = await addProject(ctx.company.workspaceId, ctx.by);
    expect(
      (
        await raised(ctx, {
          projectId: other,
          contractorId: null,
        })
      ).number,
    ).toBe("IR/26-27/00001");
  });

  it("checks the inspector, contractor, department, drawings and location against the Project", async () => {
    const ctx = await setup();
    const inspector = await member(ctx, { [MENU]: ["read"] });
    const offProject = await member(ctx, { [MENU]: ["read"] }, false);
    const drawing = await trackingDrawing(
      ctx.company.workspaceId,
      ctx.projectId,
      ctx.by,
    );
    const otherProject = await addProject(ctx.company.workspaceId, ctx.by);
    const elsewhere = await trackingDrawing(
      ctx.company.workspaceId,
      otherProject,
      ctx.by,
    );
    const locationId = await worksheetLocation(
      ctx.company.workspaceId,
      ctx.by,
      ctx.projectId,
    );
    const ok = await raised(ctx, {
      inspectorMemberId: inspector.memberId,
      drawingIds: [drawing],
      siteLocation: { type: "location", locationId },
    });
    expect(ok.inspector).toEqual({
      memberId: inspector.memberId,
      name: "Prabhu Saravanan",
    });
    expect(ok.drawings).toEqual([
      expect.objectContaining({ id: drawing, name: "Ground floor slab" }),
    ]);
    expect(ok.drawings[0]?.albumId).toEqual(expect.any(String));
    expect(ok.siteLocation).toEqual({ type: "location", locationId });

    const cases: [Record<string, unknown>, string, string][] = [
      [
        { inspectorMemberId: offProject.memberId },
        "INSPECTOR_NOT_ON_PROJECT",
        "inspectorMemberId",
      ],
      [{ drawingIds: [elsewhere] }, "DRAWING_NOT_FOUND", "drawingIds"],
      [
        {
          contractorId: await addContractor(ctx.company.workspaceId, ctx.by),
        },
        "CONTRACTOR_NOT_ON_PROJECT",
        "contractorId",
      ],
      [
        {
          departmentId: await worksheetDepartment(
            ctx.company.workspaceId,
            ctx.by,
            { disabled: true },
          ),
        },
        "DEPARTMENT_DISABLED",
        "departmentId",
      ],
      [
        { inspectionTime: "25:00" },
        "INSPECTION_TIME_INVALID",
        "inspectionTime",
      ],
      [
        { workDescription: "  " },
        "INSPECTION_DESCRIPTION_REQUIRED",
        "workDescription",
      ],
    ];
    for (const [patch, code, field] of cases) {
      const response = await raise(ctx, patch);
      expect(response.status).toBe(StatusCodes.BAD_REQUEST);
      const body = await json<ErrorBody>(response);
      expect(body.code).toBe(code);
      expect(body.details?.field).toBe(field);
    }
    const located = await raise(ctx, {
      siteLocation: {
        type: "location",
        locationId: await worksheetLocation(
          ctx.company.workspaceId,
          ctx.by,
          otherProject,
        ),
      },
    });
    expect(located.status).toBe(StatusCodes.BAD_REQUEST);
  });

  it("checks the flags: create, update, delete, approve and reject apart", async () => {
    const ctx = await setup();
    const pending = await raised(ctx);
    const reader = await member(ctx, { [MENU]: ["read"] });
    actAs(reader.actor);
    expect((await raise(ctx)).status).toBe(StatusCodes.FORBIDDEN);
    expect(
      (await approve(post(`/${pending.id}/approve`, {}), params(pending.id)))
        .status,
    ).toBe(StatusCodes.FORBIDDEN);
    const seen = await one(pending.id);
    expect(seen.actions).toMatchObject({
      edit: false,
      delete: false,
      approve: false,
      reject: false,
      observe: false,
      remark: true,
      raiseSnag: false,
    });

    const approver = await member(ctx, { [MENU]: ["read", "approve"] });
    actAs(approver.actor);
    expect(
      (
        await reject(
          post(`/${pending.id}/reject`, { reason: "No" }),
          params(pending.id),
        )
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
    const approved = await approve(
      post(`/${pending.id}/approve`, { expectedUpdatedAt: pending.updatedAt }),
      params(pending.id),
    );
    expect(approved.status).toBe(StatusCodes.OK);
    expect(await json<Inspection>(approved)).toMatchObject({
      status: "approved",
      decidedBy: { userId: approver.actor.userId },
      rejectionReason: null,
    });

    // A member off the Project gets 403 even with the grants.
    const away = await member(ctx, { [MENU]: ["read", "create"] }, false);
    actAs(away.actor);
    expect(
      (await getOne(get(`/${pending.id}`), params(pending.id))).status,
    ).toBe(StatusCodes.FORBIDDEN);
  });

  it("keeps a decided request read-only except for remarks", async () => {
    const ctx = await setup();
    const request = await raised(ctx);
    const rejected = await reject(
      post(`/${request.id}/reject`, { reason: "  " }),
      params(request.id),
    );
    expect((await json<ErrorBody>(rejected)).code).toBe(
      "REJECTION_REASON_REQUIRED",
    );
    const done = await json<Inspection>(
      await reject(
        post(`/${request.id}/reject`, { reason: "Cover blocks missing" }),
        params(request.id),
      ),
    );
    expect(done).toMatchObject({
      status: "rejected",
      rejectionReason: "Cover blocks missing",
      snags: [],
      actions: {
        edit: false,
        delete: false,
        approve: false,
        reject: false,
        observe: false,
        remark: true,
        reinspect: true,
      },
    });
    const again = await approve(
      post(`/${request.id}/approve`, {}),
      params(request.id),
    );
    expect(again.status).toBe(StatusCodes.CONFLICT);
    expect((await json<ErrorBody>(again)).code).toBe("INSPECTION_NOT_PENDING");

    const edited = await update(
      post(`/${request.id}/update`, {
        inspectionDate: TODAY,
        workDescription: "Changed",
        expectedUpdatedAt: done.updatedAt,
      }),
      params(request.id),
    );
    expect(edited.status).toBe(StatusCodes.CONFLICT);
    expect((await json<ErrorBody>(edited)).code).toBe("INSPECTION_DECIDED");
    const deleted = await remove(
      post(`/${request.id}/delete`, { expectedUpdatedAt: done.updatedAt }),
      params(request.id),
    );
    expect(deleted.status).toBe(StatusCodes.CONFLICT);
    expect((await json<ErrorBody>(deleted)).code).toBe("INSPECTION_DECIDED");
    const observed = await observe(
      post(`/${request.id}/observations`, { body: "Late" }),
      params(request.id),
    );
    expect((await json<ErrorBody>(observed)).code).toBe("INSPECTION_DECIDED");

    const reader = await member(ctx, { [MENU]: ["read"] });
    actAs(reader.actor);
    const remarked = await remark(
      post(`/${request.id}/remarks`, { body: "Contractor informed" }),
      params(request.id),
    );
    expect(remarked.status).toBe(StatusCodes.CREATED);
    const remarks = await json<{ items: { body: string }[] }>(
      await listRemarks(get(`/${request.id}/remarks`), params(request.id)),
    );
    expect(remarks.items.map((item) => item.body)).toEqual([
      "Contractor informed",
    ]);
  });

  it("edits a pending request and refuses a stale one", async () => {
    const ctx = await setup();
    const request = await raised(ctx);
    const drawing = await trackingDrawing(
      ctx.company.workspaceId,
      ctx.projectId,
      ctx.by,
    );
    const saved = await json<Inspection>(
      await update(
        post(`/${request.id}/update`, {
          inspectionDate: addDays(TODAY, 1),
          inspectionTime: null,
          workDescription: "Column C4 reinforcement",
          contractorId: ctx.contractorId,
          drawingIds: [drawing],
          expectedUpdatedAt: request.updatedAt,
        }),
        params(request.id),
      ),
    );
    expect(saved).toMatchObject({
      number: request.number,
      inspectionDate: addDays(TODAY, 1),
      inspectionTime: null,
      department: null,
      workDescription: "Column C4 reinforcement",
      drawings: [{ id: drawing }],
    });
    const stale = await update(
      post(`/${request.id}/update`, {
        inspectionDate: TODAY,
        workDescription: "Old",
        expectedUpdatedAt: request.updatedAt,
      }),
      params(request.id),
    );
    expect((await json<ErrorBody>(stale)).code).toBe("INSPECTION_CHANGED");
  });

  it("applies the back-dated limit to the Inspection Date", async () => {
    const ctx = await setup();
    const old = await raised(ctx, { inspectionDate: addDays(TODAY, -30) });
    await prisma.constructionOrganizationBackdatedEntryPolicy.create({
      data: {
        id: newId(),
        workspaceId: ctx.company.workspaceId,
        createDays: 0,
        createOverrideRoleIds: [],
        editDays: 0,
        editOverrideRoleIds: [],
        modules: {
          inspection_request: {
            mode: "custom",
            create: { days: 3, overrideRoleIds: [] },
            edit: { days: 3, overrideRoleIds: [] },
          },
        },
        createdBy: ctx.by,
        updatedBy: ctx.by,
      },
    });
    const site = await member(ctx, {
      [MENU]: ["read", "create", "update", "approve"],
    });
    actAs(site.actor);
    const created = await raise(ctx, { inspectionDate: addDays(TODAY, -10) });
    expect(created.status).toBe(StatusCodes.FORBIDDEN);
    expect((await json<ErrorBody>(created)).code).toBe(
      "BACKDATED_CREATE_BLOCKED",
    );
    expect(
      (await raise(ctx, { inspectionDate: addDays(TODAY, -2) })).status,
    ).toBe(StatusCodes.CREATED);
    const edited = await update(
      post(`/${old.id}/update`, {
        inspectionDate: TODAY,
        workDescription: "Moved",
        expectedUpdatedAt: old.updatedAt,
      }),
      params(old.id),
    );
    expect((await json<ErrorBody>(edited)).code).toBe("BACKDATED_EDIT_BLOCKED");
    // Decisions are not back-dated entries.
    expect(
      (await approve(post(`/${old.id}/approve`, {}), params(old.id))).status,
    ).toBe(StatusCodes.OK);
  });

  it("bulk approves and rejects the pending ones, skipping and counting the rest", async () => {
    const ctx = await setup();
    const a = await raised(ctx);
    const b = await raised(ctx);
    const c = await raised(ctx);
    const decided = await raised(ctx);
    await approve(post(`/${decided.id}/approve`, {}), params(decided.id));
    const other = await addProject(ctx.company.workspaceId, ctx.by);
    const elsewhere = await raised(ctx, {
      projectId: other,
      contractorId: null,
    });

    const approved = await bulkApprove(
      post("/bulk-approve", {
        projectId: ctx.projectId,
        ids: [a.id, b.id, decided.id, elsewhere.id],
      }),
    );
    expect(approved.status).toBe(StatusCodes.OK);
    expect(await json(approved)).toEqual({ decided: 2, skipped: 2, snags: [] });

    const rejected = await bulkReject(
      post("/bulk-reject", {
        projectId: ctx.projectId,
        ids: [a.id, c.id],
        reason: "Shuttering not cleaned",
      }),
    );
    expect(await json(rejected)).toEqual({ decided: 1, skipped: 1, snags: [] });
    expect(await one(c.id)).toMatchObject({
      status: "rejected",
      rejectionReason: "Shuttering not cleaned",
    });
    const noReason = await bulkReject(
      post("/bulk-reject", {
        projectId: ctx.projectId,
        ids: [b.id],
        reason: "",
      }),
    );
    expect((await json<ErrorBody>(noReason)).code).toBe(
      "REJECTION_REASON_REQUIRED",
    );

    const page = await json<Page>(
      await list(get(`?projectId=${ctx.projectId}`)),
    );
    expect(page.counts).toEqual({ pending: 0, approved: 3, rejected: 1 });
  });

  it("raises a snag with a rejection, in the same transaction", async () => {
    const ctx = await setup();
    const locationId = await worksheetLocation(
      ctx.company.workspaceId,
      ctx.by,
      ctx.projectId,
    );
    const request = await raised(ctx, {
      siteLocation: { type: "location", locationId },
    });
    const done = await json<Inspection>(
      await reject(
        post(`/${request.id}/reject`, {
          reason: "Cover blocks missing",
          raiseSnag: true,
        }),
        params(request.id),
      ),
    );
    expect(done.snags).toHaveLength(1);
    const snag = await prisma.constructionTrackingIssue.findUniqueOrThrow({
      where: { id: done.snags[0]?.id ?? "" },
    });
    const quality =
      await prisma.constructionMastersIssueCategory.findFirstOrThrow({
        where: { workspaceId: ctx.company.workspaceId, name: "Quality" },
      });
    expect(snag).toMatchObject({
      projectId: ctx.projectId,
      number: "ISS/26-27/00001",
      details: `Inspection ${request.number} rejected: Cover blocks missing`,
      categoryId: quality.id,
      contractorId: ctx.contractorId,
      departmentId: ctx.departmentId,
      assigneeMemberId: null,
      status: "open",
      sourceInspectionId: request.id,
      siteLocationType: "location",
    });
    expect(snag.issueDate.toISOString().slice(0, 10)).toBe(TODAY);

    // Bulk: one snag per rejected request; Quality renamed → no category.
    await prisma.constructionMastersIssueCategory.update({
      where: { id: quality.id },
      data: { name: "QA" },
    });
    const x = await raised(ctx);
    const y = await raised(ctx);
    const outcome = await json<{
      decided: number;
      snags: { inspectionId: string; issueId: string; number: string }[];
    }>(
      await bulkReject(
        post("/bulk-reject", {
          projectId: ctx.projectId,
          ids: [x.id, y.id, request.id],
          reason: "Honeycombing",
          raiseSnag: true,
        }),
      ),
    );
    expect(outcome.decided).toBe(2);
    expect(outcome.snags.map((s) => s.inspectionId).sort()).toEqual(
      [x.id, y.id].sort(),
    );
    const bulkSnags = await prisma.constructionTrackingIssue.findMany({
      where: { sourceInspectionId: { in: [x.id, y.id] } },
    });
    expect(bulkSnags.map((s) => s.categoryId)).toEqual([null, null]);
  });

  it("refuses a snag without Issues & Snags Create and leaves the request pending", async () => {
    const ctx = await setup();
    const request = await raised(ctx);
    const qc = await member(ctx, { [MENU]: ["read", "reject"] });
    actAs(qc.actor);
    expect((await one(request.id)).actions.raiseSnag).toBe(false);
    const refused = await reject(
      post(`/${request.id}/reject`, { reason: "Gaps", raiseSnag: true }),
      params(request.id),
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    expect((await json<ErrorBody>(refused)).code).toBe("SNAG_NOT_ALLOWED");
    expect((await one(request.id)).status).toBe("pending");
    expect(
      await prisma.constructionTrackingIssue.count({
        where: { sourceInspectionId: request.id },
      }),
    ).toBe(0);

    const both = await member(ctx, {
      [MENU]: ["read", "reject"],
      "tracking.issues": ["create"],
    });
    actAs(both.actor);
    const done = await json<Inspection>(
      await reject(
        post(`/${request.id}/reject`, { reason: "Gaps", raiseSnag: true }),
        params(request.id),
      ),
    );
    expect(done.snags).toHaveLength(1);
  });

  it("raises a re-inspection prefilled from a rejected request and links both ways", async () => {
    const ctx = await setup();
    const inspector = await member(ctx, { [MENU]: ["read"] });
    const drawing = await trackingDrawing(
      ctx.company.workspaceId,
      ctx.projectId,
      ctx.by,
    );
    const request = await raised(ctx, {
      inspectorMemberId: inspector.memberId,
      drawingIds: [drawing],
    });
    const early = await reinspection(
      get(`/${request.id}/reinspection`),
      params(request.id),
    );
    expect(early.status).toBe(StatusCodes.CONFLICT);
    expect((await json<ErrorBody>(early)).code).toBe("INSPECTION_NOT_REJECTED");

    await reject(
      post(`/${request.id}/reject`, { reason: "Lap length short" }),
      params(request.id),
    );
    // The inspector has since left the Project: the prefill drops them.
    await prisma.constructionOrganizationTeamMemberProject.deleteMany({
      where: { memberId: inspector.memberId },
    });
    const draft = await json<Record<string, unknown>>(
      await reinspection(
        get(`/${request.id}/reinspection`),
        params(request.id),
      ),
    );
    expect(draft).toEqual({
      reinspectionOfId: request.id,
      departmentId: ctx.departmentId,
      contractorId: ctx.contractorId,
      inspectorMemberId: null,
      workDescription: "Slab reinforcement before the pour",
      siteLocation: null,
      drawingIds: [drawing],
    });

    const again = await raised(ctx, {
      ...draft,
      inspectionDate: addDays(TODAY, 1),
    });
    expect(again.reinspectionOf).toEqual({
      id: request.id,
      number: request.number,
      status: "rejected",
    });
    const original = await one(request.id);
    expect(original.reinspections).toEqual([
      { id: again.id, number: again.number, status: "pending" },
    ]);
    expect(original.actions.reinspect).toBe(false);

    const twice = await raise(ctx, { reinspectionOfId: request.id });
    expect(twice.status).toBe(StatusCodes.CONFLICT);
    expect((await json<ErrorBody>(twice)).code).toBe(
      "INSPECTION_REINSPECTION_EXISTS",
    );
    const ofPending = await raise(ctx, { reinspectionOfId: again.id });
    expect((await json<ErrorBody>(ofPending)).code).toBe(
      "INSPECTION_NOT_REJECTED",
    );
  });

  it("takes observations from the inspector or Update while pending", async () => {
    const ctx = await setup();
    const inspector = await member(ctx, { [MENU]: ["read"] });
    const bystander = await member(ctx, { [MENU]: ["read"] });
    const request = await raised(ctx, {
      inspectorMemberId: inspector.memberId,
    });

    actAs(bystander.actor);
    expect((await one(request.id)).actions.observe).toBe(false);
    expect(
      (
        await observe(
          post(`/${request.id}/observations`, { body: "Looks fine" }),
          params(request.id),
        )
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);

    actAs(inspector.actor);
    expect((await one(request.id)).actions.observe).toBe(true);
    const empty = await observe(
      post(`/${request.id}/observations`, { body: " " }),
      params(request.id),
    );
    expect((await json<ErrorBody>(empty)).code).toBe("OBSERVATION_EMPTY");
    const added = await observe(
      post(`/${request.id}/observations`, { body: "Cover 20 mm at C4" }),
      params(request.id),
    );
    expect(added.status).toBe(StatusCodes.CREATED);

    // An engineer with Update posts photos only; the files join the entry.
    const engineer = await member(ctx, { [MENU]: ["read", "update"] });
    actAs(engineer.actor);
    const photo = await uploadTrackingFile(
      "",
      "inspection",
      request.id,
      "c4.png",
      pngBytes(),
    );
    const withFiles = await json<{
      id: string;
      body: string | null;
      files: { id: string; entryId: string | null }[];
    }>(
      await observe(
        post(`/${request.id}/observations`, { fileIds: [photo.id] }),
        params(request.id),
      ),
    );
    expect(withFiles.body).toBeNull();
    expect(withFiles.files).toEqual([
      expect.objectContaining({ id: photo.id, entryId: withFiles.id }),
    ]);

    actAs(ctx.owner);
    const items = await json<{
      items: {
        id: string;
        body: string | null;
        canDelete: boolean;
        files: unknown[];
      }[];
    }>(
      await listObservations(
        get(`/${request.id}/observations`),
        params(request.id),
      ),
    );
    expect(items.items.map((item) => item.body)).toEqual([
      "Cover 20 mm at C4",
      null,
    ]);
    expect(items.items.map((item) => item.files.length)).toEqual([0, 1]);
    expect(items.items.every((item) => !item.canDelete)).toBe(true);
    const notMine = await deleteObservation(post("", {}), {
      params: Promise.resolve({ id: request.id, observationId: withFiles.id }),
    });
    expect(notMine.status).toBe(StatusCodes.FORBIDDEN);

    actAs(engineer.actor);
    expect(
      (
        await deleteObservation(post("", {}), {
          params: Promise.resolve({
            id: request.id,
            observationId: withFiles.id,
          }),
        })
      ).status,
    ).toBe(StatusCodes.NO_CONTENT);
    const file =
      await prisma.constructionTrackingDocumentFile.findUniqueOrThrow({
        where: { id: photo.id },
      });
    expect(file.deletedAt).not.toBeNull();
  });

  it("filters the list by status, contractor, inspector, location, dates and search", async () => {
    const ctx = await setup();
    const inspector = await member(ctx, { [MENU]: ["read"] });
    const locationId = await worksheetLocation(
      ctx.company.workspaceId,
      ctx.by,
      ctx.projectId,
    );
    const a = await raised(ctx, {
      workDescription: "Footing F1",
      inspectionDate: addDays(TODAY, -5),
    });
    const b = await raised(ctx, {
      workDescription: "Column C4",
      inspectorMemberId: inspector.memberId,
      siteLocation: { type: "location", locationId },
    });
    const c = await raised(ctx, {
      workDescription: "Beam B2",
      contractorId: null,
    });
    await approve(post(`/${c.id}/approve`, {}), params(c.id));
    const names = async (query: string) =>
      (
        await json<Page>(
          await list(get(`?projectId=${ctx.projectId}&${query}`)),
        )
      ).items
        .map((item) => item.workDescription)
        .sort();
    expect(await names("status=pending")).toEqual(["Column C4", "Footing F1"]);
    expect(await names(`contractorId=${ctx.contractorId}`)).toEqual([
      "Column C4",
      "Footing F1",
    ]);
    expect(await names(`inspectorMemberId=${inspector.memberId}`)).toEqual([
      "Column C4",
    ]);
    expect(
      await names(`locationType=location&locationId=${locationId}`),
    ).toEqual(["Column C4"]);
    expect(await names(`to=${addDays(TODAY, -1)}`)).toEqual(["Footing F1"]);
    expect(await names(`search=${encodeURIComponent(b.number)}`)).toEqual([
      "Column C4",
    ]);
    expect(await names("search=beam")).toEqual(["Beam B2"]);
    const counted = await json<Page>(
      await list(get(`?projectId=${ctx.projectId}&status=approved`)),
    );
    expect(counted.total).toBe(1);
    expect(counted.counts).toEqual({ pending: 2, approved: 1, rejected: 0 });
    expect(a.status).toBe("pending");
  });

  it("offers the form's pickers and answers 404 for another Company's Project", async () => {
    const ctx = await setup();
    await trackingDrawing(ctx.company.workspaceId, ctx.projectId, ctx.by);
    const options = await json<{
      members: unknown[];
      departments: { id: string }[];
      contractors: { id: string }[];
      drawings: { albumName: string }[];
    }>(await formOptions(get(`/form-options?projectId=${ctx.projectId}`)));
    expect(options.contractors.map((c) => c.id)).toEqual([ctx.contractorId]);
    expect(options.departments.map((d) => d.id)).toContain(ctx.departmentId);
    expect(options.drawings).toHaveLength(1);
    expect(options.members.length).toBeGreaterThan(0);

    const stranger = await newCompany("Other Builders");
    const theirs = await addProject(stranger.workspaceId, stranger.ownerId);
    const missing = await list(get(`?projectId=${theirs}`));
    expect(missing.status).toBe(StatusCodes.NOT_FOUND);
    const request = await raised(ctx);
    actAs({
      userId: stranger.ownerId,
      workspaceId: stranger.workspaceId,
      role: "owner",
    });
    expect(
      (await getOne(get(`/${request.id}`), params(request.id))).status,
    ).toBe(StatusCodes.NOT_FOUND);
  });

  it("keeps a linked drawing from being deleted while the request is live", async () => {
    const ctx = await setup();
    const drawing = await trackingDrawing(
      ctx.company.workspaceId,
      ctx.projectId,
      ctx.by,
    );
    const request = await raised(ctx, { drawingIds: [drawing] });
    const url = `http://localhost/api/construction/projects/projects/${ctx.projectId}/drawings/${drawing}/delete`;
    const context = {
      params: Promise.resolve({ id: ctx.projectId, drawingId: drawing }),
    };
    const refused = await deleteDrawing(
      new Request(url, { method: "POST" }),
      context,
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect((await json<ErrorBody>(refused)).code).toBe("DRAWING_IN_USE");
    // A deleted request no longer links it; a decided one still does.
    const decided = await raised(ctx, { drawingIds: [drawing] });
    await approve(post(`/${decided.id}/approve`, {}), params(decided.id));
    await remove(
      post(`/${request.id}/delete`, { expectedUpdatedAt: request.updatedAt }),
      params(request.id),
    );
    const still = await deleteDrawing(
      new Request(url, { method: "POST" }),
      context,
    );
    expect(await json(still)).toMatchObject({
      code: "DRAWING_IN_USE",
      details: { inspectionCount: 1 },
    });
    const other = await trackingDrawing(
      ctx.company.workspaceId,
      ctx.projectId,
      ctx.by,
    );
    const once = await raised(ctx, { drawingIds: [other] });
    await remove(
      post(`/${once.id}/delete`, { expectedUpdatedAt: once.updatedAt }),
      params(once.id),
    );
    expect(
      (
        await deleteDrawing(
          new Request(
            `http://localhost/api/construction/projects/projects/${ctx.projectId}/drawings/${other}/delete`,
            { method: "POST" },
          ),
          { params: Promise.resolve({ id: ctx.projectId, drawingId: other }) },
        )
      ).status,
    ).toBe(StatusCodes.NO_CONTENT);
  });

  it("freezes the request's and its observations' files once decided (409 INSPECTION_DECIDED)", async () => {
    const ctx = await setup();
    for (const decide of ["approve", "reject"] as const) {
      const request = await raised(ctx);
      const own = await uploadTrackingFile(
        "",
        "inspection",
        request.id,
        "slab.png",
        pngBytes(),
      );
      const photo = await uploadTrackingFile(
        "",
        "inspection",
        request.id,
        "c4.png",
        pngBytes(),
      );
      await observe(
        post(`/${request.id}/observations`, { fileIds: [photo.id] }),
        params(request.id),
      );
      const decided =
        decide === "approve"
          ? await approve(
              post(`/${request.id}/approve`, {}),
              params(request.id),
            )
          : await reject(
              post(`/${request.id}/reject`, { reason: "Gaps" }),
              params(request.id),
            );
      expect(decided.status).toBe(StatusCodes.OK);

      const started = await startUpload(
        jsonPost(
          `${trackingDocumentBase("inspection", request.id)}/files/uploads`,
          "",
          { fileName: "late.png", bytes: 64 },
        ),
        trackingDocumentParams("inspection", request.id),
      );
      expect(started.status).toBe(StatusCodes.CONFLICT);
      expect((await json<ErrorBody>(started)).code).toBe("INSPECTION_DECIDED");
      for (const file of [own, photo]) {
        const removed = await removeFile(
          jsonPost(
            `${trackingDocumentBase("inspection", request.id)}/files/${file.id}/delete`,
            "",
            {},
          ),
          trackingFileParams("inspection", request.id, file.id),
        );
        expect(removed.status).toBe(StatusCodes.CONFLICT);
        expect((await json<ErrorBody>(removed)).code).toBe(
          "INSPECTION_DECIDED",
        );
      }
      const listed = await json<{
        items: { id: string; canRemove: boolean }[];
        canUpload: boolean;
      }>(
        await listFiles(
          get(`/../documents/inspection/${request.id}/files`),
          trackingDocumentParams("inspection", request.id),
        ),
      );
      expect(listed.canUpload).toBe(false);
      expect(listed.items.map((item) => item.canRemove)).toEqual([
        false,
        false,
      ]);
    }
    // Task and issue files are not touched by the rule.
    const issue = await trackingIssueRow(
      ctx.company.workspaceId,
      ctx.projectId,
      ctx.by,
    );
    const issueFile = await uploadTrackingFile(
      "",
      "issue",
      issue.id,
      "crack.png",
      pngBytes(),
    );
    expect(issueFile.canRemove).toBe(true);
  });

  it("lets the inspector with Read only attach files to their observations", async () => {
    const ctx = await setup();
    const inspector = await member(ctx, { [MENU]: ["read"] });
    const other = await member(ctx, { [MENU]: ["read"] });
    const request = await raised(ctx, {
      inspectorMemberId: inspector.memberId,
    });

    actAs(other.actor);
    const refused = await startUpload(
      jsonPost(
        `${trackingDocumentBase("inspection", request.id)}/files/uploads`,
        "",
        { fileName: "c4.png", bytes: 64 },
      ),
      trackingDocumentParams("inspection", request.id),
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);

    actAs(inspector.actor);
    const photo = await uploadTrackingFile(
      "",
      "inspection",
      request.id,
      "c4.png",
      pngBytes(),
    );
    const observed = await json<{
      files: { id: string; entryId: string | null }[];
    }>(
      await observe(
        post(`/${request.id}/observations`, {
          body: "Cover 20 mm",
          fileIds: [photo.id],
        }),
        params(request.id),
      ),
    );
    expect(observed.files.map((file) => file.id)).toEqual([photo.id]);

    // The other reader cannot remove it either.
    actAs(other.actor);
    const removed = await removeFile(
      jsonPost(
        `${trackingDocumentBase("inspection", request.id)}/files/${photo.id}/delete`,
        "",
        {},
      ),
      trackingFileParams("inspection", request.id, photo.id),
    );
    expect(removed.status).toBe(StatusCodes.FORBIDDEN);
  });

  it("is on /api/docs", async () => {
    const document = await json<{ paths: Record<string, unknown> }>(
      getOpenApi(),
    );
    for (const path of [
      "/api/construction/tracking/inspections",
      "/api/construction/tracking/inspections/{id}/reject",
      "/api/construction/tracking/inspections/bulk-reject",
      "/api/construction/tracking/inspections/{id}/reinspection",
      "/api/construction/tracking/inspections/{id}/observations",
      "/api/construction/tracking/inspections/{id}/remarks",
    ])
      expect(document.paths[path]).toBeDefined();
  });
});
