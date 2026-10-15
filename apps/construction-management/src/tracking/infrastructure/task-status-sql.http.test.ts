import { randomUUID } from "node:crypto";

import { Prisma, prisma } from "@repo/construction-db";
import { describe, expect, it } from "vitest";

import { addDays, calendarDateToDb } from "@/src/shared-kernel/calendar-date";
import { addProject, newCompany } from "@/test/companies";

import { taskViews } from "../application/task-views";
import { prismaTaskStore } from "./prisma-task-store";
import { taskStatusSql } from "./task-status-sql";

/**
 * `taskStatusSql` must agree with `taskStatus` on every kind of task
 * (CM-0019 §3): leaves at 0, part-way and 100 %, with and without a Due
 * Date before, on and after today, and summary tasks whose Due Date is
 * their leaves' latest — read on several days.
 */

const TODAY = "2026-10-14";

type Spec = {
  key: string;
  parent?: string;
  pct: string;
  due?: string | null;
  deleted?: boolean;
};

const SPECS: Spec[] = [
  { key: "fresh", pct: "0" },
  { key: "fresh-due-today", pct: "0", due: TODAY },
  { key: "fresh-overdue", pct: "0", due: addDays(TODAY, -1) },
  { key: "part", pct: "35.5", due: addDays(TODAY, 3) },
  { key: "part-overdue", pct: "99.99", due: addDays(TODAY, -5) },
  { key: "done-overdue", pct: "100", due: addDays(TODAY, -30) },
  { key: "done", pct: "100" },
  // A summary: own due date in the future, but a leaf is overdue.
  { key: "summary", pct: "40", due: addDays(TODAY, 30) },
  { key: "summary-a", parent: "summary", pct: "80", due: addDays(TODAY, -2) },
  { key: "summary-b", parent: "summary", pct: "0", due: null },
  // A deleted leaf does not count towards its parent's dates.
  {
    key: "summary-gone",
    parent: "summary",
    pct: "0",
    due: addDays(TODAY, 90),
    deleted: true,
  },
  // Three levels: the Due Date comes from the grandchildren.
  { key: "top", pct: "10", due: null },
  { key: "mid", parent: "top", pct: "10", due: addDays(TODAY, -10) },
  { key: "deep", parent: "mid", pct: "10", due: addDays(TODAY, 4) },
  { key: "mid-done", parent: "top", pct: "100", due: addDays(TODAY, -40) },
];

describe("taskStatusSql", () => {
  it(
    "agrees with taskStatus on every case and day",
    { timeout: 30_000 },
    async () => {
      const company = await newCompany();
      const workspaceId = company.workspaceId;
      const by = company.ownerId;
      const projectId = await addProject(workspaceId, by);
      const ids = new Map<string, string>();
      for (const [index, spec] of SPECS.entries()) {
        const id = randomUUID();
        ids.set(spec.key, id);
        const parentId =
          spec.parent == null ? null : (ids.get(spec.parent) ?? null);
        const depth =
          spec.parent == null
            ? 1
            : SPECS.find((s) => s.key === spec.parent)?.parent == null
              ? 2
              : 3;
        await prisma.constructionTrackingTask.create({
          data: {
            id,
            workspaceId,
            projectId,
            taskNo: index + 1,
            parentId,
            depth,
            sortOrder: index + 1,
            name: spec.key,
            dueDate: spec.due == null ? null : calendarDateToDb(spec.due),
            progressPct: new Prisma.Decimal(spec.pct),
            deletedAt: spec.deleted === true ? new Date() : null,
            createdBy: by,
            updatedBy: by,
          },
        });
      }
      const rows = await prismaTaskStore.projectTasks(
        prisma,
        workspaceId,
        projectId,
      );
      for (const today of [
        addDays(TODAY, -60),
        addDays(TODAY, -3),
        TODAY,
        addDays(TODAY, 5),
        addDays(TODAY, 100),
      ]) {
        const views = taskViews(rows, today);
        const sql = await prisma.$queryRaw<{ id: string; status: string }[]>(
          Prisma.sql`SELECT t.id::text AS id, ${taskStatusSql("t", today)} AS status
          FROM construction_tracking.tasks t
          WHERE t.project_id = ${projectId}::uuid AND t.deleted_at IS NULL`,
        );
        expect(sql).toHaveLength(rows.length);
        for (const row of sql) {
          const view = views.get(row.id);
          expect(row.status, `${view?.name ?? row.id} on ${today}`).toBe(
            view?.status,
          );
        }
      }
      // The cases cover every status on today.
      const today = taskViews(rows, TODAY);
      expect(new Set([...today.values()].map((view) => view.status))).toEqual(
        new Set(["not_started", "in_progress", "delayed", "completed"]),
      );
      expect(today.get(ids.get("summary") ?? "")?.status).toBe("delayed");
      expect(today.get(ids.get("top") ?? "")?.plannedDue).toBe(
        addDays(TODAY, 4),
      );
    },
  );
});
