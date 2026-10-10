import { Prisma, type PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";

import type { DashboardSectionSetting } from "../domain/dashboard-sections";
import type { ProjectModuleKey } from "../domain/project-modules";
import type {
  PreferenceChange,
  ProjectCounts,
  ProjectPreferenceStore,
  ProjectStructureCounts,
} from "../domain/project-preferences";

/**
 * Hidden modules, pins and member preferences in `construction_projects`
 * (CM-411, CM-412). A member's preferences are one row per Company and
 * User; pins one row per pinned Project.
 */
export class PrismaProjectPreferences implements ProjectPreferenceStore {
  constructor(private readonly db: PrismaClient) {}

  async hiddenModules(workspaceId: string, projectId: string) {
    const rows = await this.db.constructionProjectsHiddenModule.findMany({
      where: { workspaceId, projectId },
      orderBy: { moduleKey: "asc" },
      select: { moduleKey: true },
    });
    return rows.map((row) => row.moduleKey);
  }

  async setHiddenModules(input: {
    workspaceId: string;
    projectId: string;
    keys: readonly ProjectModuleKey[];
    before: readonly string[];
    change: PreferenceChange;
  }): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await tx.constructionProjectsHiddenModule.deleteMany({
        where: { workspaceId: input.workspaceId, projectId: input.projectId },
      });
      if (input.keys.length > 0)
        await tx.constructionProjectsHiddenModule.createMany({
          data: input.keys.map((moduleKey) => ({
            workspaceId: input.workspaceId,
            projectId: input.projectId,
            moduleKey,
            hiddenBy: input.change.by,
            hiddenAt: input.change.now,
          })),
        });
      await recordAudit(tx, {
        workspaceId: input.workspaceId,
        actorUserId: input.change.by,
        action: "project.modules_hidden",
        entityType: "project",
        entityId: input.projectId,
        before: { hiddenModules: input.before },
        after: { hiddenModules: input.keys },
        occurredAt: input.change.now,
      });
    });
  }

  async structureRows(workspaceId: string, projectId: string) {
    const rows = await this.db.$queryRaw<
      { wings: boolean; locations: boolean }[]
    >(Prisma.sql`
      SELECT
        EXISTS (
          SELECT 1 FROM construction_projects.wings
          WHERE workspace_id = ${workspaceId}
            AND project_id = ${projectId}::uuid
            AND deleted_at IS NULL
        ) AS "wings",
        EXISTS (
          SELECT 1 FROM construction_projects.locations
          WHERE workspace_id = ${workspaceId}
            AND project_id = ${projectId}::uuid
            AND deleted_at IS NULL
        ) AS "locations"
    `);
    return {
      wings: rows[0]?.wings === true,
      locations: rows[0]?.locations === true,
    };
  }

  async memberPreferences(workspaceId: string, userId: string) {
    const row = await this.db.constructionProjectsMemberPreference.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    return {
      tileOrder: row?.tileOrder ?? [],
      dashboardSections: row?.dashboardSections ?? null,
    };
  }

  private async audit(
    tx: Prisma.TransactionClient,
    input: { workspaceId: string; userId: string; action: string },
    before: unknown,
    after: unknown,
    change: PreferenceChange,
  ) {
    await recordAudit(tx, {
      workspaceId: input.workspaceId,
      actorUserId: change.by,
      action: input.action,
      entityType: "member_preference",
      entityId: input.userId,
      before,
      after,
      occurredAt: change.now,
    });
  }

  async setTileOrder(input: {
    workspaceId: string;
    userId: string;
    keys: readonly ProjectModuleKey[];
    change: PreferenceChange;
  }): Promise<void> {
    const key = { workspaceId: input.workspaceId, userId: input.userId };
    await this.db.$transaction(async (tx) => {
      const before = await tx.constructionProjectsMemberPreference.findUnique({
        where: { workspaceId_userId: key },
        select: { tileOrder: true },
      });
      await tx.constructionProjectsMemberPreference.upsert({
        where: { workspaceId_userId: key },
        create: {
          ...key,
          tileOrder: [...input.keys],
          updatedAt: input.change.now,
        },
        update: { tileOrder: [...input.keys], updatedAt: input.change.now },
      });
      await this.audit(
        tx,
        { ...key, action: "member.tile_order_changed" },
        { tileOrder: before?.tileOrder ?? [] },
        { tileOrder: input.keys },
        input.change,
      );
    });
  }

  async setDashboardSections(input: {
    workspaceId: string;
    userId: string;
    sections: readonly DashboardSectionSetting[];
    change: PreferenceChange;
  }): Promise<void> {
    const key = { workspaceId: input.workspaceId, userId: input.userId };
    const sections = input.sections.map(({ key: section, visible }) => ({
      key: section,
      visible,
    }));
    await this.db.$transaction(async (tx) => {
      const before = await tx.constructionProjectsMemberPreference.findUnique({
        where: { workspaceId_userId: key },
        select: { dashboardSections: true },
      });
      await tx.constructionProjectsMemberPreference.upsert({
        where: { workspaceId_userId: key },
        create: {
          ...key,
          dashboardSections: sections,
          updatedAt: input.change.now,
        },
        update: { dashboardSections: sections, updatedAt: input.change.now },
      });
      await this.audit(
        tx,
        { ...key, action: "member.dashboard_layout_changed" },
        { dashboardSections: before?.dashboardSections ?? null },
        { dashboardSections: sections },
        input.change,
      );
    });
  }

  async pinnedIds(workspaceId: string, userId: string): Promise<Set<string>> {
    const rows = await this.db.constructionProjectsPin.findMany({
      where: { workspaceId, userId },
      select: { projectId: true },
    });
    return new Set(rows.map((row) => row.projectId));
  }

  async setPinned(input: {
    workspaceId: string;
    userId: string;
    projectId: string;
    pinned: boolean;
    change: PreferenceChange;
  }): Promise<void> {
    const key = {
      workspaceId: input.workspaceId,
      userId: input.userId,
      projectId: input.projectId,
    };
    await this.db.$transaction(async (tx) => {
      const changed = input.pinned
        ? (
            await tx.constructionProjectsPin.createMany({
              data: [{ ...key, pinnedAt: input.change.now }],
              skipDuplicates: true,
            })
          ).count
        : (await tx.constructionProjectsPin.deleteMany({ where: key })).count;
      if (changed === 0) return;
      await recordAudit(tx, {
        workspaceId: input.workspaceId,
        actorUserId: input.change.by,
        action: input.pinned ? "project.pinned" : "project.unpinned",
        entityType: "project",
        entityId: input.projectId,
        occurredAt: input.change.now,
      });
    });
  }
}

/**
 * Live rows per kind on a Project (CM-412): Wings with their live Floors
 * and Units, Locations, drawings, testing reports and documents.
 */
export class PrismaProjectCounts implements ProjectCounts {
  constructor(private readonly db: PrismaClient) {}

  async count(
    workspaceId: string,
    projectId: string,
  ): Promise<ProjectStructureCounts> {
    const rows = await this.db.$queryRaw<
      Record<keyof ProjectStructureCounts, number>[]
    >(Prisma.sql`
      WITH live_wings AS (
        SELECT id FROM construction_projects.wings
        WHERE workspace_id = ${workspaceId}
          AND project_id = ${projectId}::uuid
          AND deleted_at IS NULL
      )
      SELECT
        (SELECT count(*) FROM live_wings)::int AS "wings",
        (SELECT count(*) FROM construction_projects.floors
          WHERE wing_id IN (SELECT id FROM live_wings)
            AND deleted_at IS NULL)::int AS "floors",
        (SELECT count(*) FROM construction_projects.units u
          JOIN construction_projects.floors f ON f.id = u.floor_id
          WHERE u.wing_id IN (SELECT id FROM live_wings)
            AND u.deleted_at IS NULL
            AND f.deleted_at IS NULL)::int AS "units",
        (SELECT count(*) FROM construction_projects.locations
          WHERE workspace_id = ${workspaceId}
            AND project_id = ${projectId}::uuid
            AND deleted_at IS NULL)::int AS "locations",
        (SELECT count(*) FROM construction_projects.drawings
          WHERE workspace_id = ${workspaceId}
            AND project_id = ${projectId}::uuid
            AND deleted_at IS NULL)::int AS "drawings",
        (SELECT count(*) FROM construction_projects.testing_reports
          WHERE workspace_id = ${workspaceId}
            AND project_id = ${projectId}::uuid
            AND deleted_at IS NULL)::int AS "testingReports",
        (SELECT count(*) FROM construction_projects.documents
          WHERE workspace_id = ${workspaceId}
            AND project_id = ${projectId}::uuid
            AND deleted_at IS NULL)::int AS "documents"
    `);
    const row = rows[0];
    return {
      wings: row?.wings ?? 0,
      floors: row?.floors ?? 0,
      units: row?.units ?? 0,
      locations: row?.locations ?? 0,
      drawings: row?.drawings ?? 0,
      testingReports: row?.testingReports ?? 0,
      documents: row?.documents ?? 0,
    };
  }
}
