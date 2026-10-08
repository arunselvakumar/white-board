import { Prisma, type PrismaClient } from "@repo/db";

import { recordAudit, type AuditEvent } from "@/src/shared-kernel/audit";
import {
  calendarDateFromDb,
  calendarDateToDb,
} from "@/src/shared-kernel/calendar-date";
import { conflict, notFound } from "@/src/shared-kernel/domain-error";

import { Project } from "../domain/project";
import type { ProjectRepository } from "../domain/project-repository";

type Row = Prisma.ConstructionProjectsProjectGetPayload<object>;

export function toProject(row: Row): Project {
  return Project.reconstitute({
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    status: row.status,
    address: row.address,
    startDate: row.startDate == null ? null : calendarDateFromDb(row.startDate),
    endDate: row.endDate == null ? null : calendarDateFromDb(row.endDate),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
  });
}

function detailsData(project: Project) {
  return {
    name: project.name,
    status: project.status,
    address: project.address,
    startDate:
      project.startDate == null ? null : calendarDateToDb(project.startDate),
    endDate: project.endDate == null ? null : calendarDateToDb(project.endDate),
  };
}

function nameInUse(error: unknown): unknown {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  )
    return conflict(
      "PROJECT_NAME_IN_USE",
      "A Project with this name already exists.",
    );
  return error;
}

/** `construction_projects.projects`; names are unique among live rows per Company. */
export class PrismaProjectRepository implements ProjectRepository {
  constructor(private readonly db: PrismaClient) {}

  async findById(workspaceId: string, id: string): Promise<Project | null> {
    const row = await this.db.constructionProjectsProject.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toProject(row);
  }

  async list(
    workspaceId: string,
    ids: ReadonlySet<string> | null,
  ): Promise<Project[]> {
    if (ids?.size === 0) return [];
    const rows = await this.db.constructionProjectsProject.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        ...(ids == null ? {} : { id: { in: [...ids] } }),
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return rows.map(toProject);
  }

  async insert(project: Project, audit: AuditEvent): Promise<void> {
    try {
      await this.db.$transaction(async (tx) => {
        await tx.constructionProjectsProject.create({
          data: {
            id: project.id,
            workspaceId: project.workspaceId,
            ...detailsData(project),
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
            createdBy: project.createdBy,
            updatedBy: project.updatedBy,
          },
        });
        await recordAudit(tx, audit);
      });
    } catch (error) {
      throw nameInUse(error);
    }
  }

  async update(
    project: Project,
    expectedUpdatedAt: Date,
    audit: AuditEvent,
  ): Promise<void> {
    try {
      await this.db.$transaction(async (tx) => {
        // Compare-and-set on updatedAt: a stale edit changes no row.
        const updated = await tx.constructionProjectsProject.updateMany({
          where: {
            id: project.id,
            workspaceId: project.workspaceId,
            deletedAt: null,
            updatedAt: expectedUpdatedAt,
          },
          data: {
            ...detailsData(project),
            updatedAt: project.updatedAt,
            updatedBy: project.updatedBy,
          },
        });
        if (updated.count === 0)
          throw conflict(
            "PROJECT_CHANGED",
            "Someone else changed this Project after you opened it. Reload to see their changes.",
          );
        await recordAudit(tx, audit);
      });
    } catch (error) {
      throw nameInUse(error);
    }
  }

  async delete(project: Project, audit: AuditEvent): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const deleted = await tx.constructionProjectsProject.updateMany({
        where: {
          id: project.id,
          workspaceId: project.workspaceId,
          deletedAt: null,
        },
        data: {
          deletedAt: project.deletedAt,
          deletedBy: project.updatedBy,
          updatedAt: project.updatedAt,
          updatedBy: project.updatedBy,
        },
      });
      if (deleted.count === 0)
        throw notFound("PROJECT_NOT_FOUND", "This Project was not found.");
      await recordAudit(tx, audit);
    });
  }
}
