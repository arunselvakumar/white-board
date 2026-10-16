import { projectStructure } from "@/src/projects/domain/project-type";
import type {
  TrackingContractorFacts,
  TrackingDirectory,
  TrackingDrawingFacts,
  TrackingMemberFacts,
  TrackingNamedFacts,
  TrackingNames,
  TrackingOptions,
  TrackingProjectFacts,
  TrackingReferences,
  TrackingTx,
} from "@/src/tracking/application/ports";
import { fillDeletedUserNames } from "@/src/shared-kernel/user-names";

const unique = (ids: readonly string[] | undefined): string[] => [
  ...new Set(ids ?? []),
];

function byId<T extends { id: string }>(rows: readonly T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]));
}

function nameMap(rows: readonly { id: string; name: string }[]) {
  return new Map(rows.map((row) => [row.id, row.name]));
}

type MemberRow = {
  id: string;
  userId: string | null;
  name: string;
  isOwner: boolean;
  status: string;
  deletedAt: Date | null;
  projects: { projectId: string }[];
};

const MEMBER_SELECT = {
  id: true,
  userId: true,
  name: true,
  isOwner: true,
  status: true,
  deletedAt: true,
} as const;

function toMember(row: MemberRow, projectId: string | null) {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    isOwner: row.isOwner,
    active: row.status === "active" && row.deletedAt == null,
    onProject:
      row.isOwner ||
      (projectId != null &&
        row.projects.some((item) => item.projectId === projectId)),
  } satisfies TrackingMemberFacts;
}

type ContractorRow = {
  id: string;
  name: string;
  isActive: boolean;
  projects: { projectId: string }[];
  departments: { departmentId: string }[];
};

function toContractor(
  row: ContractorRow,
  projectId: string,
): TrackingContractorFacts {
  return {
    id: row.id,
    name: row.name,
    isActive: row.isActive,
    onProject: row.projects.some((item) => item.projectId === projectId),
    departmentIds: row.departments.map((item) => item.departmentId),
  };
}

type DrawingRow = {
  id: string;
  name: string;
  projectId: string;
  album: { name: string };
  revisions: { revision: number }[];
};

function toDrawing(row: DrawingRow, projectId: string): TrackingDrawingFacts {
  return {
    id: row.id,
    name: row.name,
    albumName: row.album.name,
    revision: row.revisions[0]?.revision ?? null,
    onProject: row.projectId === projectId,
  };
}

const DRAWING_SELECT = {
  id: true,
  name: true,
  projectId: true,
  album: { select: { name: true } },
  revisions: {
    where: { deletedAt: null },
    orderBy: { revision: "desc" },
    take: 1,
    select: { revision: true },
  },
} as const;

const named = (row: {
  id: string;
  name: string;
  disabledAt?: Date | null;
}): TrackingNamedFacts => ({
  id: row.id,
  name: row.name,
  disabled: row.disabledAt != null,
});

async function project(
  db: TrackingTx,
  workspaceId: string,
  projectId: string,
): Promise<TrackingProjectFacts | null> {
  const row = await db.constructionProjectsProject.findFirst({
    where: { id: projectId, workspaceId, deletedAt: null },
    select: { id: true, name: true, projectType: true },
  });
  if (row == null) return null;
  return {
    id: row.id,
    name: row.name,
    structure: projectStructure(row.projectType),
  };
}

/**
 * What tracking reads from projects, organization and masters (ADR
 * CM-0019), by table. Lives in composition because it crosses contexts;
 * tracking only sees the `TrackingDirectory` port.
 */
export const trackingDirectory: TrackingDirectory = {
  project,

  async references(db, workspaceId, projectId, ids) {
    const live = (list: readonly string[] | undefined) => ({
      workspaceId,
      id: { in: unique(list) },
      deletedAt: null,
    });
    const want = (list: readonly string[] | undefined) =>
      (list?.length ?? 0) > 0;
    const [
      projectFacts,
      members,
      departments,
      contractors,
      units,
      issueCategories,
      tags,
      drawings,
    ] = await Promise.all([
      project(db, workspaceId, projectId),
      want(ids.memberIds)
        ? db.constructionOrganizationTeamMember.findMany({
            where: live(ids.memberIds),
            select: {
              ...MEMBER_SELECT,
              projects: { where: { projectId }, select: { projectId: true } },
            },
          })
        : [],
      want(ids.departmentIds)
        ? db.constructionMastersDepartment.findMany({
            where: live(ids.departmentIds),
            select: { id: true, name: true, disabledAt: true },
          })
        : [],
      want(ids.contractorIds)
        ? db.constructionMastersContractor.findMany({
            where: live(ids.contractorIds),
            select: {
              id: true,
              name: true,
              isActive: true,
              projects: { where: { projectId }, select: { projectId: true } },
              departments: { select: { departmentId: true } },
            },
          })
        : [],
      want(ids.unitIds)
        ? db.constructionMastersMeasurementUnit.findMany({
            where: live(ids.unitIds),
            select: { id: true, name: true, disabledAt: true },
          })
        : [],
      want(ids.issueCategoryIds)
        ? db.constructionMastersIssueCategory.findMany({
            where: live(ids.issueCategoryIds),
            select: { id: true, name: true, disabledAt: true },
          })
        : [],
      want(ids.tagIds)
        ? db.constructionMastersTag.findMany({
            where: live(ids.tagIds),
            select: { id: true, name: true },
          })
        : [],
      want(ids.drawingIds)
        ? db.constructionProjectsDrawing.findMany({
            where: {
              ...live(ids.drawingIds),
              album: { deletedAt: null },
            },
            select: DRAWING_SELECT,
          })
        : [],
    ]);
    const result: TrackingReferences = {
      project: projectFacts,
      members: byId(members.map((row) => toMember(row, projectId))),
      departments: byId(departments.map(named)),
      contractors: byId(contractors.map((row) => toContractor(row, projectId))),
      units: byId(units.map(named)),
      issueCategories: byId(issueCategories.map(named)),
      tags: byId(tags.map(named)),
      drawings: byId(drawings.map((row) => toDrawing(row, projectId))),
    };
    return result;
  },

  async names(db, workspaceId, ids) {
    const any = (list: readonly string[] | undefined) => ({
      workspaceId,
      id: { in: unique(list) },
    });
    const want = (list: readonly string[] | undefined) =>
      (list?.length ?? 0) > 0;
    const select = { id: true, name: true } as const;
    const [
      members,
      users,
      departments,
      contractors,
      units,
      issueCategories,
      tags,
      drawings,
    ] = await Promise.all([
      want(ids.memberIds)
        ? db.constructionOrganizationTeamMember.findMany({
            where: any(ids.memberIds),
            select,
          })
        : [],
      want(ids.userIds)
        ? db.constructionOrganizationTeamMember.findMany({
            where: { workspaceId, userId: { in: unique(ids.userIds) } },
            select: { userId: true, name: true, deletedAt: true },
            // A removed Team Member's name still says who; a live row wins.
            orderBy: [{ deletedAt: { sort: "desc", nulls: "last" } }],
          })
        : [],
      want(ids.departmentIds)
        ? db.constructionMastersDepartment.findMany({
            where: any(ids.departmentIds),
            select,
          })
        : [],
      want(ids.contractorIds)
        ? db.constructionMastersContractor.findMany({
            where: any(ids.contractorIds),
            select,
          })
        : [],
      want(ids.unitIds)
        ? db.constructionMastersMeasurementUnit.findMany({
            where: any(ids.unitIds),
            select,
          })
        : [],
      want(ids.issueCategoryIds)
        ? db.constructionMastersIssueCategory.findMany({
            where: any(ids.issueCategoryIds),
            select,
          })
        : [],
      want(ids.tagIds)
        ? db.constructionMastersTag.findMany({
            where: any(ids.tagIds),
            select,
          })
        : [],
      want(ids.drawingIds)
        ? db.constructionProjectsDrawing.findMany({
            where: any(ids.drawingIds),
            select,
          })
        : [],
    ]);
    const result: TrackingNames = {
      members: nameMap(members),
      // A User who deleted their account reads "Deleted user" (CM-907).
      users: await fillDeletedUserNames(
        db,
        unique(ids.userIds),
        new Map(
          users.flatMap((row) =>
            row.userId == null ? [] : [[row.userId, row.name] as const],
          ),
        ),
      ),
      departments: nameMap(departments),
      contractors: nameMap(contractors),
      units: nameMap(units),
      issueCategories: nameMap(issueCategories),
      tags: nameMap(tags),
      drawings: nameMap(drawings),
    };
    return result;
  },

  async options(db, workspaceId, projectId, kinds) {
    const want = new Set(kinds);
    const base = { workspaceId, deletedAt: null };
    const byName = { name: "asc" } as const;
    const [
      members,
      departments,
      contractors,
      units,
      issueCategories,
      tags,
      drawings,
    ] = await Promise.all([
      want.has("members")
        ? db.constructionOrganizationTeamMember.findMany({
            where: {
              ...base,
              status: "active",
              OR: [{ isOwner: true }, { projects: { some: { projectId } } }],
            },
            select: {
              ...MEMBER_SELECT,
              projects: { where: { projectId }, select: { projectId: true } },
            },
            orderBy: byName,
          })
        : [],
      want.has("departments")
        ? db.constructionMastersDepartment.findMany({
            where: { ...base, disabledAt: null },
            select: { id: true, name: true, disabledAt: true },
            orderBy: byName,
          })
        : [],
      want.has("contractors")
        ? db.constructionMastersContractor.findMany({
            where: {
              ...base,
              isActive: true,
              projects: { some: { projectId } },
            },
            select: {
              id: true,
              name: true,
              isActive: true,
              projects: { where: { projectId }, select: { projectId: true } },
              departments: { select: { departmentId: true } },
            },
            orderBy: byName,
          })
        : [],
      want.has("units")
        ? db.constructionMastersMeasurementUnit.findMany({
            where: { ...base, disabledAt: null },
            select: { id: true, name: true, disabledAt: true },
            orderBy: byName,
          })
        : [],
      want.has("issueCategories")
        ? db.constructionMastersIssueCategory.findMany({
            where: { ...base, disabledAt: null },
            select: { id: true, name: true, disabledAt: true },
            orderBy: byName,
          })
        : [],
      want.has("tags")
        ? db.constructionMastersTag.findMany({
            where: base,
            select: { id: true, name: true },
            orderBy: byName,
          })
        : [],
      want.has("drawings")
        ? db.constructionProjectsDrawing.findMany({
            where: { ...base, projectId, album: { deletedAt: null } },
            select: DRAWING_SELECT,
            orderBy: [{ album: { name: "asc" } }, { name: "asc" }],
          })
        : [],
    ]);
    const result: TrackingOptions = {
      members: members.map((row) => toMember(row, projectId)),
      departments: departments.map(named),
      contractors: contractors.map((row) => toContractor(row, projectId)),
      units: units.map(named),
      issueCategories: issueCategories.map(named),
      tags: tags.map(named),
      drawings: drawings.map((row) => toDrawing(row, projectId)),
    };
    return result;
  },

  async memberOfUser(db, workspaceId, userId) {
    const row = await db.constructionOrganizationTeamMember.findFirst({
      where: { workspaceId, userId, deletedAt: null },
      select: { ...MEMBER_SELECT, projects: { select: { projectId: true } } },
    });
    return row == null ? null : toMember(row, null);
  },
};
