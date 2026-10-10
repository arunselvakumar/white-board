import { describe, expect, it } from "vitest";

import type { AuditEvent } from "@/src/shared-kernel/audit";
import { conflict } from "@/src/shared-kernel/domain-error";
import {
  UNLIMITED_PLAN,
  planLimitExceeded,
  type PlanGate,
} from "@/src/shared-kernel/plan";

import type { Project } from "../domain/project";
import type {
  ProjectCustomFieldLabels,
  ProjectRepository,
  ProjectUsage,
} from "../domain/project-repository";
import { ProjectHandlers, type ProjectViewer } from "./project-handlers";

class MemoryProjects implements ProjectRepository {
  readonly rows = new Map<string, Project>();
  readonly audits: AuditEvent[] = [];
  /** `updatedAt` as stored, to imitate the compare-and-set. */
  private readonly stamps = new Map<string, number>();

  findById(workspaceId: string, id: string): Promise<Project | null> {
    const found = this.rows.get(id);
    return Promise.resolve(
      found?.workspaceId === workspaceId && found.deletedAt == null
        ? found
        : null,
    );
  }

  list(
    workspaceId: string,
    ids: ReadonlySet<string> | null,
  ): Promise<Project[]> {
    return Promise.resolve(
      [...this.rows.values()].filter(
        (item) =>
          item.workspaceId === workspaceId &&
          item.deletedAt == null &&
          (ids == null || ids.has(item.id)),
      ),
    );
  }

  insert(project: Project, audit: AuditEvent): Promise<void> {
    const clash = [...this.rows.values()].some(
      (item) =>
        item.workspaceId === project.workspaceId &&
        item.deletedAt == null &&
        item.name.toLowerCase() === project.name.toLowerCase(),
    );
    if (clash)
      return Promise.reject(conflict("PROJECT_NAME_IN_USE", "In use."));
    this.rows.set(project.id, project);
    this.stamps.set(project.id, project.updatedAt.getTime());
    this.audits.push(audit);
    return Promise.resolve();
  }

  update(
    project: Project,
    expectedUpdatedAt: Date,
    audit: AuditEvent,
  ): Promise<void> {
    if (this.stamps.get(project.id) !== expectedUpdatedAt.getTime())
      return Promise.reject(conflict("PROJECT_CHANGED", "Changed."));
    this.stamps.set(project.id, project.updatedAt.getTime());
    this.audits.push(audit);
    return Promise.resolve();
  }

  delete(project: Project, audit: AuditEvent): Promise<void> {
    this.audits.push(audit);
    this.rows.set(project.id, project);
    return Promise.resolve();
  }
}

const OWNER: ProjectViewer = {
  workspaceId: "company-1",
  userId: "owner",
  role: "owner",
  projectIds: new Set(),
};

let tick = Date.parse("2026-10-08T00:00:00Z");
const clock = () => new Date((tick += 1000));

function setup(options: { plan?: PlanGate; used?: Set<string> } = {}) {
  const repository = new MemoryProjects();
  const used = options.used ?? new Set<string>();
  const usage: ProjectUsage = {
    isInUse: (_workspaceId, projectId) => Promise.resolve(used.has(projectId)),
  };
  const asked: { workspaceId: string; limit: number }[] = [];
  const labels: ProjectCustomFieldLabels = {
    list: (workspaceId, limit) => {
      asked.push({ workspaceId, limit });
      return Promise.resolve(["Site engineer", "Client architect"]);
    },
  };
  const handlers = new ProjectHandlers(
    repository,
    options.plan ?? UNLIMITED_PLAN,
    usage,
    labels,
    clock,
  );
  const add = (name: string, status?: string) =>
    handlers.create({
      workspaceId: "company-1",
      by: "owner",
      details: { name, status, projectType: "residential" },
      financial: true,
    });
  return { handlers, repository, used, add, asked };
}

describe("ProjectHandlers", () => {
  it("lists by status then name with counts per status", async () => {
    const { handlers, add } = setup();
    await add("Zen Villas", "completed");
    await add("Kumari Heights");
    await add("Vadasery Plots", "not_started");
    await add("Asaripallam Tower");
    const page = await handlers.list(OWNER);
    expect(page.items.map((item) => item.name)).toEqual([
      "Asaripallam Tower",
      "Kumari Heights",
      "Vadasery Plots",
      "Zen Villas",
    ]);
    expect(page.counts).toEqual({
      all: 4,
      ongoing: 2,
      not_started: 1,
      on_hold: 0,
      completed: 1,
    });
    const ongoing = await handlers.list(OWNER, "ongoing");
    expect(ongoing.total).toBe(2);
    expect(ongoing.counts.all).toBe(4);
  });

  it("shows a Member only the Projects they are assigned to", async () => {
    const { handlers, add } = setup();
    const mine = await add("Kumari Heights");
    const other = await add("Asaripallam Tower");
    const member: ProjectViewer = {
      workspaceId: "company-1",
      userId: "member",
      role: "member",
      projectIds: new Set([mine.id]),
    };
    expect((await handlers.list(member)).items.map((item) => item.id)).toEqual([
      mine.id,
    ]);
    expect(await handlers.options(member)).toEqual([
      { id: mine.id, name: "Kumari Heights", status: "ongoing" },
    ]);
    await expect(handlers.get(member, other.id)).rejects.toMatchObject({
      code: "PROJECT_NOT_FOUND",
      kind: "not_found",
    });
    await expect(
      handlers.delete({ viewer: member, id: other.id, by: "member" }),
    ).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
  });

  it("asks the plan before creating", async () => {
    const plan: PlanGate = {
      assertCanAdd: (_workspaceId, grant) =>
        Promise.reject(planLimitExceeded(grant, 10, 10)),
    };
    const { add, repository } = setup({ plan });
    await expect(add("Kumari Heights")).rejects.toMatchObject({
      code: "PLAN_LIMIT_EXCEEDED",
      kind: "limit",
      details: { grant: "project", limit: 10, used: 10 },
    });
    expect(repository.rows.size).toBe(0);
  });

  it("updates with optimistic concurrency and audits before/after", async () => {
    const { handlers, add, repository } = setup();
    const created = await add("Kumari Heights");
    const updated = await handlers.update({
      viewer: OWNER,
      id: created.id,
      by: "owner",
      details: { name: "Kumari Heights", status: "on_hold" },
      financial: true,
      expectedUpdatedAt: created.updatedAt,
    });
    expect(updated.status).toBe("on_hold");
    expect(repository.audits.at(-1)).toMatchObject({
      action: "project.updated",
      entityType: "project",
      before: { status: "ongoing" },
      after: { status: "on_hold" },
    });
    await expect(
      handlers.update({
        viewer: OWNER,
        id: created.id,
        by: "owner",
        details: { name: "Kumari Heights", status: "completed" },
        financial: true,
        expectedUpdatedAt: created.updatedAt,
      }),
    ).rejects.toMatchObject({ code: "PROJECT_CHANGED", kind: "conflict" });
  });

  it("refuses to delete a Project in use, then tombstones it", async () => {
    const { handlers, add, used, repository } = setup();
    const created = await add("Kumari Heights");
    used.add(created.id);
    await expect(
      handlers.delete({ viewer: OWNER, id: created.id, by: "owner" }),
    ).rejects.toMatchObject({ code: "PROJECT_IN_USE", kind: "conflict" });
    used.clear();
    await handlers.delete({ viewer: OWNER, id: created.id, by: "owner" });
    expect((await handlers.list(OWNER)).total).toBe(0);
    expect(repository.audits.at(-1)).toMatchObject({
      action: "project.deleted",
      before: { name: "Kumari Heights" },
    });
    // The name is free again.
    await expect(add("Kumari Heights")).resolves.toMatchObject({
      name: "Kumari Heights",
    });
  });

  it("sets the order value only with the Financial flag", async () => {
    const { handlers } = setup();
    const create = (financial: boolean) =>
      handlers.create({
        workspaceId: "company-1",
        by: "owner",
        details: {
          name: financial ? "Kumari Heights" : "Asaripallam Tower",
          projectType: "residential",
          clientName: "Sri Balaji Developers",
          orderValue: 4_85_00_000_00,
        },
        financial,
      });
    expect(await create(true)).toMatchObject({ orderValue: 4_85_00_000_00 });
    // Without Financial the value is dropped, the rest is saved.
    expect(await create(false)).toMatchObject({
      clientName: "Sri Balaji Developers",
      orderValue: null,
    });
  });

  it("keeps the stored order value when a caller without Financial edits", async () => {
    const { handlers, repository } = setup();
    const created = await handlers.create({
      workspaceId: "company-1",
      by: "owner",
      details: {
        name: "Kumari Heights",
        projectType: "residential",
        orderValue: 4_85_00_000_00,
      },
      financial: true,
    });
    const kept = await handlers.update({
      viewer: OWNER,
      id: created.id,
      by: "member",
      details: {
        name: "Kumari Heights",
        status: "ongoing",
        orderValue: 1,
        quotationNo: "SBD/Q/2026/114",
      },
      financial: false,
      expectedUpdatedAt: created.updatedAt,
    });
    expect(kept).toMatchObject({
      orderValue: 4_85_00_000_00,
      quotationNo: "SBD/Q/2026/114",
    });
    // Not even null clears it.
    const stillKept = await handlers.update({
      viewer: OWNER,
      id: created.id,
      by: "member",
      details: { name: "Kumari Heights", status: "ongoing", orderValue: null },
      financial: false,
      expectedUpdatedAt: kept.updatedAt,
    });
    expect(stillKept.orderValue).toBe(4_85_00_000_00);
    const cleared = await handlers.update({
      viewer: OWNER,
      id: created.id,
      by: "owner",
      details: { name: "Kumari Heights", status: "ongoing", orderValue: null },
      financial: true,
      expectedUpdatedAt: stillKept.updatedAt,
    });
    expect(cleared.orderValue).toBeNull();
    expect(repository.audits.at(-1)).toMatchObject({
      before: { orderValue: 4_85_00_000_00 },
      after: { orderValue: null },
    });
  });

  it("audits the contract details and custom fields", async () => {
    const { handlers, repository } = setup();
    await handlers.create({
      workspaceId: "company-1",
      by: "owner",
      details: {
        name: "Kumari Heights",
        projectType: "commercial",
        clientPhone: "98431 22110",
        loaDate: "2026-03-05",
        customFields: [{ label: "Site engineer", value: "Prabhu Saravanan" }],
      },
      financial: true,
    });
    expect(repository.audits.at(-1)).toMatchObject({
      action: "project.created",
      after: {
        name: "Kumari Heights",
        clientPhone: "+919843122110",
        loaDate: "2026-03-05",
        orderValue: null,
        customFields: [{ label: "Site engineer", value: "Prabhu Saravanan" }],
      },
    });
  });

  it("needs a Project Type on create and keeps it when an edit leaves it out", async () => {
    const { handlers, repository } = setup();
    await expect(
      handlers.create({
        workspaceId: "company-1",
        by: "owner",
        details: { name: "Kumari Heights" },
        financial: true,
      }),
    ).rejects.toMatchObject({ code: "PROJECT_TYPE_REQUIRED" });
    expect(repository.rows.size).toBe(0);
    const created = await handlers.create({
      workspaceId: "company-1",
      by: "owner",
      details: { name: "Kumari Heights", projectType: "infrastructure" },
      financial: true,
    });
    expect(created).toMatchObject({
      projectType: "infrastructure",
      structure: "locations",
      budgetValue: null,
      useLogoInReports: false,
      logoKey: null,
    });
    const edited = await handlers.update({
      viewer: OWNER,
      id: created.id,
      by: "owner",
      details: { name: "Kumari Heights", status: "on_hold" },
      financial: true,
      expectedUpdatedAt: created.updatedAt,
    });
    expect(edited.projectType).toBe("infrastructure");
    expect(repository.audits.at(-1)).toMatchObject({
      after: { projectType: "infrastructure", useLogoInReports: false },
    });
  });

  it("sets and keeps the budget like the order value: only with Financial", async () => {
    const { handlers } = setup();
    const create = (name: string, financial: boolean) =>
      handlers.create({
        workspaceId: "company-1",
        by: "owner",
        details: {
          name,
          projectType: "residential",
          budgetValue: 3_20_00_000_00,
        },
        financial,
      });
    expect((await create("Kumari Heights", false)).budgetValue).toBeNull();
    const created = await create("Asaripallam Tower", true);
    expect(created.budgetValue).toBe(3_20_00_000_00);
    const kept = await handlers.update({
      viewer: OWNER,
      id: created.id,
      by: "member",
      details: {
        name: "Asaripallam Tower",
        status: "ongoing",
        budgetValue: null,
      },
      financial: false,
      expectedUpdatedAt: created.updatedAt,
    });
    expect(kept.budgetValue).toBe(3_20_00_000_00);
    const cleared = await handlers.update({
      viewer: OWNER,
      id: created.id,
      by: "owner",
      details: {
        name: "Asaripallam Tower",
        status: "ongoing",
        budgetValue: null,
      },
      financial: true,
      expectedUpdatedAt: kept.updatedAt,
    });
    expect(cleared.budgetValue).toBeNull();
  });

  it("asks for at most 50 custom-field labels of the Company", async () => {
    const { handlers, asked } = setup();
    expect(await handlers.customFieldLabels(OWNER)).toEqual([
      "Site engineer",
      "Client architect",
    ]);
    expect(asked).toEqual([{ workspaceId: "company-1", limit: 50 }]);
  });
});
