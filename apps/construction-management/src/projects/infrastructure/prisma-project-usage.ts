import { Prisma, type PrismaClient } from "@repo/db";

import type { ProjectUsage } from "../domain/project-repository";

/**
 * Site records that point at a Project, read by id from the labour
 * context's tables (contexts refer to each other by id; no import of their
 * code): live labours whose current Project it is, live vendors assigned
 * to it, live labour or vendor attendance on it, and live wage payments.
 * Its own live documents (CM-414) count too: deleting the Project would
 * leave their files in storage with nothing to show them.
 */
export class PrismaProjectUsage implements ProjectUsage {
  constructor(private readonly db: PrismaClient) {}

  async isInUse(workspaceId: string, projectId: string): Promise<boolean> {
    const rows = await this.db.$queryRaw<{ used: boolean }[]>(Prisma.sql`
      SELECT
        EXISTS (
          SELECT 1 FROM construction_labour.labours
          WHERE workspace_id = ${workspaceId}
            AND current_project_id = ${projectId}::uuid
            AND deleted_at IS NULL
        )
        OR EXISTS (
          SELECT 1 FROM construction_labour.vendor_projects vp
          JOIN construction_labour.vendors v ON v.id = vp.vendor_id
          WHERE v.workspace_id = ${workspaceId}
            AND vp.project_id = ${projectId}::uuid
            AND v.deleted_at IS NULL
        )
        OR EXISTS (
          SELECT 1 FROM construction_labour.labour_attendance
          WHERE workspace_id = ${workspaceId}
            AND project_id = ${projectId}::uuid
            AND deleted_at IS NULL
        )
        OR EXISTS (
          SELECT 1 FROM construction_labour.vendor_attendance
          WHERE workspace_id = ${workspaceId}
            AND project_id = ${projectId}::uuid
            AND deleted_at IS NULL
        )
        OR EXISTS (
          SELECT 1 FROM construction_labour.wage_payments
          WHERE workspace_id = ${workspaceId}
            AND project_id = ${projectId}::uuid
            AND deleted_at IS NULL
        )
        OR EXISTS (
          SELECT 1 FROM construction_projects.documents
          WHERE workspace_id = ${workspaceId}
            AND project_id = ${projectId}::uuid
            AND deleted_at IS NULL
        ) AS "used"
    `);
    return rows[0]?.used === true;
  }
}
