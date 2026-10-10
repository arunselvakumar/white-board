import type { Prisma, PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import {
  calendarDateFromDb,
  calendarDateToDb,
  todayIn,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { conflict, notFound } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import type {
  VendorListPage,
  VendorListParams,
  VendorStore,
} from "../application/vendor-handlers";
import { liveEntries } from "../domain/ledger";
import { Vendor } from "../domain/vendor";
import { lockLiveParties } from "./party-locks";
import { prismaLedger } from "./prisma-ledger";

type Tx = Prisma.TransactionClient;

const INCLUDE = {
  projects: { select: { projectId: true } },
  shifts: {
    where: { deletedAt: null },
    orderBy: { sortOrder: "asc" },
    include: { rates: { orderBy: { id: "asc" } } },
  },
} as const satisfies Prisma.ConstructionLabourVendorInclude;

type Row = Prisma.ConstructionLabourVendorGetPayload<{
  include: typeof INCLUDE;
}>;

function toDomain(row: Row): Vendor {
  return Vendor.reconstitute({
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    joiningDate: calendarDateFromDb(row.joiningDate),
    contactNumber: row.contactNumber,
    address: row.address,
    isActive: row.isActive,
    photoKey: row.photoKey,
    projectIds: row.projects.map((project) => project.projectId),
    shifts: row.shifts.map((shift) => ({
      id: shift.id,
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      sortOrder: shift.sortOrder,
      rates: shift.rates.map((rate) => ({
        labourCategoryId: rate.labourCategoryId,
        ratePerDay: rate.ratePerDay,
        overtimePerHour: rate.overtimePerHour,
      })),
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
  });
}

/** What the audit log keeps of a vendor. */
function snapshot(vendor: Vendor) {
  return {
    name: vendor.name,
    joiningDate: vendor.joiningDate,
    contactNumber: vendor.contactNumber,
    address: vendor.address,
    isActive: vendor.isActive,
    projectIds: vendor.projectIds,
    shifts: vendor.shifts,
  };
}

/**
 * Rate rows in rate card order. The table has no position column, so ids
 * carry it: UUID v7 sorts by its millisecond timestamp, one step per row.
 */
function rateRows(vendor: Vendor, now: Date) {
  const start = now.getTime();
  return vendor.shifts
    .flatMap((shift) =>
      shift.rates.map((rate) => ({
        shiftId: shift.id,
        labourCategoryId: rate.labourCategoryId,
        ratePerDay: rate.ratePerDay,
        overtimePerHour: rate.overtimePerHour,
      })),
    )
    .map((row, index) => ({ id: newId(start + index), ...row }));
}

/**
 * FOR UPDATE on the live vendor row: waits for any attendance or payment
 * being written for it (they hold FOR SHARE, `lockLiveParties`).
 */
function lock(tx: Tx, workspaceId: string, id: string): Promise<void> {
  return lockLiveParties(tx, workspaceId, "vendor", [id], "update");
}

async function writeProjects(tx: Tx, vendor: Vendor): Promise<void> {
  await tx.constructionLabourVendorProject.deleteMany({
    where: { vendorId: vendor.id },
  });
  if (vendor.projectIds.length > 0)
    await tx.constructionLabourVendorProject.createMany({
      data: vendor.projectIds.map((projectId) => ({
        vendorId: vendor.id,
        projectId,
      })),
    });
}

/** Inserts new shifts, updates kept ones, replaces their rates, removes the rest. */
async function writeRateCard(tx: Tx, vendor: Vendor, now: Date): Promise<void> {
  const stored = await tx.constructionLabourVendorShift.findMany({
    where: { vendorId: vendor.id, deletedAt: null },
    select: { id: true },
  });
  const keep = new Set(vendor.shifts.map((shift) => shift.id));
  const removed = stored.map((row) => row.id).filter((id) => !keep.has(id));
  if (removed.length > 0)
    await tx.constructionLabourVendorShift.updateMany({
      where: { id: { in: removed } },
      data: { deletedAt: now },
    });
  const existing = new Set(stored.map((row) => row.id));
  for (const shift of vendor.shifts) {
    const data = {
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      sortOrder: shift.sortOrder,
    };
    if (existing.has(shift.id)) {
      await tx.constructionLabourVendorShift.update({
        where: { id: shift.id },
        data,
      });
      await tx.constructionLabourVendorRate.deleteMany({
        where: { shiftId: shift.id },
      });
    } else {
      await tx.constructionLabourVendorShift.create({
        data: { id: shift.id, vendorId: vendor.id, ...data },
      });
    }
  }
  const rates = rateRows(vendor, now);
  if (rates.length > 0)
    await tx.constructionLabourVendorRate.createMany({ data: rates });
}

function openingEntry(vendor: Vendor, amount: number) {
  return {
    partyType: "vendor" as const,
    partyId: vendor.id,
    projectId: null,
    entryDate: vendor.joiningDate,
    kind: "opening" as const,
    amount,
    sourceType: "vendor" as const,
    sourceId: vendor.id,
    reversesEntryId: null,
  };
}

/** The vendor register in `construction_labour` (CM-208). */
export class PrismaVendorStore implements VendorStore {
  constructor(private readonly db: PrismaClient) {}

  async find(workspaceId: string, id: string): Promise<Vendor | null> {
    const row = await this.db.constructionLabourVendor.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: INCLUDE,
    });
    return row == null ? null : toDomain(row);
  }

  async list(params: VendorListParams): Promise<VendorListPage> {
    const search = params.search?.trim() ?? "";
    const filters: Prisma.ConstructionLabourVendorWhereInput[] = [
      { workspaceId: params.workspaceId, deletedAt: null },
    ];
    if (params.isActive != null) filters.push({ isActive: params.isActive });
    if (params.projectId != null)
      filters.push({ projects: { some: { projectId: params.projectId } } });
    if (search.length > 0) {
      const digits = search.replace(/[^\d]/g, "");
      filters.push({
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          ...(digits.length >= 3
            ? [{ contactNumber: { contains: digits } }]
            : []),
        ],
      });
    }
    // Newest first; `after` pages forward (older), `before` pages back.
    const backwards = params.before != null;
    const cursor = params.after ?? params.before;
    const page = await this.db.constructionLabourVendor.findMany({
      where: {
        AND:
          cursor == null
            ? filters
            : [
                ...filters,
                {
                  OR: backwards
                    ? [
                        { createdAt: { gt: cursor.createdAt } },
                        { createdAt: cursor.createdAt, id: { gt: cursor.id } },
                      ]
                    : [
                        { createdAt: { lt: cursor.createdAt } },
                        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                      ],
                },
              ],
      },
      include: INCLUDE,
      orderBy: backwards
        ? [{ createdAt: "asc" }, { id: "asc" }]
        : [{ createdAt: "desc" }, { id: "desc" }],
      take: params.limit + 1,
    });
    const hasMore = page.length > params.limit;
    const rows = page.slice(0, params.limit);
    if (backwards) rows.reverse();
    const total = await this.db.constructionLabourVendor.count({
      where: { AND: filters },
    });
    return { items: rows.map(toDomain), total, hasMore };
  }

  async listForProject(
    workspaceId: string,
    projectId: string,
  ): Promise<Vendor[]> {
    const rows = await this.db.constructionLabourVendor.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        isActive: true,
        projects: { some: { projectId } },
      },
      include: INCLUDE,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return rows.map(toDomain);
  }

  async listOnProject(
    workspaceId: string,
    projectId: string,
  ): Promise<Vendor[]> {
    const rows = await this.db.constructionLabourVendor.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        projects: { some: { projectId } },
      },
      include: INCLUDE,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return rows.map(toDomain);
  }

  async listActive(workspaceId: string): Promise<Vendor[]> {
    const rows = await this.db.constructionLabourVendor.findMany({
      where: { workspaceId, deletedAt: null, isActive: true },
      include: INCLUDE,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return rows.map(toDomain);
  }

  async findMany(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Vendor[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.constructionLabourVendor.findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] }, deletedAt: null },
      include: INCLUDE,
    });
    return rows.map(toDomain);
  }

  async updateProjects(
    changes: readonly {
      vendor: Vendor;
      loadedAt: Date;
      projectId: string;
      joined: boolean;
      before: readonly string[];
    }[],
    by: string,
  ): Promise<void> {
    await this.db.$transaction(async (tx) => {
      for (const { vendor, loadedAt, projectId, joined, before } of changes) {
        const updated = await tx.constructionLabourVendor.updateMany({
          where: {
            id: vendor.id,
            workspaceId: vendor.workspaceId,
            deletedAt: null,
            updatedAt: loadedAt,
          },
          data: { updatedAt: vendor.updatedAt, updatedBy: by },
        });
        if (updated.count === 0)
          throw conflict(
            "VENDOR_CHANGED",
            "Someone else changed this Vendor after you opened it. Reload to see their changes.",
          );
        if (joined)
          await tx.constructionLabourVendorProject.createMany({
            data: [{ vendorId: vendor.id, projectId }],
            skipDuplicates: true,
          });
        else
          await tx.constructionLabourVendorProject.deleteMany({
            where: { vendorId: vendor.id, projectId },
          });
        await recordAudit(tx, {
          workspaceId: vendor.workspaceId,
          actorUserId: by,
          action: "vendor.projects_changed",
          entityType: "vendor",
          entityId: vendor.id,
          before: { projectIds: before },
          after: { projectIds: vendor.projectIds },
          occurredAt: vendor.updatedAt,
        });
      }
    });
  }

  async insert(
    vendor: Vendor,
    openingBalance: number,
    by: string,
  ): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await tx.constructionLabourVendor.create({
        data: {
          id: vendor.id,
          workspaceId: vendor.workspaceId,
          name: vendor.name,
          joiningDate: calendarDateToDb(vendor.joiningDate),
          contactNumber: vendor.contactNumber,
          address: vendor.address,
          isActive: vendor.isActive,
          createdAt: vendor.createdAt,
          updatedAt: vendor.updatedAt,
          createdBy: by,
          updatedBy: by,
        },
      });
      await writeProjects(tx, vendor);
      await writeRateCard(tx, vendor, vendor.createdAt);
      await prismaLedger.post(tx, vendor.workspaceId, by, [
        openingEntry(vendor, openingBalance),
      ]);
      await recordAudit(tx, {
        workspaceId: vendor.workspaceId,
        actorUserId: by,
        action: "vendor.created",
        entityType: "vendor",
        entityId: vendor.id,
        after: { ...snapshot(vendor), openingBalance },
        occurredAt: vendor.createdAt,
      });
    });
  }

  async update(
    vendor: Vendor,
    expectedUpdatedAt: Date,
    openingBalance: number | null,
    by: string,
  ): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const beforeRow = await tx.constructionLabourVendor.findFirst({
        where: {
          id: vendor.id,
          workspaceId: vendor.workspaceId,
          deletedAt: null,
        },
        include: INCLUDE,
      });
      if (beforeRow == null)
        throw notFound("VENDOR_NOT_FOUND", "This Vendor was not found.");
      // Compare-and-set on updatedAt: a stale edit changes no row.
      const updated = await tx.constructionLabourVendor.updateMany({
        where: {
          id: vendor.id,
          deletedAt: null,
          updatedAt: expectedUpdatedAt,
        },
        data: {
          name: vendor.name,
          joiningDate: calendarDateToDb(vendor.joiningDate),
          contactNumber: vendor.contactNumber,
          address: vendor.address,
          updatedAt: vendor.updatedAt,
          updatedBy: by,
        },
      });
      if (updated.count === 0)
        throw conflict(
          "VENDOR_CHANGED",
          "Someone else changed this Vendor after you opened it. Reload to see their changes.",
        );
      await writeProjects(tx, vendor);
      await writeRateCard(tx, vendor, vendor.updatedAt);

      const openings = liveEntries(
        await prismaLedger.entriesFor(tx, vendor.workspaceId, {
          partyType: "vendor",
          partyId: vendor.id,
        }),
      ).filter(
        (entry) => entry.sourceType === "vendor" && entry.kind === "opening",
      );
      const current = openings.reduce((sum, entry) => sum + entry.amount, 0);
      const target = openingBalance ?? current;
      const moved = openings.some(
        (entry) => entry.entryDate !== vendor.joiningDate,
      );
      if (target !== current || moved) {
        await prismaLedger.reverseSource(
          tx,
          vendor.workspaceId,
          by,
          "vendor",
          vendor.id,
        );
        await prismaLedger.post(tx, vendor.workspaceId, by, [
          openingEntry(vendor, target),
        ]);
      }
      await recordAudit(tx, {
        workspaceId: vendor.workspaceId,
        actorUserId: by,
        action: "vendor.updated",
        entityType: "vendor",
        entityId: vendor.id,
        before: { ...snapshot(toDomain(beforeRow)), openingBalance: current },
        after: { ...snapshot(vendor), openingBalance: target },
        occurredAt: vendor.updatedAt,
      });
    });
  }

  async setActive(vendor: Vendor, by: string): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const updated = await tx.constructionLabourVendor.updateMany({
        where: {
          id: vendor.id,
          workspaceId: vendor.workspaceId,
          deletedAt: null,
        },
        data: {
          isActive: vendor.isActive,
          updatedAt: vendor.updatedAt,
          updatedBy: by,
        },
      });
      if (updated.count === 0)
        throw notFound("VENDOR_NOT_FOUND", "This Vendor was not found.");
      await recordAudit(tx, {
        workspaceId: vendor.workspaceId,
        actorUserId: by,
        action: vendor.isActive ? "vendor.activated" : "vendor.deactivated",
        entityType: "vendor",
        entityId: vendor.id,
        occurredAt: vendor.updatedAt,
      });
    });
  }

  async delete(vendor: Vendor, by: string): Promise<void> {
    const now = vendor.deletedAt ?? new Date();
    await this.db.$transaction(async (tx) => {
      await lock(tx, vendor.workspaceId, vendor.id);
      const [attendance, payments] = await Promise.all([
        tx.constructionLabourVendorAttendance.count({
          where: { vendorId: vendor.id, deletedAt: null },
        }),
        tx.constructionLabourWagePayment.count({
          where: {
            workspaceId: vendor.workspaceId,
            partyType: "vendor",
            partyId: vendor.id,
            deletedAt: null,
          },
        }),
      ]);
      if (attendance > 0 || payments > 0)
        throw conflict(
          "VENDOR_HAS_RECORDS",
          "This Vendor has attendance or payments, so it cannot be deleted. Deactivate it instead.",
        );
      await tx.constructionLabourVendor.update({
        where: { id: vendor.id },
        data: { deletedAt: now, deletedBy: by, updatedAt: now, updatedBy: by },
      });
      await prismaLedger.reverseSource(
        tx,
        vendor.workspaceId,
        by,
        "vendor",
        vendor.id,
      );
      await recordAudit(tx, {
        workspaceId: vendor.workspaceId,
        actorUserId: by,
        action: "vendor.deleted",
        entityType: "vendor",
        entityId: vendor.id,
        before: snapshot(vendor),
        occurredAt: now,
      });
    });
  }

  openingBalances(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, number>> {
    return prismaLedger.openingBalances(this.db, workspaceId, "vendor", ids);
  }

  balances(
    workspaceId: string,
    ids: readonly string[],
    on: CalendarDate,
  ): Promise<Map<string, number>> {
    return prismaLedger.balances(this.db, workspaceId, "vendor", ids, on);
  }

  async today(workspaceId: string): Promise<CalendarDate> {
    const profile =
      await this.db.constructionOrganizationCompanyProfile.findUnique({
        where: { workspaceId },
        select: { timezone: true },
      });
    return todayIn(profile?.timezone ?? "Asia/Kolkata");
  }
}
