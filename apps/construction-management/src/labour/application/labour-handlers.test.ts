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

  it("checks Projects, categories and the Labour Id", async () => {
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
  describe("from a Project's Resources (ADR CM-0038 §2)", () => {
    async function errorOf(run: () => Promise<unknown>): Promise<DomainError> {
      try {
        await run();
      } catch (error) {
        if (error instanceof DomainError) return error;
        throw error;
      }
      throw new Error("expected a refusal");
    }

    async function two() {
      const { repository, handlers } = setup();
      const a = await handlers.create({
        workspaceId: "w1",
        labour: { ...INPUT, projectIds: [] },
        by: "u1",
      });
      const b = await handlers.create({
        workspaceId: "w1",
        labour: { ...INPUT, name: "Shyam", projectIds: ["p2"] },
        by: "u1",
      });
      return { repository, handlers, a, b };
    }

    it("adds many with one date, remark, time and author, and audits each", async () => {
      const { repository, handlers, a, b } = await two();
      await handlers.addToProject({
        workspaceId: "w1",
        projectId: "p1",
        labourIds: [a.id, b.id, a.id],
        from: "2026-09-15",
        remark: " Slab work ",
        by: "u2",
      });
      const rows = [a.id, b.id].map((id) => repository.history.get(id)?.at(-1));
      for (const row of rows)
        expect(row).toMatchObject({
          fromProjectId: null,
          toProjectId: "p1",
          transferDate: "2026-09-15",
          remark: "Slab work",
          createdAt: NOW,
          createdBy: "u2",
        });
      expect(repository.labours.get(b.id)?.projectIds).toEqual(["p2", "p1"]);
      const audits = repository.audits.filter(
        (audit) => audit.action === "labour.projects_changed",
      );
      expect(audits).toHaveLength(2);
      expect(audits[1]).toMatchObject({
        entityId: b.id,
        before: { projectIds: ["p2"] },
        after: {
          projectIds: ["p2", "p1"],
          projectId: "p1",
          from: "2026-09-15",
          remark: "Slab work",
        },
      });
    });

    it("adds from today in the Company's time zone when no date is given", async () => {
      const { repository, handlers, a } = await two();
      repository.todayIs = "2026-10-08";
      await handlers.addToProject({
        workspaceId: "w1",
        projectId: "p1",
        labourIds: [a.id],
        by: "u2",
      });
      expect(repository.history.get(a.id)?.at(-1)?.transferDate).toBe(
        "2026-10-08",
      );
    });

    it("refuses the whole batch, naming the Labour, and writes nothing", async () => {
      const { repository, handlers, a, b } = await two();
      const add = (
        extra: Partial<Parameters<typeof handlers.addToProject>[0]>,
      ) =>
        errorOf(() =>
          handlers.addToProject({
            workspaceId: "w1",
            projectId: "p2",
            labourIds: [a.id, b.id],
            from: "2026-09-15",
            by: "u2",
            ...extra,
          }),
        );
      const already = await add({});
      expect(already.code).toBe("LABOUR_ALREADY_ON_PROJECT");
      expect(already.details).toMatchObject({ labourId: b.id });
      expect(repository.labours.get(a.id)?.projectIds).toEqual([]);

      const early = await add({ labourIds: [a.id], from: "2026-08-31" });
      expect(early.code).toBe("FROM_BEFORE_JOINING_DATE");
      expect(early.details).toMatchObject({ field: "from", labourId: a.id });

      const unknown = await add({ labourIds: [a.id, "nobody"] });
      expect(unknown.code).toBe("LABOUR_NOT_FOUND");
      expect(unknown.details).toMatchObject({ labourId: "nobody" });

      expect((await add({ projectId: "p9" })).code).toBe("PROJECT_NOT_FOUND");
      expect((await add({ labourIds: [] })).code).toBe("LABOURS_REQUIRED");
      expect(
        (
          await add({
            labourIds: Array.from({ length: 501 }, (_, i) => String(i)),
          })
        ).code,
      ).toBe("TOO_MANY_LABOURS");
      const remark = await add({ remark: "x".repeat(501) });
      expect(remark.code).toBe("REMARK_TOO_LONG");
      expect(remark.details).toMatchObject({ field: "remark" });
      const badDate = await add({ from: "2026-02-30" });
      expect(badDate.code).toBe("FROM_DATE_INVALID");
      expect(badDate.details).toMatchObject({ field: "from" });

      await handlers.setActive({
        workspaceId: "w1",
        id: a.id,
        active: false,
        by: "u1",
      });
      const inactive = await add({ labourIds: [a.id], projectId: "p1" });
      expect(inactive.code).toBe("LABOUR_INACTIVE");
      expect(inactive.details).toMatchObject({ labourId: a.id });
      expect(
        repository.audits.filter(
          (audit) => audit.action === "labour.projects_changed",
        ),
      ).toEqual([]);
    });

    it("refuses a From before their last move", async () => {
      const { handlers, b } = await two();
      await handlers.removeFromProject({
        workspaceId: "w1",
        projectId: "p2",
        labourId: b.id,
        lastDay: "2026-09-30",
        by: "u2",
      });
      const early = await errorOf(() =>
        handlers.addToProject({
          workspaceId: "w1",
          projectId: "p1",
          labourIds: [b.id],
          from: "2026-09-20",
          by: "u2",
        }),
      );
      expect(early.code).toBe("TRANSFER_BEFORE_LAST_TRANSFER");
      expect(early.details).toMatchObject({
        field: "from",
        labourId: b.id,
        lastTransferDate: "2026-10-01",
      });
    });

    it("removes after the Last day: the row is dated the day after", async () => {
      const { repository, handlers, b } = await two();
      repository.attendance.set(b.id, ["2026-09-20"]);
      // On the last attendance day: allowed.
      await handlers.removeFromProject({
        workspaceId: "w1",
        projectId: "p2",
        labourId: b.id,
        lastDay: "2026-09-20",
        remark: "Work done",
        by: "u2",
      });
      expect(repository.history.get(b.id)?.at(-1)).toMatchObject({
        fromProjectId: "p2",
        toProjectId: null,
        transferDate: "2026-09-21",
        remark: "Work done",
      });
      expect(repository.labours.get(b.id)?.projectIds).toEqual([]);
      expect(repository.audits.at(-1)).toMatchObject({
        action: "labour.projects_changed",
        after: { projectIds: [], projectId: "p2", lastDay: "2026-09-20" },
      });

      const again = await errorOf(() =>
        handlers.removeFromProject({
          workspaceId: "w1",
          projectId: "p2",
          labourId: b.id,
          lastDay: "2026-09-25",
          by: "u2",
        }),
      );
      expect(again.code).toBe("LABOUR_NOT_ON_PROJECT");
      expect(again.details).toMatchObject({ labourId: b.id });
    });

    it("refuses a Last day before attendance or their last move, in Last-day words", async () => {
      const { repository, handlers, b } = await two();
      repository.attendance.set(b.id, ["2026-09-20"]);
      const remove = (lastDay: string) =>
        errorOf(() =>
          handlers.removeFromProject({
            workspaceId: "w1",
            projectId: "p2",
            labourId: b.id,
            lastDay,
            by: "u2",
          }),
        );
      const beforeAttendance = await remove("2026-09-19");
      expect(beforeAttendance.code).toBe("TRANSFER_BEFORE_ATTENDANCE");
      expect(beforeAttendance.details).toMatchObject({
        field: "lastDay",
        labourId: b.id,
        latestAttendanceDate: "2026-09-20",
      });
      expect(beforeAttendance.message).toContain("Last day");

      repository.attendance.set(b.id, []);
      // Joined on 2026-09-01: a Last day of 2026-08-31 is the earliest.
      const beforeJoining = await remove("2026-08-30");
      expect(beforeJoining.code).toBe("TRANSFER_BEFORE_LAST_TRANSFER");
      expect(beforeJoining.message).toContain("2026-08-31 or later");
      expect(beforeJoining.details).toMatchObject({ field: "lastDay" });
      const invalid = await remove("nonsense");
      expect(invalid.code).toBe("LAST_DAY_INVALID");
      expect(invalid.details).toMatchObject({ field: "lastDay" });
      await handlers.removeFromProject({
        workspaceId: "w1",
        projectId: "p2",
        labourId: b.id,
        lastDay: "2026-08-31",
        by: "u2",
      });
      expect(repository.history.get(b.id)?.at(-1)?.transferDate).toBe(
        "2026-09-01",
      );
    });

    it("refuses a Labour changed since it was loaded", async () => {
      const { repository, handlers, b } = await two();
      const stale = repository.labours.get(b.id);
      if (stale == null) throw new Error("missing");
      const original = repository.changeProject.bind(repository);
      repository.changeProject = async (change) => {
        // Someone else edits the Labour between the read and the write.
        stale.update(stale.details, "u3", new Date("2026-10-09T00:00:00Z"));
        repository.labours.set(stale.id, stale);
        return original(change);
      };
      expect(
        (
          await errorOf(() =>
            handlers.removeFromProject({
              workspaceId: "w1",
              projectId: "p2",
              labourId: b.id,
              lastDay: "2026-10-01",
              by: "u2",
            }),
          )
        ).code,
      ).toBe("LABOUR_CHANGED");
    });
  });

  describe("Reports To (ADR CM-0035)", () => {
    async function three() {
      const { repository, handlers } = setup();
      const add = (name: string, reportsToId?: string) =>
        handlers.create({
          workspaceId: "w1",
          labour: { ...INPUT, name, reportsToId },
          by: "u1",
        });
      const mason = await add("Mason");
      const helper = await add("Helper", mason.id);
      const boy = await add("Boy", helper.id);
      return { repository, handlers, mason, helper, boy };
    }

    function edit(
      handlers: LabourHandlers,
      labour: { id: string; updatedAt: Date; details: { name: string } },
      reportsToId: string | null | undefined,
    ) {
      return handlers.update({
        workspaceId: "w1",
        id: labour.id,
        labour: {
          name: labour.details.name,
          joiningDate: INPUT.joiningDate,
          wageType: "daily",
          reportsToId,
          expectedUpdatedAt: labour.updatedAt,
        },
        by: "u1",
      });
    }

    it("saves another Labour, by name, and keeps it when left out", async () => {
      const { handlers, mason, helper } = await three();
      expect(helper.reportsTo).toEqual({ id: mason.id, name: "Mason" });
      const kept = await edit(handlers, helper, undefined);
      expect(kept.details.reportsToId).toBe(mason.id);
      const cleared = await edit(handlers, kept, null);
      expect(cleared.reportsTo).toBeNull();
    });

    it("refuses an unknown or inactive Labour, themselves, and a loop", async () => {
      const { handlers, mason, helper, boy } = await three();
      expect(
        await codeOf(() =>
          handlers.create({
            workspaceId: "w1",
            labour: { ...INPUT, reportsToId: "nobody" },
            by: "u1",
          }),
        ),
      ).toBe("REPORTS_TO_NOT_FOUND");
      expect(await codeOf(() => edit(handlers, mason, mason.id))).toBe(
        "REPORTS_TO_SELF",
      );
      // Direct (Mason → Helper → Mason) and through others (via Boy).
      expect(await codeOf(() => edit(handlers, mason, helper.id))).toBe(
        "REPORTS_TO_LOOP",
      );
      expect(await codeOf(() => edit(handlers, mason, boy.id))).toBe(
        "REPORTS_TO_LOOP",
      );
      await handlers.setActive({
        workspaceId: "w1",
        id: mason.id,
        active: false,
        by: "u1",
      });
      expect(
        await codeOf(() =>
          handlers.create({
            workspaceId: "w1",
            labour: { ...INPUT, reportsToId: mason.id },
            by: "u1",
          }),
        ),
      ).toBe("REPORTS_TO_NOT_FOUND");
      // Already saved: an edit of something else keeps it.
      const fresh = await handlers.get("w1", helper.id);
      expect((await edit(handlers, fresh, mason.id)).reportsTo?.id).toBe(
        mason.id,
      );
    });

    it("clears Reports To on the Labours of one deleted", async () => {
      const { repository, handlers, mason, helper } = await three();
      await handlers.delete({ workspaceId: "w1", id: mason.id, by: "u1" });
      expect((await handlers.get("w1", helper.id)).reportsTo).toBeNull();
      expect(repository.labours.get(helper.id)?.details.reportsToId).toBeNull();
    });
  });
});
