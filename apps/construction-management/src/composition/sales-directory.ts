import { projectStructure } from "@/src/projects/domain/project-type";
import type {
  SalesDirectory,
  SalesMemberFacts,
  SalesTx,
  SalesWingFacts,
} from "@/src/sales/application/ports";
import {
  fillDeletedUserNames,
  userNamesInCompany,
} from "@/src/shared-kernel/user-names";

const unique = (ids: readonly string[]): string[] => [...new Set(ids)];

const MEMBER_SELECT = {
  id: true,
  userId: true,
  name: true,
  mobile: true,
  isOwner: true,
  status: true,
  deletedAt: true,
  projects: { select: { projectId: true } },
} as const;

type MemberRow = {
  id: string;
  userId: string | null;
  name: string;
  mobile: string | null;
  isOwner: boolean;
  status: string;
  deletedAt: Date | null;
  projects: { projectId: string }[];
};

function toMember(row: MemberRow, projectId: string): SalesMemberFacts {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    mobile: row.mobile,
    isOwner: row.isOwner,
    active: row.status === "active" && row.deletedAt == null,
    onProject:
      row.isOwner || row.projects.some((item) => item.projectId === projectId),
  };
}

const WING_SELECT = {
  id: true,
  name: true,
  wingType: true,
  phaseId: true,
  deletedAt: true,
  phase: { select: { name: true, deletedAt: true } },
} as const;

type WingRow = {
  id: string;
  name: string;
  wingType: string;
  phaseId: string;
  deletedAt: Date | null;
  phase: { name: string; deletedAt: Date | null };
};

function toWing(row: WingRow): SalesWingFacts {
  return {
    id: row.id,
    name: row.name,
    type: row.wingType,
    phaseId: row.phaseId,
    phaseName: row.phase.name,
  };
}

/**
 * What sales reads from projects and organization (ADR CM-0022), by table.
 * Lives in composition because it crosses contexts; sales only sees the
 * `SalesDirectory` port.
 */
export const salesDirectory: SalesDirectory = {
  async project(db, workspaceId, projectId) {
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
  },

  async members(db, workspaceId, projectId, memberIds) {
    if (memberIds.length === 0) return new Map();
    const rows = await db.constructionOrganizationTeamMember.findMany({
      where: { workspaceId, id: { in: unique(memberIds) } },
      select: MEMBER_SELECT,
    });
    return new Map(rows.map((row) => [row.id, toMember(row, projectId)]));
  },

  async membersOnProject(db, workspaceId, projectId) {
    const rows = await db.constructionOrganizationTeamMember.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        status: "active",
        OR: [{ isOwner: true }, { projects: { some: { projectId } } }],
      },
      select: MEMBER_SELECT,
      orderBy: [{ isOwner: "desc" }, { name: "asc" }],
    });
    return rows.map((row) => toMember(row, projectId));
  },

  async memberOfUser(db, workspaceId, userId, projectId) {
    const row = await db.constructionOrganizationTeamMember.findFirst({
      where: { workspaceId, userId, deletedAt: null },
      select: MEMBER_SELECT,
    });
    return row == null ? null : toMember(row, projectId);
  },

  async wings(db, workspaceId, projectId) {
    const rows = await db.constructionProjectsWing.findMany({
      where: {
        workspaceId,
        projectId,
        deletedAt: null,
        phase: { deletedAt: null },
      },
      select: {
        ...WING_SELECT,
        phase: { select: { name: true, deletedAt: true, position: true } },
        floors: {
          where: { deletedAt: null },
          orderBy: { level: "desc" },
          select: {
            id: true,
            name: true,
            kind: true,
            level: true,
            units: {
              where: { deletedAt: null },
              orderBy: { position: "asc" },
              select: { id: true, name: true, position: true },
            },
          },
        },
      },
      orderBy: [{ phase: { position: "asc" } }, { position: "asc" }],
    });
    return rows.map((row) => ({
      ...toWing(row),
      floors: row.floors.map((floor) => ({ ...floor, kind: floor.kind })),
    }));
  },

  async wingsById(db, workspaceId, projectId, wingIds) {
    if (wingIds.length === 0) return new Map();
    const rows = await db.constructionProjectsWing.findMany({
      where: { workspaceId, projectId, id: { in: unique(wingIds) } },
      select: WING_SELECT,
    });
    return new Map(
      rows.map((row) => [
        row.id,
        {
          ...toWing(row),
          deleted: row.deletedAt != null || row.phase.deletedAt != null,
        },
      ]),
    );
  },

  async units(db, workspaceId, projectId, unitIds) {
    if (unitIds.length === 0) return new Map();
    const rows = await db.constructionProjectsUnit.findMany({
      where: {
        workspaceId,
        id: { in: unique(unitIds) },
        wing: { projectId },
      },
      select: {
        id: true,
        name: true,
        position: true,
        wingId: true,
        floorId: true,
        deletedAt: true,
        floor: { select: { name: true, deletedAt: true } },
        wing: {
          select: { deletedAt: true, phase: { select: { deletedAt: true } } },
        },
      },
    });
    return new Map(
      rows.map((row) => [
        row.id,
        {
          id: row.id,
          name: row.name,
          position: row.position,
          wingId: row.wingId,
          floorId: row.floorId,
          floorName: row.floor.name,
          deleted:
            row.deletedAt != null ||
            row.floor.deletedAt != null ||
            row.wing.deletedAt != null ||
            row.wing.phase.deletedAt != null,
        },
      ]),
    );
  },

  async userNames(db: SalesTx, workspaceId, userIds) {
    const names = await userNamesInCompany(db, workspaceId, userIds);
    return fillDeletedUserNames(db, userIds, names);
  },
};
