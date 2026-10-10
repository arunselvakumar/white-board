import type { Prisma, PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import { conflict } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import type { BranchStore, StoredBranch } from "../application/branch-handlers";
import type { BranchDetails, Fence } from "../domain/branch";
import {
  isUniqueViolation,
  lockKey,
  staleOrMissing,
  type Tx,
} from "./prisma-calendar-support";

const BRANCH_INCLUDE = {
  members: { select: { memberId: true }, orderBy: { memberId: "asc" } },
} as const;

type BranchRow = Prisma.ConstructionHrmsBranchGetPayload<{
  include: typeof BRANCH_INCLUDE;
}>;

function toStored(row: BranchRow): StoredBranch {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    address: row.address,
    projectId: row.projectId,
    latitude: row.latitude.toNumber(),
    longitude: row.longitude.toNumber(),
    radiusMetres: row.radiusMetres,
    memberIds: row.members.map((member) => member.memberId),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function columns(branch: BranchDetails) {
  return {
    kind: branch.kind,
    name: branch.name,
    address: branch.address,
    projectId: branch.projectId,
    latitude: branch.latitude.toFixed(6),
    longitude: branch.longitude.toFixed(6),
    radiusMetres: branch.radiusMetres,
  };
}

function audited(branch: StoredBranch) {
  const { createdAt: _created, updatedAt: _updated, ...rest } = branch;
  return rest;
}

const MISSING = {
  code: "BRANCH_NOT_FOUND",
  message: "This branch or site was removed.",
};
const STALE = {
  code: "BRANCH_CHANGED",
  message:
    "Someone else changed this branch after you opened it. Reload to see their changes.",
};

function taken(branch: BranchDetails) {
  return branch.kind === "office_branch"
    ? conflict(
        "BRANCH_NAME_TAKEN",
        `An office branch is already called “${branch.name}”.`,
        { field: "name" },
      )
    : conflict(
        "PROJECT_SITE_TAKEN",
        "This Project already has a site fence. Edit that one instead.",
        { field: "projectId" },
      );
}

/**
 * `construction_hrms.branches` and `member_branches` (CM-304). Also the
 * fence source for `MemberFences`.
 */
export class PrismaBranchStore implements BranchStore {
  constructor(private readonly db: PrismaClient) {}

  async list(workspaceId: string): Promise<StoredBranch[]> {
    const rows = await this.db.constructionHrmsBranch.findMany({
      where: { workspaceId, deletedAt: null },
      include: BRANCH_INCLUDE,
      orderBy: [{ kind: "asc" }, { name: "asc" }, { id: "asc" }],
    });
    return rows.map(toStored);
  }

  async find(workspaceId: string, id: string): Promise<StoredBranch | null> {
    const row = await this.db.constructionHrmsBranch.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: BRANCH_INCLUDE,
    });
    return row == null ? null : toStored(row);
  }

  async fences(workspaceId: string): Promise<Fence[]> {
    const rows = await this.db.constructionHrmsBranch.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      name: row.name,
      projectId: row.projectId,
      latitude: row.latitude.toNumber(),
      longitude: row.longitude.toNumber(),
      radiusMetres: row.radiusMetres,
    }));
  }

  async linkedBranchIds(
    workspaceId: string,
    memberId: string,
  ): Promise<string[]> {
    const rows = await this.db.constructionHrmsMemberBranch.findMany({
      where: {
        workspaceId,
        memberId,
        branch: { deletedAt: null, kind: "office_branch" },
      },
      select: { branchId: true },
    });
    return rows.map((row) => row.branchId);
  }

  /** "One site fence per Project", checked under a per-Project lock. */
  private async assertSiteFree(
    tx: Tx,
    workspaceId: string,
    branch: BranchDetails,
    exceptId: string | null,
  ): Promise<void> {
    if (branch.projectId == null) return;
    await lockKey(tx, `hrms-site:${workspaceId}:${branch.projectId}`);
    const other = await tx.constructionHrmsBranch.findFirst({
      where: {
        workspaceId,
        projectId: branch.projectId,
        deletedAt: null,
        ...(exceptId == null ? {} : { id: { not: exceptId } }),
      },
      select: { id: true },
    });
    if (other != null) throw taken(branch);
  }

  async create(input: {
    workspaceId: string;
    branch: BranchDetails;
    by: string;
    now: Date;
  }): Promise<StoredBranch> {
    try {
      return await this.db.$transaction(async (tx) => {
        await this.assertSiteFree(tx, input.workspaceId, input.branch, null);
        const row = await tx.constructionHrmsBranch.create({
          data: {
            id: newId(input.now.getTime()),
            workspaceId: input.workspaceId,
            ...columns(input.branch),
            createdAt: input.now,
            updatedAt: input.now,
            createdBy: input.by,
            updatedBy: input.by,
          },
          include: BRANCH_INCLUDE,
        });
        const stored = toStored(row);
        await recordAudit(tx, {
          workspaceId: input.workspaceId,
          actorUserId: input.by,
          action: "hrms_branch.created",
          entityType: "hrms_branch",
          entityId: row.id,
          after: audited(stored),
          occurredAt: input.now,
        });
        return stored;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw taken(input.branch);
      throw error;
    }
  }

  private async guardedUpdate(
    tx: Tx,
    input: {
      workspaceId: string;
      id: string;
      expectedUpdatedAt: Date;
      by: string;
      now: Date;
    },
    data: Prisma.ConstructionHrmsBranchUpdateManyMutationInput,
  ): Promise<void> {
    const { count } = await tx.constructionHrmsBranch.updateMany({
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
        deletedAt: null,
        updatedAt: input.expectedUpdatedAt,
      },
      data: { ...data, updatedAt: input.now, updatedBy: input.by },
    });
    if (count === 1) return;
    const exists = await tx.constructionHrmsBranch.count({
      where: { id: input.id, workspaceId: input.workspaceId, deletedAt: null },
    });
    staleOrMissing(exists > 0, MISSING, STALE);
  }

  private async load(tx: Tx, workspaceId: string, id: string) {
    const row = await tx.constructionHrmsBranch.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: BRANCH_INCLUDE,
    });
    if (row == null) staleOrMissing(false, MISSING, STALE);
    return toStored(row);
  }

  async update(input: {
    workspaceId: string;
    id: string;
    branch: BranchDetails;
    expectedUpdatedAt: Date;
    by: string;
    now: Date;
  }): Promise<StoredBranch> {
    try {
      return await this.db.$transaction(async (tx) => {
        const before = await this.load(tx, input.workspaceId, input.id);
        await this.assertSiteFree(
          tx,
          input.workspaceId,
          input.branch,
          input.id,
        );
        await this.guardedUpdate(tx, input, columns(input.branch));
        const after = await this.load(tx, input.workspaceId, input.id);
        await recordAudit(tx, {
          workspaceId: input.workspaceId,
          actorUserId: input.by,
          action: "hrms_branch.updated",
          entityType: "hrms_branch",
          entityId: input.id,
          before: audited(before),
          after: audited(after),
          occurredAt: input.now,
        });
        return after;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw taken(input.branch);
      throw error;
    }
  }

  async remove(input: {
    workspaceId: string;
    id: string;
    by: string;
    now: Date;
  }): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const before = await this.load(tx, input.workspaceId, input.id);
      await tx.constructionHrmsBranch.updateMany({
        where: { id: input.id, workspaceId: input.workspaceId },
        data: {
          deletedAt: input.now,
          deletedBy: input.by,
          updatedAt: input.now,
          updatedBy: input.by,
        },
      });
      await tx.constructionHrmsMemberBranch.deleteMany({
        where: { workspaceId: input.workspaceId, branchId: input.id },
      });
      await recordAudit(tx, {
        workspaceId: input.workspaceId,
        actorUserId: input.by,
        action: "hrms_branch.removed",
        entityType: "hrms_branch",
        entityId: input.id,
        before: audited(before),
        occurredAt: input.now,
      });
    });
  }

  async setMembers(input: {
    workspaceId: string;
    id: string;
    memberIds: readonly string[];
    expectedUpdatedAt: Date;
    by: string;
    now: Date;
  }): Promise<StoredBranch> {
    return this.db.$transaction(async (tx) => {
      const before = await this.load(tx, input.workspaceId, input.id);
      await this.guardedUpdate(tx, input, {});
      await tx.constructionHrmsMemberBranch.deleteMany({
        where: { workspaceId: input.workspaceId, branchId: input.id },
      });
      if (input.memberIds.length > 0)
        await tx.constructionHrmsMemberBranch.createMany({
          data: input.memberIds.map((memberId) => ({
            workspaceId: input.workspaceId,
            memberId,
            branchId: input.id,
            createdAt: input.now,
            createdBy: input.by,
          })),
        });
      const after = await this.load(tx, input.workspaceId, input.id);
      await recordAudit(tx, {
        workspaceId: input.workspaceId,
        actorUserId: input.by,
        action: "hrms_branch.members_changed",
        entityType: "hrms_branch",
        entityId: input.id,
        before: { memberIds: before.memberIds },
        after: { memberIds: after.memberIds },
        occurredAt: input.now,
      });
      return after;
    });
  }
}
