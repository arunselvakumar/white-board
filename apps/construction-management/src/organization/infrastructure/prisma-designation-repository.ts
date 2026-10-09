import { Prisma, type PrismaClient } from "@repo/construction-db";

import { PermissionSet } from "@/src/shared-kernel/access";
import { conflict } from "@/src/shared-kernel/domain-error";

import { Designation } from "../domain/designation";
import type { DesignationRepository } from "../domain/designation-repository";

type Row = Prisma.ConstructionOrganizationDesignationGetPayload<object>;

type Writer = Pick<PrismaClient, "constructionOrganizationDesignation">;

export function toDesignation(row: Row): Designation {
  const template =
    row.permissionTemplate != null &&
    typeof row.permissionTemplate === "object" &&
    !Array.isArray(row.permissionTemplate)
      ? PermissionSet.fromMasks(
          row.permissionTemplate as Record<string, number>,
        )
      : null;
  return Designation.reconstitute({
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    isSeed: row.isSeed,
    template,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
  });
}

export function designationData(designation: Designation) {
  return {
    id: designation.id,
    workspaceId: designation.workspaceId,
    name: designation.name,
    isSeed: designation.isSeed,
    permissionTemplate:
      designation.template == null
        ? Prisma.DbNull
        : (designation.template.toMasks() as Prisma.InputJsonObject),
    createdAt: designation.createdAt,
    updatedAt: designation.updatedAt,
    createdBy: designation.createdBy,
    updatedBy: designation.updatedBy,
    deletedAt: designation.deletedAt,
  };
}

function mapWriteError(error: unknown): unknown {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  )
    return conflict(
      "DESIGNATION_NAME_IN_USE",
      "A Designation with this name already exists.",
    );
  return error;
}

/** Writes many Designations (the seed copy) inside a caller's transaction. */
export async function insertDesignations(
  db: Writer,
  designations: readonly Designation[],
): Promise<void> {
  if (designations.length === 0) return;
  await db.constructionOrganizationDesignation.createMany({
    data: designations.map(designationData),
  });
}

export class PrismaDesignationRepository implements DesignationRepository {
  constructor(private readonly db: PrismaClient) {}

  async save(designation: Designation): Promise<void> {
    const data = designationData(designation);
    try {
      await this.db.constructionOrganizationDesignation.upsert({
        where: { id: designation.id },
        create: data,
        update: {
          name: data.name,
          permissionTemplate: data.permissionTemplate,
          updatedAt: data.updatedAt,
          updatedBy: data.updatedBy,
          deletedAt: data.deletedAt,
        },
      });
    } catch (error) {
      throw mapWriteError(error);
    }
  }

  async findById(workspaceId: string, id: string): Promise<Designation | null> {
    const row = await this.db.constructionOrganizationDesignation.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toDesignation(row);
  }

  async listAll(workspaceId: string): Promise<Designation[]> {
    const rows = await this.db.constructionOrganizationDesignation.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return rows.map(toDesignation);
  }
}
