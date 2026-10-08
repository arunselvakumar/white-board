import type { Prisma, PrismaClient } from "@repo/db";

import {
  calendarDateFromDb,
  calendarDateToDb,
  todayIn,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import type { ListCursor } from "@/src/shared-kernel/list-cursor";

import type {
  LabourListFilter,
  LabourListPage,
  LabourLookups,
  LabourOption,
  LabourQueries,
  LabourReadModel,
} from "../application/labour-ports";
import type { Weekday } from "../domain/wages";
import { prismaLedger } from "./prisma-ledger";

type Row = Prisma.ConstructionLabourLabourGetPayload<object>;

/** Today in the Company's time zone (its profile; India by default). */
export async function companyToday(
  db: Pick<PrismaClient, "constructionOrganizationCompanyProfile">,
  workspaceId: string,
  now: Date = new Date(),
): Promise<CalendarDate> {
  const profile = await db.constructionOrganizationCompanyProfile.findUnique({
    where: { workspaceId },
    select: { timezone: true },
  });
  try {
    return todayIn(profile?.timezone ?? "Asia/Kolkata", now);
  } catch {
    return todayIn("Asia/Kolkata", now);
  }
}

function whereOf(
  filter: LabourListFilter,
): Prisma.ConstructionLabourLabourWhereInput[] {
  const filters: Prisma.ConstructionLabourLabourWhereInput[] = [
    { workspaceId: filter.workspaceId, deletedAt: null },
  ];
  if (filter.projectId != null)
    filters.push({ currentProjectId: filter.projectId });
  if (filter.active != null) filters.push({ isActive: filter.active });
  if (filter.supervisorId != null)
    filters.push({ supervisorId: filter.supervisorId });
  if (filter.labourCategoryId != null)
    filters.push({ labourCategoryId: filter.labourCategoryId });
  const search = filter.search?.trim() ?? "";
  if (search.length > 0)
    filters.push({
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { labourCode: { contains: search, mode: "insensitive" } },
        { fatherName: { contains: search, mode: "insensitive" } },
        { contactNumber: { contains: search.replace(/\s/g, "") } },
      ],
    });
  return filters;
}

/** The register's reads, with names of other contexts' records by id. */
export class PrismaLabourQueries implements LabourQueries {
  constructor(
    private readonly db: PrismaClient,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Read models for rows: names (including deleted records), opening, balance. */
  private async readModels(
    workspaceId: string,
    rows: readonly Row[],
  ): Promise<LabourReadModel[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const unique = (values: (string | null)[]) => [
      ...new Set(values.filter((value): value is string => value != null)),
    ];
    const today = await companyToday(this.db, workspaceId, this.clock());
    const [projects, categories, supervisors, openings, balances] =
      await Promise.all([
        this.db.constructionProjectsProject.findMany({
          where: {
            workspaceId,
            id: { in: unique(rows.map((row) => row.currentProjectId)) },
          },
          select: { id: true, name: true },
        }),
        this.db.constructionMastersLabourCategory.findMany({
          where: {
            workspaceId,
            id: { in: unique(rows.map((row) => row.labourCategoryId)) },
          },
          select: { id: true, name: true },
        }),
        this.db.constructionMastersSupervisor.findMany({
          where: {
            workspaceId,
            id: { in: unique(rows.map((row) => row.supervisorId)) },
          },
          select: { id: true, name: true },
        }),
        this.db.constructionLabourLedgerEntry.groupBy({
          by: ["sourceId"],
          where: {
            workspaceId,
            partyType: "labour",
            sourceType: "labour",
            kind: "opening",
            sourceId: { in: ids },
          },
          _sum: { amount: true },
        }),
        prismaLedger.balances(this.db, workspaceId, "labour", ids, today),
      ]);
    const byId = <T extends { id: string }>(items: T[]) =>
      new Map(items.map((item) => [item.id, item]));
    const projectNames = byId(projects);
    const categoryNames = byId(categories);
    const supervisorNames = byId(supervisors);
    const opening = new Map(
      openings.map((row) => [row.sourceId, row._sum.amount ?? 0]),
    );
    return rows.map((row) => ({
      id: row.id,
      details: {
        name: row.name,
        labourCode: row.labourCode,
        fatherName: row.fatherName,
        joiningDate: calendarDateFromDb(row.joiningDate),
        wageType: row.wageType,
        wagePerDay: row.wagePerDay,
        wagePerMonth: row.wagePerMonth,
        overtimeWagePerHour: row.overtimeWagePerHour,
        weeklyHolidays: row.weeklyHolidays as Weekday[],
        uanNumber: row.uanNumber,
        esicNumber: row.esicNumber,
        labourCategoryId: row.labourCategoryId,
        supervisorId: row.supervisorId,
        contactNumber: row.contactNumber,
        gender: row.gender,
      },
      aadhaarMasked:
        row.aadhaarLast4 == null ? null : `XXXXXXXX${row.aadhaarLast4}`,
      currentProject: projectNames.get(row.currentProjectId) ?? {
        id: row.currentProjectId,
        name: "Deleted Project",
      },
      labourCategory:
        row.labourCategoryId == null
          ? null
          : (categoryNames.get(row.labourCategoryId) ?? null),
      supervisor:
        row.supervisorId == null
          ? null
          : (supervisorNames.get(row.supervisorId) ?? null),
      isActive: row.isActive,
      photoKey: row.photoKey,
      openingBalance: opening.get(row.id) ?? 0,
      balance: balances.get(row.id) ?? 0,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async get(workspaceId: string, id: string): Promise<LabourReadModel | null> {
    const row = await this.db.constructionLabourLabour.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (row == null) return null;
    const [model] = await this.readModels(workspaceId, [row]);
    return model ?? null;
  }

  async list(
    filter: LabourListFilter & {
      limit: number;
      after?: ListCursor;
      before?: ListCursor;
    },
  ): Promise<LabourListPage> {
    const filters = whereOf(filter);
    // Newest first; `after` pages forward (older), `before` pages back.
    const backwards = filter.before != null;
    const cursor = filter.after ?? filter.before;
    const page = await this.db.constructionLabourLabour.findMany({
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
      orderBy: backwards
        ? [{ createdAt: "asc" }, { id: "asc" }]
        : [{ createdAt: "desc" }, { id: "desc" }],
      take: filter.limit + 1,
    });
    const hasMore = page.length > filter.limit;
    const rows = page.slice(0, filter.limit);
    if (backwards) rows.reverse();
    const total = await this.db.constructionLabourLabour.count({
      where: { AND: filters },
    });
    return {
      items: await this.readModels(filter.workspaceId, rows),
      total,
      hasMore,
    };
  }

  async all(filter: LabourListFilter): Promise<LabourReadModel[]> {
    const rows = await this.db.constructionLabourLabour.findMany({
      where: { AND: whereOf(filter) },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 10_000,
    });
    return this.readModels(filter.workspaceId, rows);
  }

  async options(
    workspaceId: string,
    projectId: string,
    date: CalendarDate,
  ): Promise<LabourOption[]> {
    const day = calendarDateToDb(date);
    // Active labourers whose history puts them on the Project that day.
    const ids = await this.db.$queryRaw<{ id: string }[]>`
      SELECT l.id::text AS id
      FROM construction_labour.labours l
      WHERE l.workspace_id = ${workspaceId}
        AND l.deleted_at IS NULL
        AND l.is_active
        AND l.joining_date <= ${day}
        AND (
          SELECT t.to_project_id
          FROM construction_labour.labour_transfers t
          WHERE t.labour_id = l.id AND t.transfer_date <= ${day}
          ORDER BY t.transfer_date DESC, t.created_at DESC, t.id DESC
          LIMIT 1
        ) = ${projectId}::uuid
    `;
    if (ids.length === 0) return [];
    const rows = await this.db.constructionLabourLabour.findMany({
      where: { id: { in: ids.map((row) => row.id) } },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      labourCode: row.labourCode,
      labourCategoryId: row.labourCategoryId,
      supervisorId: row.supervisorId,
      wageType: row.wageType,
      weeklyHolidays: row.weeklyHolidays,
      wagePerDay: row.wagePerDay,
      wagePerMonth: row.wagePerMonth,
      overtimeWagePerHour: row.overtimeWagePerHour,
    }));
  }

  /** Every live Project, Labour Category and Supervisor (import, template). */
  async lookups(workspaceId: string) {
    const [projects, labourCategories, supervisors] = await Promise.all([
      this.db.constructionProjectsProject.findMany({
        where: { workspaceId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      this.db.constructionMastersLabourCategory.findMany({
        where: { workspaceId, deletedAt: null },
        select: { id: true, name: true, disabledAt: true },
        orderBy: { name: "asc" },
      }),
      this.db.constructionMastersSupervisor.findMany({
        where: { workspaceId, deletedAt: null },
        select: { id: true, name: true, disabledAt: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return {
      projects,
      labourCategories: labourCategories.map((row) => ({
        id: row.id,
        name: row.name,
        disabled: row.disabledAt != null,
      })),
      supervisors: supervisors.map((row) => ({
        id: row.id,
        name: row.name,
        disabled: row.disabledAt != null,
      })),
    };
  }
}

/** `LabourLookups` over the same reads. */
export function prismaLabourLookups(
  queries: PrismaLabourQueries,
): LabourLookups {
  return { all: (workspaceId) => queries.lookups(workspaceId) };
}
