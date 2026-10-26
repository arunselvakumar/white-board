import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  FakeLabourRepository,
  fakeDirectories,
  fakeQueries,
  transferAccess,
} from "./labour-fakes";
import { LabourHandlers, type CreateLabourInput } from "./labour-handlers";

const NOW = new Date("2026-10-08T06:00:00Z");

function setup() {
  const repository = new FakeLabourRepository();
  const handlers = new LabourHandlers(
    repository,
    fakeQueries(repository),
    fakeDirectories({
      projects: ["p1", "p2"],
      labourCategories: ["mason", "welder"],
      supervisors: ["sundar"],
      disabled: ["welder"],
    }),
    () => NOW,
  );
  return { repository, handlers };
}

const INPUT: CreateLabourInput = {
  name: "Dhuresh",
  joiningDate: "2026-09-01",
  wageType: "daily",
  wagePerDay: 70_000,
  overtimeWagePerHour: 10_000,
  projectIds: ["p1"],
};

async function codeOf(
  run: () => Promise<unknown>,
): Promise<string | undefined> {
  try {
    await run();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  return undefined;
}

describe("LabourHandlers", () => {
  it("creates with the opening balance and an audit without the Aadhaar number", async () => {
    const { repository, handlers } = setup();
    const created = await handlers.create({
      workspaceId: "w1",
      labour: { ...INPUT, openingBalance: -5_000, aadhaar: "234123412346" },
      by: "u1",
    });
    expect(created.openingBalance).toBe(-5_000);
    expect(repository.history.get(created.id)?.[0]).toMatchObject({
      fromProjectId: null,
      toProjectId: "p1",
      transferDate: "2026-09-01",
    });
    expect(JSON.stringify(repository.audits)).not.toContain("234123412346");
  });

  it("checks Projects, categories, supervisors and the Labour Id", async () => {
    const { handlers } = setup();
    const create = (extra: Partial<CreateLabourInput>) =>
      handlers.create({
        workspaceId: "w1",
        labour: { ...INPUT, ...extra },
        by: "u1",
      });
    expect(await codeOf(() => create({ projectIds: ["p1", "p9"] }))).toBe(
      "PROJECT_NOT_FOUND",
    );
    expect(await codeOf(() => create({ labourCategoryId: "welder" }))).toBe(
      "LABOUR_CATEGORY_NOT_FOUND",
    );
    expect(await codeOf(() => create({ supervisorId: "nobody" }))).toBe(
      "SUPERVISOR_NOT_FOUND",
    );
    await create({ labourCode: "A-1" });
    expect(await codeOf(() => create({ labourCode: "a-1" }))).toBe(
      "LABOUR_CODE_TAKEN",
    );
  });

  it("keeps omitted amounts and working hours, and reposts only a changed opening balance", async () => {
    const { repository, handlers } = setup();
    const created = await handlers.create({
      workspaceId: "w1",
      labour: {
        ...INPUT,
        openingBalance: 1_000,
        labourCategoryId: "mason",
        workingHoursPerDay: "9",
      },
      by: "u1",
    });
    const base = {
      name: "Dhuresh P",
      joiningDate: "2026-09-01",
      wageType: "daily",
      labourCategoryId: "mason",
      expectedUpdatedAt: created.updatedAt,
    };
    const renamed = await handlers.update({
      workspaceId: "w1",
      id: created.id,
      labour: base,
      by: "u1",
    });
    expect(renamed.details.wagePerDay).toBe(70_000);
    expect(renamed.details.workingHoursPerDay).toBe("9");
    expect(repository.ledger.get(created.id)).toEqual([1_000]);

    const reposted = await handlers.update({
      workspaceId: "w1",
      id: created.id,
      labour: {
        ...base,
        openingBalance: 2_500,
        expectedUpdatedAt: renamed.updatedAt,
      },
      by: "u1",
    });
    expect(reposted.openingBalance).toBe(2_500);
    expect(repository.ledger.get(created.id)).toEqual([1_000, -1_000, 2_500]);
  });

  it("refuses a joining date after the first transfer or attendance day", async () => {
    const { repository, handlers } = setup();
    const created = await handlers.create({
      workspaceId: "w1",
      labour: INPUT,
      by: "u1",
    });
    repository.attendance.set(created.id, ["2026-09-05"]);
    expect(
      await codeOf(() =>
        handlers.update({
          workspaceId: "w1",
          id: created.id,
          labour: {
            ...INPUT,
            joiningDate: "2026-09-06",
            expectedUpdatedAt: created.updatedAt,
          },
          by: "u1",
        }),
      ),
    ).toBe("JOINING_DATE_AFTER_ATTENDANCE");
  });

  it("transfers many at once and checks every source Project", async () => {
    const { repository, handlers } = setup();
    const a = await handlers.create({
      workspaceId: "w1",
      labour: INPUT,
      by: "u1",
    });
    const b = await handlers.create({
      workspaceId: "w1",
      labour: { ...INPUT, name: "Shyam" },
      by: "u1",
    });
    const move = (projects: string[]) =>
      handlers.transfer({
        workspaceId: "w1",
        access: transferAccess(projects),
        labourIds: [a.id, b.id],
        toProjectId: "p2",
        transferDate: "2026-10-01",
        by: "u2",
      });
    expect(await codeOf(() => move(["p2"]))).toBe("PERMISSION_DENIED");
    const moved = await move(["p1", "p2"]);
    expect(moved.map((item) => item.projects.map((p) => p.id))).toEqual([
      ["p2"],
      ["p2"],
    ]);
    expect(repository.history.get(a.id)?.at(-1)).toMatchObject({
      fromProjectId: "p1",
      toProjectId: "p2",
      transferDate: "2026-10-01",
    });
    expect(
      repository.audits.filter(
        (audit) => audit.action === "labour.transferred",
      ),
    ).toHaveLength(2);
  });

  it("adds a Labour on no Project, and ticks and unticks Projects on Edit with history from today", async () => {
    const { repository, handlers } = setup();
    const created = await handlers.create({
      workspaceId: "w1",
      labour: { ...INPUT, projectIds: [] },
      by: "u1",
    });
    expect(created.projects).toEqual([]);
    expect(repository.history.get(created.id)).toEqual([]);

    const edit = (projectIds: string[], expectedUpdatedAt: Date) =>
      handlers.update({
        workspaceId: "w1",
        id: created.id,
        labour: { ...INPUT, projectIds, expectedUpdatedAt },
        by: "u1",
      });
    expect(await codeOf(() => edit(["p9"], created.updatedAt))).toBe(
      "PROJECT_NOT_FOUND",
    );
    const both = await edit(["p1", "p2"], created.updatedAt);
    expect(both.projects.map((project) => project.id)).toEqual(["p1", "p2"]);
    const one = await edit(["p2"], both.updatedAt);
    expect(one.projects.map((project) => project.id)).toEqual(["p2"]);
    expect(
      repository.history
        .get(created.id)
        ?.map((row) => [row.fromProjectId, row.toProjectId, row.transferDate]),
    ).toEqual([
      [null, "p1", "2026-10-08"],
      [null, "p2", "2026-10-08"],
      ["p1", null, "2026-10-08"],
    ]);
    // Leaving the Projects out keeps them.
    const { projectIds: _left, ...withoutProjects } = INPUT;
    const kept = await handlers.update({
      workspaceId: "w1",
      id: created.id,
      labour: { ...withoutProjects, expectedUpdatedAt: one.updatedAt },
      by: "u1",
    });
    expect(kept.projects.map((project) => project.id)).toEqual(["p2"]);
  });

  it("moves a Labour on many Projects from the one named, keeping the others", async () => {
    const repository = new FakeLabourRepository();
    const handlers = new LabourHandlers(
      repository,
      fakeQueries(repository),
      fakeDirectories({ projects: ["p1", "p2", "p3"] }),
      () => NOW,
    );
    const created = await handlers.create({
      workspaceId: "w1",
      labour: { ...INPUT, projectIds: ["p1", "p2"] },
      by: "u1",
    });
    const move = (
      fromProjectId: string | null,
      toProjectId: string,
      projects = ["p1", "p2", "p3"],
    ) =>
      handlers.transfer({
        workspaceId: "w1",
        access: transferAccess(projects),
        labourIds: [created.id],
        fromProjectId,
        toProjectId,
        transferDate: "2026-10-01",
        by: "u2",
      });
    expect(await codeOf(() => move(null, "p3"))).toBe(
      "TRANSFER_FROM_PROJECT_REQUIRED",
    );
    expect(await codeOf(() => move("p1", "p2"))).toBe("TRANSFER_SAME_PROJECT");
    expect(await codeOf(() => move("p3", "p1"))).toBe("LABOUR_NOT_ON_PROJECT");
    expect(await codeOf(() => move("p1", "p3", ["p2", "p3"]))).toBe(
      "PERMISSION_DENIED",
    );
    const [moved] = await move("p1", "p3", ["p1", "p3"]);
    expect(moved?.projects.map((project) => project.id)).toEqual(["p3", "p2"]);
    expect(repository.history.get(created.id)?.at(-1)).toMatchObject({
      fromProjectId: "p1",
      toProjectId: "p3",
    });
  });

  it("deletes only without attendance or payments", async () => {
    const { repository, handlers } = setup();
    const created = await handlers.create({
      workspaceId: "w1",
      labour: { ...INPUT, openingBalance: 900 },
      by: "u1",
    });
    repository.payments.add(created.id);
    expect(
      await codeOf(() =>
        handlers.delete({ workspaceId: "w1", id: created.id, by: "u1" }),
      ),
    ).toBe("LABOUR_HAS_RECORDS");
    repository.payments.clear();
    await handlers.delete({ workspaceId: "w1", id: created.id, by: "u1" });
    expect(repository.ledger.get(created.id)).toEqual([900, -900]);
    expect(await codeOf(() => handlers.get("w1", created.id))).toBe(
      "LABOUR_NOT_FOUND",
    );
  });
});
