import { Prisma, type PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import {
  calendarDateFromDb,
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { companyTimezone } from "@/src/shared-kernel/company-today";
import { DomainError } from "@/src/shared-kernel/domain-error";
import { recordStoredFile } from "@/src/shared-kernel/files/stored-files";
import { userNamesInCompany } from "@/src/shared-kernel/user-names";

import type {
  CheckInEntry,
  CheckInListParams,
  CheckInPersonRecord,
  CheckInStore,
  CheckInTransaction,
  PersonStanding,
  SiteEngineerDirectory,
  SiteFenceDirectory,
} from "../application/check-in-handlers";
import type {
  CheckInAction,
  CheckInPersonKind,
  LiveEntry,
} from "../domain/check-in";
import {
  clearDayInTx,
  lockedDayInTx,
  saveDayInTx,
  toLabourer,
} from "./labour-attendance-store";
import { onProjectOn } from "./labour-project-on";
import { lockLiveParties } from "./party-locks";
import { PrismaLabourQueries } from "./prisma-labour-queries";
import { siteEngineerContactsOn } from "./project-site-engineers";

type Row = Prisma.ConstructionLabourCheckInEventGetPayload<object>;

type Person = { kind: CheckInPersonKind; id: string };

/** Entries are written in this order; ties on the instant break by id. */
const OLDEST_FIRST = [
  { occurredAt: "asc" },
  { id: "asc" },
] as const satisfies Prisma.ConstructionLabourCheckInEventOrderByWithRelationInput[];

const NEWEST_FIRST = [
  { occurredAt: "desc" },
  { id: "desc" },
] as const satisfies Prisma.ConstructionLabourCheckInEventOrderByWithRelationInput[];

function decimal(value: Prisma.Decimal | null): number | null {
  return value == null ? null : Number(value.toString());
}

export function toEntry(row: Row): CheckInEntry {
  const latitude = decimal(row.latitude);
  const longitude = decimal(row.longitude);
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    kind: row.personKind,
    personId: row.personId,
    action: row.action,
    occurredAt: row.occurredAt,
    attendanceDate: calendarDateFromDb(row.attendanceDate),
    photoKey: row.photoKey,
    location:
      latitude == null || longitude == null
        ? null
        : {
            latitude,
            longitude,
            accuracyMetres: decimal(row.accuracyMetres),
          },
    fence:
      row.outsideFence == null
        ? null
        : {
            outsideFence: row.outsideFence,
            metresOutside: row.metresOutside ?? 0,
          },
    recordedBy: row.createdBy,
    voided:
      row.voidedAt == null
        ? null
        : {
            at: row.voidedAt,
            by: row.voidedBy ?? "",
            reason: row.voidReason ?? "",
          },
  };
}

function toLive(row: {
  id: string;
  action: CheckInAction;
  occurredAt: Date;
  attendanceDate: Date;
}): LiveEntry {
  return {
    id: row.id,
    action: row.action,
    occurredAt: row.occurredAt,
    attendanceDate: calendarDateFromDb(row.attendanceDate),
  };
}

const LIVE_SELECT = {
  id: true,
  action: true,
  occurredAt: true,
  attendanceDate: true,
} as const;

/** Labours and Vendors as Check-In lists them. */
function partyPerson(
  kind: "labour" | "vendor",
  row: {
    id: string;
    name: string;
    labourCode?: string | null;
    labourCategoryId?: string | null;
    contactNumber: string | null;
    photoKey: string | null;
  },
): CheckInPersonRecord {
  return {
    kind,
    id: row.id,
    name: row.name,
    labourCategoryId: row.labourCategoryId ?? null,
    code: kind === "labour" ? (row.labourCode ?? null) : null,
    phone: row.contactNumber,
    photoKey: row.photoKey,
  };
}

/** The person's entries are serialised on this lock (ADR CM-0043 §2). */
function lockKey(person: Person): string {
  return `construction_labour.check_in:${person.kind}:${person.id}`;
}

function transaction(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  person: Person,
): CheckInTransaction {
  const mine = {
    workspaceId,
    personKind: person.kind,
    personId: person.id,
  };
  return {
    async lastLive(projectId) {
      const row = await tx.constructionLabourCheckInEvent.findFirst({
        where: { ...mine, projectId, voidedAt: null },
        orderBy: NEWEST_FIRST,
        select: LIVE_SELECT,
      });
      return row == null ? null : toLive(row);
    },
    async entry(id) {
      const row = await tx.constructionLabourCheckInEvent.findFirst({
        where: { id, workspaceId },
      });
      return row == null ? null : toEntry(row);
    },
    async insert(entry, file, audit) {
      await tx.constructionLabourCheckInEvent.create({
        data: {
          id: entry.id,
          workspaceId,
          projectId: entry.projectId,
          personKind: entry.kind,
          personId: entry.personId,
          action: entry.action,
          occurredAt: entry.occurredAt,
          attendanceDate: calendarDateToDb(entry.attendanceDate),
          photoKey: entry.photoKey,
          latitude: entry.location?.latitude ?? null,
          longitude: entry.location?.longitude ?? null,
          accuracyMetres: entry.location?.accuracyMetres ?? null,
          outsideFence: entry.fence?.outsideFence ?? null,
          metresOutside: entry.fence?.metresOutside ?? null,
          createdAt: entry.occurredAt,
          createdBy: entry.recordedBy,
        },
      });
      await recordStoredFile(tx, file);
      await recordAudit(tx, audit);
    },
    async markVoided(id, voided, audit) {
      const updated = await tx.constructionLabourCheckInEvent.updateMany({
        where: { id, workspaceId, voidedAt: null },
        data: {
          voidedAt: voided.at,
          voidedBy: voided.by,
          voidReason: voided.reason,
        },
      });
      if (updated.count === 0) return false;
      await recordAudit(tx, audit);
      return true;
    },
    async liveEntriesOn(projectId, date) {
      const rows = await tx.constructionLabourCheckInEvent.findMany({
        where: {
          ...mine,
          projectId,
          attendanceDate: calendarDateToDb(date),
          voidedAt: null,
        },
        orderBy: OLDEST_FIRST,
        select: LIVE_SELECT,
      });
      return rows.map(toLive);
    },
    async labourer(labourId) {
      try {
        // A delete waits for this day to be written, then refuses.
        await lockLiveParties(tx, workspaceId, "labour", [labourId], "share");
      } catch (error) {
        if (error instanceof DomainError && error.code === "LABOUR_NOT_FOUND")
          return null;
        throw error;
      }
      const row = await tx.constructionLabourLabour.findFirst({
        where: { id: labourId, workspaceId, deletedAt: null },
      });
      return row == null ? null : toLabourer(row);
    },
    async onProject(labourId, projectId, date) {
      return (await onProjectOn(tx, [labourId], projectId, date)).has(labourId);
    },
    day(labourId, projectId, date) {
      return lockedDayInTx(tx, { workspaceId, labourId, projectId, date });
    },
    async saveDay(write, by, now) {
      await saveDayInTx(tx, { workspaceId, write, reason: "marked", by, now });
    },
    clearDay(day, by, now) {
      return clearDayInTx(tx, {
        workspaceId,
        day,
        expectedUpdatedAt: day.updatedAt,
        by,
        now,
      });
    },
  };
}

/**
 * The Check-In log in `construction_labour.check_in_events` (ADR CM-0043)
 * and the reads around it. A person's entries are written inside one
 * transaction that holds an advisory lock on the person.
 */
export class PrismaCheckInStore implements CheckInStore {
  constructor(private readonly db: PrismaClient) {}

  timeZone(workspaceId: string): Promise<string> {
    return companyTimezone(this.db, workspaceId);
  }

  async labour(workspaceId: string, id: string) {
    const row = await this.db.constructionLabourLabour.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (row == null) return null;
    return { person: partyPerson("labour", row), labourer: toLabourer(row) };
  }

  async labourOnProject(
    _workspaceId: string,
    labourId: string,
    projectId: string,
    date: CalendarDate,
  ): Promise<boolean> {
    // The labourer was read for this Company first.
    return (await onProjectOn(this.db, [labourId], projectId, date)).has(
      labourId,
    );
  }

  async laboursOn(
    workspaceId: string,
    projectId: string,
    date: CalendarDate,
  ): Promise<CheckInPersonRecord[]> {
    // The marking sheet's own read of who is on the Project that day.
    const options = await new PrismaLabourQueries(this.db).options(
      workspaceId,
      projectId,
      date,
    );
    if (options.length === 0) return [];
    const rows = await this.db.constructionLabourLabour.findMany({
      where: { workspaceId, id: { in: options.map((option) => option.id) } },
      select: {
        id: true,
        name: true,
        labourCode: true,
        labourCategoryId: true,
        contactNumber: true,
        photoKey: true,
      },
    });
    return rows.map((row) => partyPerson("labour", row));
  }

  async vendor(workspaceId: string, id: string, projectId: string) {
    const row = await this.db.constructionLabourVendor.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: {
        projects: { where: { projectId }, select: { projectId: true } },
      },
    });
    if (row == null) return null;
    return {
      person: partyPerson("vendor", row),
      isActive: row.isActive,
      assigned: row.projects.length > 0,
    };
  }

  async vendorsOn(
    workspaceId: string,
    projectId: string,
  ): Promise<CheckInPersonRecord[]> {
    const rows = await this.db.constructionLabourVendor.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        isActive: true,
        projects: { some: { projectId } },
      },
      select: { id: true, name: true, contactNumber: true, photoKey: true },
    });
    return rows.map((row) => partyPerson("vendor", row));
  }

  async standing(
    workspaceId: string,
    projectId: string,
    person: Person,
    today: CalendarDate,
  ): Promise<PersonStanding> {
    const where = {
      workspaceId,
      projectId,
      personKind: person.kind,
      personId: person.id,
      voidedAt: null,
    };
    const [last, entriesToday] = await Promise.all([
      this.db.constructionLabourCheckInEvent.findFirst({
        where,
        orderBy: NEWEST_FIRST,
        select: LIVE_SELECT,
      }),
      this.db.constructionLabourCheckInEvent.count({
        where: { ...where, attendanceDate: calendarDateToDb(today) },
      }),
    ]);
    return { last: last == null ? null : toLive(last), entriesToday };
  }

  async standings(
    workspaceId: string,
    projectId: string,
    since: Date,
    today: CalendarDate,
  ): Promise<Map<string, PersonStanding>> {
    const rows = await this.db.$queryRaw<
      {
        kind: CheckInPersonKind;
        personId: string;
        id: string;
        action: CheckInAction;
        occurredAt: Date;
        attendanceDate: Date;
        entriesToday: number;
      }[]
    >(Prisma.sql`
      SELECT DISTINCT ON (person_kind, person_id)
        person_kind::text AS kind,
        person_id::text AS "personId",
        id::text AS id,
        action::text AS action,
        occurred_at AS "occurredAt",
        attendance_date AS "attendanceDate",
        (count(*) FILTER (WHERE attendance_date = ${today}::date)
          OVER (PARTITION BY person_kind, person_id))::int AS "entriesToday"
      FROM construction_labour.check_in_events
      WHERE workspace_id = ${workspaceId}
        AND project_id = ${projectId}::uuid
        AND voided_at IS NULL
        AND occurred_at >= ${since}
      ORDER BY person_kind, person_id, occurred_at DESC, id DESC
    `);
    return new Map(
      rows.map((row) => [
        `${row.kind}:${row.personId}`,
        { last: toLive(row), entriesToday: row.entriesToday },
      ]),
    );
  }

  async entry(workspaceId: string, id: string): Promise<CheckInEntry | null> {
    const row = await this.db.constructionLabourCheckInEvent.findFirst({
      where: { id, workspaceId },
    });
    return row == null ? null : toEntry(row);
  }

  async entriesOf(
    workspaceId: string,
    projectId: string,
    person: Person,
    dates: readonly CalendarDate[],
  ): Promise<CheckInEntry[]> {
    const rows = await this.db.constructionLabourCheckInEvent.findMany({
      where: {
        workspaceId,
        projectId,
        personKind: person.kind,
        personId: person.id,
        attendanceDate: { in: dates.map(calendarDateToDb) },
      },
      orderBy: OLDEST_FIRST,
    });
    return rows.map(toEntry);
  }

  async list(
    params: CheckInListParams,
  ): Promise<{ items: CheckInEntry[]; total: number; hasMore: boolean }> {
    const filters: Prisma.ConstructionLabourCheckInEventWhereInput[] = [
      {
        workspaceId: params.workspaceId,
        projectId: params.projectId,
        attendanceDate: calendarDateToDb(params.date),
      },
    ];
    if (params.kind != null) filters.push({ personKind: params.kind });
    if (params.people != null) {
      const byKind = new Map<CheckInPersonKind, string[]>();
      for (const person of params.people)
        byKind.set(person.kind, [
          ...(byKind.get(person.kind) ?? []),
          person.id,
        ]);
      filters.push({
        OR: [...byKind].map(([personKind, ids]) => ({
          personKind,
          personId: { in: ids },
        })),
      });
    }
    // Newest first, then id; `after` pages to older entries.
    const backwards = params.before != null;
    const cursor = params.after ?? params.before;
    const page = await this.db.constructionLabourCheckInEvent.findMany({
      where: {
        AND:
          cursor == null
            ? filters
            : [
                ...filters,
                {
                  OR: backwards
                    ? [
                        { occurredAt: { gt: cursor.createdAt } },
                        { occurredAt: cursor.createdAt, id: { gt: cursor.id } },
                      ]
                    : [
                        { occurredAt: { lt: cursor.createdAt } },
                        { occurredAt: cursor.createdAt, id: { lt: cursor.id } },
                      ],
                },
              ],
      },
      orderBy: backwards ? OLDEST_FIRST : NEWEST_FIRST,
      take: params.limit + 1,
    });
    const hasMore = page.length > params.limit;
    const rows = page.slice(0, params.limit);
    if (backwards) rows.reverse();
    const total = await this.db.constructionLabourCheckInEvent.count({
      where: { AND: filters },
    });
    return { items: rows.map(toEntry), total, hasMore };
  }

  async partiesNamed(
    workspaceId: string,
    q: string,
  ): Promise<{ kind: "labour" | "vendor"; id: string }[]> {
    const where = {
      workspaceId,
      name: { contains: q, mode: "insensitive" as const },
    };
    const [labours, vendors] = await Promise.all([
      this.db.constructionLabourLabour.findMany({
        where,
        select: { id: true },
      }),
      this.db.constructionLabourVendor.findMany({
        where,
        select: { id: true },
      }),
    ]);
    return [
      ...labours.map((row) => ({ kind: "labour" as const, id: row.id })),
      ...vendors.map((row) => ({ kind: "vendor" as const, id: row.id })),
    ];
  }

  async partyNames(
    workspaceId: string,
    refs: readonly { kind: "labour" | "vendor"; id: string }[],
  ): Promise<Map<string, { name: string; labourCategoryId: string | null }>> {
    const ids = (kind: "labour" | "vendor") => [
      ...new Set(refs.filter((ref) => ref.kind === kind).map((ref) => ref.id)),
    ];
    const labourIds = ids("labour");
    const vendorIds = ids("vendor");
    const [labours, vendors] = await Promise.all([
      labourIds.length === 0
        ? []
        : this.db.constructionLabourLabour.findMany({
            where: { workspaceId, id: { in: labourIds } },
            select: { id: true, name: true, labourCategoryId: true },
          }),
      vendorIds.length === 0
        ? []
        : this.db.constructionLabourVendor.findMany({
            where: { workspaceId, id: { in: vendorIds } },
            select: { id: true, name: true },
          }),
    ]);
    return new Map([
      ...labours.map(
        (row) =>
          [
            `labour:${row.id}`,
            { name: row.name, labourCategoryId: row.labourCategoryId },
          ] as const,
      ),
      ...vendors.map(
        (row) =>
          [
            `vendor:${row.id}`,
            { name: row.name, labourCategoryId: null },
          ] as const,
      ),
    ]);
  }

  userNames(
    workspaceId: string,
    userIds: readonly string[],
  ): Promise<Map<string, string>> {
    return userNamesInCompany(this.db, workspaceId, userIds);
  }

  inPerson<T>(
    workspaceId: string,
    person: Person,
    work: (tx: CheckInTransaction) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey(person)}, 0))`;
        return work(transaction(tx, workspaceId, person));
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
  }
}

/**
 * Site Engineers (`construction_masters.supervisors`) for Check-In: plain
 * reads of the masters table by id, like the other directories.
 */
export class PrismaSiteEngineerDirectory implements SiteEngineerDirectory {
  constructor(private readonly db: PrismaClient) {}

  onProject(workspaceId: string, projectId: string) {
    return siteEngineerContactsOn(this.db, workspaceId, projectId);
  }

  async find(workspaceId: string, ids: readonly string[]) {
    if (ids.length === 0) return new Map();
    const rows = await this.db.constructionMastersSupervisor.findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] }, deletedAt: null },
      select: { id: true, name: true, disabledAt: true },
    });
    return new Map(
      rows.map((row) => [
        row.id,
        { id: row.id, name: row.name, disabled: row.disabledAt != null },
      ]),
    );
  }

  async names(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.constructionMastersSupervisor.findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  async idsNamed(workspaceId: string, q: string): Promise<string[]> {
    const rows = await this.db.constructionMastersSupervisor.findMany({
      where: { workspaceId, name: { contains: q, mode: "insensitive" } },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }
}

/** The Project's Site fence: a plain read of HRMS Branches & Sites (ADR CM-0012). */
export class PrismaSiteFenceDirectory implements SiteFenceDirectory {
  constructor(private readonly db: PrismaClient) {}

  async ofProject(workspaceId: string, projectId: string) {
    const row = await this.db.constructionHrmsBranch.findFirst({
      where: {
        workspaceId,
        projectId,
        kind: "project_site",
        deletedAt: null,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        name: true,
        latitude: true,
        longitude: true,
        radiusMetres: true,
      },
    });
    if (row == null) return null;
    return {
      name: row.name,
      latitude: Number(row.latitude.toString()),
      longitude: Number(row.longitude.toString()),
      radiusMetres: row.radiusMetres,
    };
  }
}
