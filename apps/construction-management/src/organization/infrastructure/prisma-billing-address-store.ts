import { Prisma, type PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";

import type { BillingAddressStore } from "../application/billing-address-handlers";
import {
  billingAddressChanged,
  billingAddressNameInUse,
  billingAddressNotFound,
  billingAddressSnapshot,
  compareBillingAddresses,
  type BillingAddress,
  type BillingAddressDetails,
} from "../domain/billing-address";

type Row = Prisma.ConstructionOrganizationBillingAddressGetPayload<object>;
type Tx = Prisma.TransactionClient;

function toAddress(row: Row): BillingAddress {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    address: row.address,
    stateCode: row.stateCode,
    gstin: row.gstin,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function detailColumns(details: BillingAddressDetails) {
  return {
    name: details.name,
    address: details.address,
    stateCode: details.stateCode,
    gstin: details.gstin,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

const ENTITY = "billing_address";

export class PrismaBillingAddressStore implements BillingAddressStore {
  constructor(private readonly db: PrismaClient) {}

  /**
   * One write at a time per Company: the "one default" and "first is the
   * default" rules read other rows, so writers queue on an advisory lock.
   * Under it the only unique index left to trip is the live name.
   */
  private async write<T>(
    workspaceId: string,
    work: (tx: Tx) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.db.$transaction(async (tx) => {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${`construction_organization.billing_addresses:${workspaceId}`}, 0))
        `;
        return work(tx);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw billingAddressNameInUse();
      throw error;
    }
  }

  private async live(tx: Tx, workspaceId: string, id: string): Promise<Row> {
    const row = await tx.constructionOrganizationBillingAddress.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (row == null) throw billingAddressNotFound();
    return row;
  }

  async list(workspaceId: string): Promise<BillingAddress[]> {
    const rows = await this.db.constructionOrganizationBillingAddress.findMany({
      where: { workspaceId, deletedAt: null },
    });
    return rows.map(toAddress).sort(compareBillingAddresses);
  }

  async find(workspaceId: string, id: string): Promise<BillingAddress | null> {
    const row = await this.db.constructionOrganizationBillingAddress.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toAddress(row);
  }

  insert(input: {
    id: string;
    workspaceId: string;
    details: BillingAddressDetails;
    by: string;
    now: Date;
  }): Promise<BillingAddress> {
    return this.write(input.workspaceId, async (tx) => {
      const others = await tx.constructionOrganizationBillingAddress.count({
        where: { workspaceId: input.workspaceId, deletedAt: null },
      });
      const row = await tx.constructionOrganizationBillingAddress.create({
        data: {
          id: input.id,
          workspaceId: input.workspaceId,
          ...detailColumns(input.details),
          isDefault: others === 0,
          createdAt: input.now,
          updatedAt: input.now,
          createdBy: input.by,
          updatedBy: input.by,
        },
      });
      await recordAudit(tx, {
        workspaceId: input.workspaceId,
        actorUserId: input.by,
        action: "billing_address.created",
        entityType: ENTITY,
        entityId: row.id,
        after: billingAddressSnapshot(row),
        occurredAt: input.now,
      });
      return toAddress(row);
    });
  }

  update(input: {
    workspaceId: string;
    id: string;
    details: BillingAddressDetails;
    expectedUpdatedAt: Date;
    by: string;
    now: Date;
  }): Promise<BillingAddress> {
    return this.write(input.workspaceId, async (tx) => {
      const before = await this.live(tx, input.workspaceId, input.id);
      if (before.updatedAt.getTime() !== input.expectedUpdatedAt.getTime())
        throw billingAddressChanged();
      const row = await tx.constructionOrganizationBillingAddress.update({
        where: { id: input.id },
        data: {
          ...detailColumns(input.details),
          updatedAt: input.now,
          updatedBy: input.by,
        },
      });
      await recordAudit(tx, {
        workspaceId: input.workspaceId,
        actorUserId: input.by,
        action: "billing_address.updated",
        entityType: ENTITY,
        entityId: row.id,
        before: billingAddressSnapshot(before),
        after: billingAddressSnapshot(row),
        occurredAt: input.now,
      });
      return toAddress(row);
    });
  }

  makeDefault(input: {
    workspaceId: string;
    id: string;
    by: string;
    now: Date;
  }): Promise<BillingAddress> {
    return this.write(input.workspaceId, async (tx) => {
      const target = await this.live(tx, input.workspaceId, input.id);
      if (target.isDefault) return toAddress(target);
      return toAddress(
        await this.promote(tx, target, {
          workspaceId: input.workspaceId,
          by: input.by,
          now: input.now,
        }),
      );
    });
  }

  delete(input: {
    workspaceId: string;
    id: string;
    by: string;
    now: Date;
  }): Promise<void> {
    return this.write(input.workspaceId, async (tx) => {
      const before = await this.live(tx, input.workspaceId, input.id);
      await tx.constructionOrganizationBillingAddress.update({
        where: { id: input.id },
        data: {
          isDefault: false,
          deletedAt: input.now,
          deletedBy: input.by,
          updatedAt: input.now,
          updatedBy: input.by,
        },
      });
      await recordAudit(tx, {
        workspaceId: input.workspaceId,
        actorUserId: input.by,
        action: "billing_address.deleted",
        entityType: ENTITY,
        entityId: input.id,
        before: billingAddressSnapshot(before),
        occurredAt: input.now,
      });
      if (!before.isDefault) return;
      const oldest = await tx.constructionOrganizationBillingAddress.findFirst({
        where: { workspaceId: input.workspaceId, deletedAt: null },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      if (oldest != null)
        await this.promote(tx, oldest, {
          workspaceId: input.workspaceId,
          by: input.by,
          now: input.now,
        });
    });
  }

  /**
   * Makes `target` the default. The old default is unset first, because
   * the partial unique index allows one live default per Company.
   */
  private async promote(
    tx: Tx,
    target: Row,
    change: { workspaceId: string; by: string; now: Date },
  ): Promise<Row> {
    const previous = await tx.constructionOrganizationBillingAddress.findFirst({
      where: {
        workspaceId: change.workspaceId,
        isDefault: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (previous != null)
      await tx.constructionOrganizationBillingAddress.update({
        where: { id: previous.id },
        data: { isDefault: false, updatedAt: change.now, updatedBy: change.by },
      });
    const row = await tx.constructionOrganizationBillingAddress.update({
      where: { id: target.id },
      data: { isDefault: true, updatedAt: change.now, updatedBy: change.by },
    });
    await recordAudit(tx, {
      workspaceId: change.workspaceId,
      actorUserId: change.by,
      action: "billing_address.made_default",
      entityType: ENTITY,
      entityId: row.id,
      before: { isDefault: false, previousDefaultId: previous?.id ?? null },
      after: { isDefault: true },
      occurredAt: change.now,
    });
    return row;
  }
}
