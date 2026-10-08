import { Prisma, type PrismaClient } from "@repo/db";

/** Bytes a Company stores (CM-116 usage, CM-118 limit). */
export type StorageMeter = {
  bytesUsed(workspaceId: string): Promise<number>;
};

/**
 * Sums live rows of `construction_organization.stored_files`
 * (`workspace_id`, `bytes`, `deleted_at`), which the Company profile work
 * adds. Until that table exists in the database it reports 0, so this file
 * is the one place to change when uploads land.
 */
export class PrismaStoredFilesMeter implements StorageMeter {
  private tableExists: boolean | null = null;

  constructor(private readonly db: PrismaClient) {}

  private async hasTable(): Promise<boolean> {
    if (this.tableExists === true) return true;
    const rows = await this.db.$queryRaw<{ exists: boolean }[]>(
      Prisma.sql`SELECT to_regclass('construction_organization.stored_files') IS NOT NULL AS "exists"`,
    );
    this.tableExists = rows[0]?.exists === true;
    return this.tableExists;
  }

  async bytesUsed(workspaceId: string): Promise<number> {
    if (!(await this.hasTable())) return 0;
    const rows = await this.db.$queryRaw<{ bytes: bigint | null }[]>(
      Prisma.sql`SELECT COALESCE(SUM(bytes), 0)::bigint AS "bytes"
        FROM construction_organization.stored_files
        WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL`,
    );
    return Number(rows[0]?.bytes ?? 0n);
  }
}
