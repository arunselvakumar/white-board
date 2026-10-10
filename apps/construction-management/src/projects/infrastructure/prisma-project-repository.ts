import { Prisma, type PrismaClient } from "@repo/construction-db";

import { recordAudit, type AuditEvent } from "@/src/shared-kernel/audit";
import {
  calendarDateFromDb,
  calendarDateToDb,
} from "@/src/shared-kernel/calendar-date";
import { conflict, notFound } from "@/src/shared-kernel/domain-error";
import {
  markStoredFileDeleted,
  recordStoredFile,
} from "@/src/shared-kernel/files/stored-files";
import { newId } from "@/src/shared-kernel/ids";

import { Project } from "../domain/project";
import type {
  ProjectFileChange,
  ProjectRepository,
} from "../domain/project-repository";
import {
  SEED_DRAWING_ALBUMS,
  SEED_TESTING_ITEMS,
} from "../domain/project-seeds";

/** Every read brings the custom fields, in their order on the form. */
const withCustomFields = {
  customFields: { orderBy: { position: "asc" } },
} satisfies Prisma.ConstructionProjectsProjectInclude;

type Row = Prisma.ConstructionProjectsProjectGetPayload<{
  include: typeof withCustomFields;
}>;

type Tx = Prisma.TransactionClient;

function dateFromDb(value: Date | null) {
  return value == null ? null : calendarDateFromDb(value);
}

function dateToDb(value: string | null) {
  return value == null ? null : calendarDateToDb(value);
}

export function toProject(row: Row): Project {
  return Project.reconstitute({
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    status: row.status,
    address: row.address,
    startDate: dateFromDb(row.startDate),
    endDate: dateFromDb(row.endDate),
    clientName: row.clientName,
    clientPhone: row.clientPhone,
    tenderRef: row.tenderRef,
    quotationNo: row.quotationNo,
    quotationDate: dateFromDb(row.quotationDate),
    loaNo: row.loaNo,
    loaDate: dateFromDb(row.loaDate),
    clientOrderNo: row.clientOrderNo,
    clientOrderDate: dateFromDb(row.clientOrderDate),
    agreementNo: row.agreementNo,
    agreementDate: dateFromDb(row.agreementDate),
    // At most ₹1,000 crore in paise, well inside a safe integer.
    orderValue: row.orderValue == null ? null : Number(row.orderValue),
    projectType: row.projectType,
    // Capped at ₹1,000 crore in paise too.
    budgetValue: row.budgetValue == null ? null : Number(row.budgetValue),
    useLogoInReports: row.useLogoInReports,
    logoKey: row.logoKey,
    customFields: row.customFields.map(({ label, value }) => ({
      label,
      value,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
  });
}

function detailsData(project: Project) {
  const contract = project.contract;
  const profile = project.profile;
  return {
    projectType: profile.projectType,
    budgetValue:
      profile.budgetValue == null ? null : BigInt(profile.budgetValue),
    useLogoInReports: profile.useLogoInReports,
    logoKey: profile.logoKey,
    name: project.name,
    status: project.status,
    address: project.address,
    startDate: dateToDb(project.startDate),
    endDate: dateToDb(project.endDate),
    clientName: contract.clientName,
    clientPhone: contract.clientPhone,
    tenderRef: contract.tenderRef,
    quotationNo: contract.quotationNo,
    quotationDate: dateToDb(contract.quotationDate),
    loaNo: contract.loaNo,
    loaDate: dateToDb(contract.loaDate),
    clientOrderNo: contract.clientOrderNo,
    clientOrderDate: dateToDb(contract.clientOrderDate),
    agreementNo: contract.agreementNo,
    agreementDate: dateToDb(contract.agreementDate),
    orderValue:
      contract.orderValue == null ? null : BigInt(contract.orderValue),
  };
}

/** The custom fields are saved with the Project: the whole list each time. */
async function writeCustomFields(tx: Tx, project: Project): Promise<void> {
  await tx.constructionProjectsCustomField.deleteMany({
    where: { projectId: project.id, workspaceId: project.workspaceId },
  });
  if (project.customFields.length === 0) return;
  await tx.constructionProjectsCustomField.createMany({
    data: project.customFields.map((field, position) => ({
      id: newId(),
      workspaceId: project.workspaceId,
      projectId: project.id,
      label: field.label,
      value: field.value,
      position,
    })),
  });
}

/**
 * The drawing albums and testing items a new Project starts with (ADR
 * CM-0013 §8–9), marked `is_seed`.
 */
async function writeSeeds(tx: Tx, project: Project): Promise<void> {
  const seed = (name: string) => ({
    id: newId(),
    workspaceId: project.workspaceId,
    projectId: project.id,
    name,
    isSeed: true,
    createdAt: project.createdAt,
    updatedAt: project.createdAt,
    createdBy: project.createdBy,
    updatedBy: project.createdBy,
  });
  await tx.constructionProjectsDrawingAlbum.createMany({
    data: SEED_DRAWING_ALBUMS.map(seed),
  });
  await tx.constructionProjectsTestingItem.createMany({
    data: SEED_TESTING_ITEMS.map(seed),
  });
}

/** A logo's `stored_files` rows, in the Project's transaction. */
async function writeFiles(
  tx: Tx,
  project: Project,
  files: ProjectFileChange | undefined,
): Promise<void> {
  if (files?.removedKey != null)
    await markStoredFileDeleted(
      tx,
      project.workspaceId,
      files.removedKey,
      project.updatedAt,
    );
  if (files?.added != null) await recordStoredFile(tx, files.added);
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
      include: withCustomFields,
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
      include: withCustomFields,
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
        await writeCustomFields(tx, project);
        await writeSeeds(tx, project);
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
    files?: ProjectFileChange,
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
        await writeCustomFields(tx, project);
        await writeFiles(tx, project, files);
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
