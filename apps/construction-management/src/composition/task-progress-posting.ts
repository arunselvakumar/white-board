import { Prisma } from "@repo/construction-db";

import type {
  TaskProgressPosting,
  WorksheetTaskFacts,
} from "@/src/site-work/application/ports";
import {
  postWorksheetProgress,
  removeWorksheetProgress,
} from "@/src/tracking/application/task-worksheet-progress";
import { prismaTaskStore } from "@/src/tracking/infrastructure/prisma-task-store";

/**
 * Daily Worksheets feed task progress (CM-806, ADR CM-0019 §6): site work
 * asks through its `TaskProgressPosting` port; this adapter reads the
 * tracking tables and posts through tracking's application code, in the
 * worksheet's transaction. Site work never imports tracking.
 */

type Row = {
  id: string;
  project_id: string;
  task_no: number;
  name: string;
  leaf: boolean;
  unit_id: string | null;
  unit_name: string | null;
};

const SELECT = Prisma.sql`
  SELECT t.id::text AS id, t.project_id::text AS project_id, t.task_no, t.name,
    NOT EXISTS (
      SELECT 1 FROM construction_tracking.tasks c
      WHERE c.parent_id = t.id AND c.deleted_at IS NULL) AS leaf,
    t.total_work_unit_id::text AS unit_id, u.name AS unit_name
  FROM construction_tracking.tasks t
  LEFT JOIN construction_masters.measurement_units u
    ON u.id = t.total_work_unit_id`;

function facts(row: Row): WorksheetTaskFacts {
  return {
    id: row.id,
    projectId: row.project_id,
    taskNo: row.task_no,
    name: row.name,
    leaf: row.leaf,
    unitId: row.unit_id,
    unitName: row.unit_name,
  };
}

export const trackingTaskProgressPosting: TaskProgressPosting = {
  async options(db, workspaceId, projectId, search, limit) {
    const text = search?.trim() ?? "";
    const number = /^(?:t-?)?(\d{1,9})$/i.exec(text);
    const like = `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const match =
      text === ""
        ? Prisma.empty
        : number == null
          ? Prisma.sql`AND t.name ILIKE ${like}`
          : Prisma.sql`AND (t.task_no = ${Number(number[1])} OR t.name ILIKE ${like})`;
    const rows = await db.$queryRaw<Row[]>(Prisma.sql`${SELECT}
      WHERE t.workspace_id = ${workspaceId} AND t.project_id = ${projectId}::uuid
        AND t.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM construction_tracking.tasks c
          WHERE c.parent_id = t.id AND c.deleted_at IS NULL)
        ${match}
      ORDER BY t.task_no
      LIMIT ${limit}`);
    return rows.map(facts);
  },

  async tasks(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    const rows = await db.$queryRaw<Row[]>(Prisma.sql`${SELECT}
      WHERE t.workspace_id = ${workspaceId} AND t.deleted_at IS NULL
        AND t.id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})`);
    return new Map(rows.map((row) => [row.id, facts(row)]));
  },

  post(tx, input) {
    return postWorksheetProgress(tx, prismaTaskStore, input);
  },

  remove(tx, input) {
    return removeWorksheetProgress(tx, prismaTaskStore, input);
  },
};
