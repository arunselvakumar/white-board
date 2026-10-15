import { Prisma, prisma } from "@repo/construction-db";
import { describe, expect, it } from "vitest";

import { addDays } from "@/src/shared-kernel/calendar-date";
import { addProject, newCompany } from "@/test/companies";
import { trackingIssueRow } from "@/test/tracking";

import {
  ISSUE_STATUSES,
  issueStatus,
  type IssueStoredStatus,
} from "../domain/issue";
import { issueStatusSql, issueStatusWhere } from "./issue-status-sql";

/** Every case of the rule, on a fixed "today". */
const TODAY = "2026-10-14";
const CASES: { status: IssueStoredStatus; dueDate: string | null }[] = [
  { status: "open", dueDate: null },
  { status: "open", dueDate: addDays(TODAY, -1) },
  { status: "open", dueDate: TODAY },
  { status: "open", dueDate: addDays(TODAY, 1) },
  { status: "solved", dueDate: null },
  { status: "solved", dueDate: addDays(TODAY, -5) },
  { status: "solved", dueDate: addDays(TODAY, 5) },
  { status: "closed", dueDate: null },
  { status: "closed", dueDate: addDays(TODAY, -5) },
];

describe("issueStatusSql (CM-803)", () => {
  it("agrees with issueStatus, and issueStatusWhere filters the same rows", async () => {
    const company = await newCompany();
    const ws = company.workspaceId;
    const projectId = await addProject(ws, company.ownerId);
    const expected = new Map<string, string>();
    for (const item of CASES) {
      const { id } = await trackingIssueRow(ws, projectId, company.ownerId, {
        issueDate: addDays(TODAY, -10),
        dueDate: item.dueDate,
        status: item.status === "closed" ? "solved" : item.status,
      });
      if (item.status === "closed")
        await prisma.constructionTrackingIssue.update({
          where: { id },
          data: { status: "closed", closedAt: new Date() },
        });
      expected.set(id, issueStatus(item, TODAY));
    }
    expect(new Set(expected.values())).toEqual(new Set(ISSUE_STATUSES));

    const rows = await prisma.$queryRaw<{ id: string; status: string }[]>(
      Prisma.sql`
        SELECT i.id::text AS id, ${issueStatusSql(TODAY)} AS status
        FROM construction_tracking.issues i
        WHERE i.workspace_id = ${ws} AND i.deleted_at IS NULL`,
    );
    expect(new Map(rows.map((row) => [row.id, row.status]))).toEqual(expected);

    const aliased = await prisma.$queryRaw<{ status: string; n: number }[]>(
      Prisma.sql`
        SELECT ${issueStatusSql(TODAY, "issue")} AS status, count(*)::int AS n
        FROM construction_tracking.issues issue
        WHERE issue.workspace_id = ${ws}
        GROUP BY 1
        ORDER BY 1`,
    );
    expect(aliased).toEqual([
      { status: "closed", n: 2 },
      { status: "delayed", n: 1 },
      { status: "pending", n: 3 },
      { status: "solved", n: 3 },
    ]);

    for (const status of ISSUE_STATUSES) {
      const found = await prisma.constructionTrackingIssue.findMany({
        where: { workspaceId: ws, ...issueStatusWhere([status], TODAY) },
        select: { id: true },
      });
      expect(found.map((row) => row.id).sort(), status).toEqual(
        [...expected].flatMap(([id, s]) => (s === status ? [id] : [])).sort(),
      );
    }
  });

  it("refuses an alias that is not a plain identifier", () => {
    expect(() => issueStatusSql(TODAY, "i; DROP TABLE x")).toThrow();
  });
});
