import type { PrismaClient } from "@repo/db";

import {
  calendarDateFromDb,
  calendarDateToDb,
} from "@/src/shared-kernel/calendar-date";
import { notFound } from "@/src/shared-kernel/domain-error";

import type { ProjectLookup, ReportSource } from "../application/ports";
import {
  hundredthsOf,
  type ReportLabour,
  type ReportLabourDay,
} from "../domain/labour-days";
import type { ReportLedgerEntry } from "../domain/ledger-summary";
import type { DateRange } from "../domain/report-period";

/**
 * The reports' reads of other contexts' tables (labour, masters, projects,
 * organization). Reporting is a read model: it reads rows by Company and
 * id, never imports those contexts' code, and never writes to them.
 */
export function prismaProjectLookup(db: PrismaClient): ProjectLookup {
  return {
    async exists(workspaceId, projectId) {
      const found = await db.constructionProjectsProject.count({
        where: { id: projectId, workspaceId, deletedAt: null },
      });
      return found > 0;
    },
  };
}

export function prismaReportSource(db: PrismaClient): ReportSource {
  function between({ from, to }: DateRange) {
    return { gte: calendarDateToDb(from), lte: calendarDateToDb(to) };
  }

  async function namesOf(
    model: "category" | "supervisor",
    workspaceId: string,
    ids: Iterable<string | null>,
  ): Promise<Map<string, string>> {
    const wanted = [...new Set(ids)].filter((id): id is string => id != null);
    if (wanted.length === 0) return new Map();
    const where = { workspaceId, id: { in: wanted } };
    const select = { id: true, name: true };
    const rows =
      model === "category"
        ? await db.constructionMastersLabourCategory.findMany({ where, select })
        : await db.constructionMastersSupervisor.findMany({ where, select });
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  async function laboursOf(
    workspaceId: string,
    ids: Iterable<string>,
  ): Promise<ReportLabour[]> {
    const wanted = [...new Set(ids)];
    if (wanted.length === 0) return [];
    const rows = await db.constructionLabourLabour.findMany({
      where: { workspaceId, id: { in: wanted } },
    });
    const categories = await namesOf(
      "category",
      workspaceId,
      rows.map((row) => row.labourCategoryId),
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      labourCode: row.labourCode,
      fatherName: row.fatherName,
      category:
        row.labourCategoryId == null
          ? null
          : (categories.get(row.labourCategoryId) ?? null),
      gender: row.gender,
      wageType: row.wageType,
      wageRate:
        (row.wageType === "daily" ? row.wagePerDay : row.wagePerMonth) ?? 0,
    }));
  }

  async function labourDays(
    workspaceId: string,
    projectId: string,
    range: DateRange,
  ): Promise<ReportLabourDay[]> {
    const rows = await db.constructionLabourAttendance.findMany({
      where: {
        workspaceId,
        projectId,
        deletedAt: null,
        attendanceDate: between(range),
      },
      include: { overtime: { select: { hours: true, amount: true } } },
      orderBy: [{ attendanceDate: "asc" }],
    });
    const supervisors = await namesOf(
      "supervisor",
      workspaceId,
      rows.map((row) => row.supervisorId),
    );
    return rows.map((row) => ({
      labourId: row.labourId,
      date: calendarDateFromDb(row.attendanceDate),
      status: row.status,
      isPaidLeave: row.isPaidLeave,
      shift: row.shift,
      supervisor:
        row.supervisorId == null
          ? null
          : (supervisors.get(row.supervisorId) ?? null),
      overtimeHundredths: row.overtime.reduce(
        (sum, line) => sum + hundredthsOf(line.hours.toString()),
        0,
      ),
      wageType: row.wageType,
      wageRate: row.wageRate,
      earned: row.earned,
      overtimeAmount: row.overtime.reduce((sum, line) => sum + line.amount, 0),
    }));
  }

  function toEntry(row: {
    partyId: string;
    kind: ReportLedgerEntry["kind"];
    amount: number;
    entryDate: Date;
  }): ReportLedgerEntry {
    return {
      partyId: row.partyId,
      kind: row.kind,
      amount: row.amount,
      entryDate: calendarDateFromDb(row.entryDate),
    };
  }

  async function currentLabourIds(
    workspaceId: string,
    projectId: string,
    joinedBy?: DateRange["to"],
  ): Promise<string[]> {
    const rows = await db.constructionLabourLabour.findMany({
      where: {
        workspaceId,
        currentProjectId: projectId,
        deletedAt: null,
        ...(joinedBy == null
          ? {}
          : {
              isActive: true,
              joiningDate: { lte: calendarDateToDb(joinedBy) },
            }),
      },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  return {
    async header(workspaceId, projectId) {
      const profile = await db.constructionOrganizationCompanyProfile.findFirst(
        { where: { workspaceId } },
      );
      let project: { name: string; address: string | null } | null = null;
      if (projectId != null) {
        project = await db.constructionProjectsProject.findFirst({
          where: { id: projectId, workspaceId, deletedAt: null },
          select: { name: true, address: true },
        });
        if (project == null)
          throw notFound("PROJECT_NOT_FOUND", "There is no such Project.");
      }
      return {
        companyName: profile?.name ?? "",
        timezone: profile?.timezone ?? "Asia/Kolkata",
        currency: profile?.currency ?? "INR",
        project,
      };
    },

    async labourDays(workspaceId, projectId, range) {
      const days = await labourDays(workspaceId, projectId, range);
      const labours = await laboursOf(
        workspaceId,
        days.map((day) => day.labourId),
      );
      return { labours, days };
    },

    async labourLedger(workspaceId, projectId, range) {
      const [current, moved] = await Promise.all([
        currentLabourIds(workspaceId, projectId),
        db.constructionLabourLedgerEntry.findMany({
          where: {
            workspaceId,
            partyType: "labour",
            projectId,
            entryDate: between(range),
          },
          select: { partyId: true },
          distinct: ["partyId"],
        }),
      ]);
      const ids = [
        ...new Set([...current, ...moved.map((row) => row.partyId)]),
      ];
      const [labours, entries] = await Promise.all([
        laboursOf(workspaceId, ids),
        db.constructionLabourLedgerEntry.findMany({
          where: {
            workspaceId,
            partyType: "labour",
            partyId: { in: ids },
            entryDate: { lte: calendarDateToDb(range.to) },
          },
          select: { partyId: true, kind: true, amount: true, entryDate: true },
        }),
      ]);
      return { labours, entries: entries.map(toEntry) };
    },

    async musterRoll(workspaceId, projectId, range) {
      const [days, current, money] = await Promise.all([
        labourDays(workspaceId, projectId, range),
        currentLabourIds(workspaceId, projectId, range.to),
        db.constructionLabourLedgerEntry.findMany({
          where: {
            workspaceId,
            partyType: "labour",
            projectId,
            kind: { in: ["advance", "payment"] },
            entryDate: between(range),
          },
          select: { partyId: true, kind: true, amount: true, entryDate: true },
        }),
      ]);
      const labours = await laboursOf(workspaceId, [
        ...days.map((day) => day.labourId),
        ...current,
        ...money.map((row) => row.partyId),
      ]);
      return { labours, days, entries: money.map(toEntry) };
    },

    async vendorLines(workspaceId, filter) {
      if (filter.projectIds?.length === 0)
        return { lines: [], vendorName: null, categoryName: null };
      const rows = await db.constructionLabourVendorAttendance.findMany({
        where: {
          workspaceId,
          ...(filter.projectIds == null
            ? {}
            : { projectId: { in: filter.projectIds } }),
          deletedAt: null,
          attendanceDate: between(filter.range),
          ...(filter.vendorId == null ? {} : { vendorId: filter.vendorId }),
        },
        include: {
          vendor: { select: { name: true } },
          lines:
            filter.labourCategoryId == null
              ? true
              : { where: { labourCategoryId: filter.labourCategoryId } },
        },
      });
      const [projects, categories, vendor] = await Promise.all([
        db.constructionProjectsProject.findMany({
          where: {
            workspaceId,
            id: { in: [...new Set(rows.map((row) => row.projectId))] },
          },
          select: { id: true, name: true },
        }),
        namesOf("category", workspaceId, [
          ...rows.flatMap((row) =>
            row.lines.map((line) => line.labourCategoryId),
          ),
          filter.labourCategoryId,
        ]),
        filter.vendorId == null
          ? null
          : db.constructionLabourVendor.findFirst({
              where: { workspaceId, id: filter.vendorId },
              select: { name: true },
            }),
      ]);
      const projectNames = new Map(projects.map((row) => [row.id, row.name]));
      return {
        lines: rows.flatMap((row) =>
          row.lines.map((line) => ({
            date: calendarDateFromDb(row.attendanceDate),
            projectName: projectNames.get(row.projectId) ?? "",
            vendorName: row.vendor.name,
            shiftName: line.shiftName,
            category: categories.get(line.labourCategoryId) ?? "",
            fullDayCount: line.fullDayCount,
            halfDayCount: line.halfDayCount,
            overtimeHundredths: hundredthsOf(line.overtimeHours.toString()),
            ratePerDay: line.ratePerDay,
            overtimePerHour: line.overtimePerHour,
            amount: line.amount,
          })),
        ),
        vendorName: vendor?.name ?? null,
        categoryName:
          filter.labourCategoryId == null
            ? null
            : (categories.get(filter.labourCategoryId) ?? null),
      };
    },
  };
}
