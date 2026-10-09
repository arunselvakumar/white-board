import { Prisma, type PrismaClient } from "@repo/db";

import type { ProjectCustomFieldLabels } from "../domain/project-repository";

/**
 * Custom-field labels across the Company's live Projects (CM-413). Labels
 * that differ only in case are one label, shown in its most-used spelling
 * (ties by name), so the picker nudges everyone to one name.
 */
export class PrismaCustomFieldLabels implements ProjectCustomFieldLabels {
  constructor(private readonly db: PrismaClient) {}

  async list(workspaceId: string, limit: number): Promise<string[]> {
    const rows = await this.db.$queryRaw<{ label: string }[]>(Prisma.sql`
      WITH spellings AS (
        SELECT lower(f.label) AS key, f.label, count(*) AS uses
        FROM construction_projects.custom_fields f
        JOIN construction_projects.projects p ON p.id = f.project_id
        WHERE f.workspace_id = ${workspaceId}
          AND p.workspace_id = ${workspaceId}
          AND p.deleted_at IS NULL
        GROUP BY lower(f.label), f.label
      ),
      ranked AS (
        SELECT
          label,
          sum(uses) OVER (PARTITION BY key) AS total,
          row_number() OVER (
            PARTITION BY key ORDER BY uses DESC, label ASC
          ) AS place
        FROM spellings
      )
      SELECT label FROM ranked
      WHERE place = 1
      ORDER BY total DESC, lower(label) ASC, label ASC
      LIMIT ${limit}
    `);
    return rows.map((row) => row.label);
  }
}
