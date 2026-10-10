import { Prisma, type PrismaClient } from "@repo/construction-db";

import type { GalleryReader, GalleryRow } from "../application/project-gallery";

type Row = {
  id: string;
  workspaceId: string;
  projectId: string;
  source: string;
  sourceId: string;
  fileKey: string;
  thumbKey: string | null;
  fileName: string;
  contentType: string;
  bytes: number;
  uploadedBy: string;
  uploadedAt: Date;
  revisionId: string | null;
};

/** `%`, `_` and `\` matched as themselves in ILIKE. */
function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/**
 * The Gallery index (`construction_projects.media_items`) with filters in
 * SQL. A drawing's row is joined to its revision by file key, because the
 * drawing's file route is per revision; a drawing row without a live
 * revision is left out, so the grid never shows a broken tile. Upload days
 * are counted in the Company's time zone.
 */
export class PrismaGalleryReader implements GalleryReader {
  constructor(private readonly db: PrismaClient) {}

  private async timeZone(workspaceId: string): Promise<string> {
    const profile =
      await this.db.constructionOrganizationCompanyProfile.findUnique({
        where: { workspaceId },
        select: { timezone: true },
      });
    return profile?.timezone ?? "Asia/Kolkata";
  }

  private async conditions(input: Parameters<GalleryReader["list"]>[0]) {
    const { filter } = input;
    const where: Prisma.Sql[] = [
      Prisma.sql`m.workspace_id = ${input.workspaceId}`,
      Prisma.sql`m.project_id = ${input.projectId}::uuid`,
      Prisma.sql`m.deleted_at IS NULL`,
      Prisma.sql`m.source = ANY(${[...input.sources]}::text[])`,
      Prisma.sql`(m.source <> 'drawing' OR r.id IS NOT NULL)`,
    ];
    if (filter.type === "pdf")
      where.push(Prisma.sql`m.content_type = 'application/pdf'`);
    if (filter.type === "image")
      where.push(Prisma.sql`m.content_type LIKE 'image/%'`);
    if (filter.source != null)
      where.push(Prisma.sql`m.source = ${filter.source}`);
    if (filter.uploadedBy != null)
      where.push(Prisma.sql`m.uploaded_by = ${filter.uploadedBy}`);
    if (filter.from != null || filter.to != null) {
      const zone = await this.timeZone(input.workspaceId);
      const day = Prisma.sql`(m.uploaded_at AT TIME ZONE ${zone})::date`;
      if (filter.from != null)
        where.push(Prisma.sql`${day} >= ${filter.from}::date`);
      if (filter.to != null)
        where.push(Prisma.sql`${day} <= ${filter.to}::date`);
    }
    if (filter.q != null && filter.q.length > 0)
      where.push(Prisma.sql`m.file_name ILIKE ${likePattern(filter.q)}`);
    return where;
  }

  async list(
    input: Parameters<GalleryReader["list"]>[0],
  ): Promise<{ items: GalleryRow[]; total: number; hasMore: boolean }> {
    const where = await this.conditions(input);
    const from = Prisma.sql`
      FROM construction_projects.media_items m
      LEFT JOIN construction_projects.drawing_revisions r
        ON m.source = 'drawing' AND r.file_key = m.file_key AND r.deleted_at IS NULL
    `;
    const filtered = Prisma.join(where, " AND ");
    const backwards = input.before != null;
    const cursor = input.after ?? input.before;
    const page =
      cursor == null
        ? Prisma.sql`TRUE`
        : backwards
          ? Prisma.sql`(m.uploaded_at, m.id) > (${cursor.createdAt}, ${cursor.id}::uuid)`
          : Prisma.sql`(m.uploaded_at, m.id) < (${cursor.createdAt}, ${cursor.id}::uuid)`;
    const order = backwards
      ? Prisma.sql`m.uploaded_at ASC, m.id ASC`
      : Prisma.sql`m.uploaded_at DESC, m.id DESC`;
    const rows = await this.db.$queryRaw<Row[]>(Prisma.sql`
      SELECT m.id::text AS id, m.workspace_id AS "workspaceId",
        m.project_id::text AS "projectId", m.source,
        m.source_id::text AS "sourceId", m.file_key AS "fileKey",
        m.thumb_key AS "thumbKey", m.file_name AS "fileName",
        m.content_type AS "contentType", m.bytes,
        m.uploaded_by AS "uploadedBy", m.uploaded_at AS "uploadedAt",
        r.id::text AS "revisionId"
      ${from}
      WHERE ${filtered} AND ${page}
      ORDER BY ${order}
      LIMIT ${input.limit + 1}
    `);
    const counted = await this.db.$queryRaw<{ total: number }[]>(Prisma.sql`
      SELECT COUNT(*)::int AS total ${from} WHERE ${filtered}
    `);
    const hasMore = rows.length > input.limit;
    const items = rows.slice(0, input.limit);
    if (backwards) items.reverse();
    return { items, total: counted[0]?.total ?? 0, hasMore };
  }

  async uploaderIds(
    input: Parameters<GalleryReader["uploaderIds"]>[0],
  ): Promise<string[]> {
    const rows = await this.db.$queryRaw<{ uploadedBy: string }[]>(Prisma.sql`
      SELECT DISTINCT m.uploaded_by AS "uploadedBy"
      FROM construction_projects.media_items m
      WHERE m.workspace_id = ${input.workspaceId}
        AND m.project_id = ${input.projectId}::uuid
        AND m.deleted_at IS NULL
        AND m.source = ANY(${[...input.sources]}::text[])
    `);
    return rows.map((row) => row.uploadedBy);
  }
}
