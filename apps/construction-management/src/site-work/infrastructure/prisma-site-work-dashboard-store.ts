import {
  calendarDateFromDb,
  calendarDateToDb,
} from "@/src/shared-kernel/calendar-date";

import type { SiteWorkDashboardStore } from "../application/site-work-dashboard";
import { hundredths } from "../domain/site-work-dashboard";

function between(range: { from: string; to: string }) {
  return { gte: calendarDateToDb(range.from), lte: calendarDateToDb(range.to) };
}

/** Live sheets that are not rejected: what the dashboard counts. */
const counted = {
  deletedAt: null,
  approvalStatus: { not: "rejected" as const },
};

/** The dashboard's reads of worksheets and usage sheets (CM-608). */
export const prismaSiteWorkDashboardStore: SiteWorkDashboardStore = {
  async worksheetDays(db, workspaceId, projectId, range) {
    const rows = await db.constructionSiteWorkWorksheet.groupBy({
      by: ["sheetDate"],
      where: {
        workspaceId,
        projectId,
        sheetDate: between(range),
        ...counted,
      },
      _sum: { skilledCount: true, unskilledCount: true },
      _count: { _all: true },
      orderBy: { sheetDate: "asc" },
    });
    return rows.map((row) => ({
      date: calendarDateFromDb(row.sheetDate),
      skilled: row._sum.skilledCount ?? 0,
      unskilled: row._sum.unskilledCount ?? 0,
      sheets: row._count._all,
    }));
  },

  async contractorLabour(db, workspaceId, projectId, range) {
    const rows = await db.constructionSiteWorkWorksheet.groupBy({
      by: ["contractorId", "departmentId"],
      where: {
        workspaceId,
        projectId,
        sheetDate: between(range),
        ...counted,
      },
      _sum: { skilledCount: true, unskilledCount: true },
    });
    return rows.map((row) => ({
      contractorId: row.contractorId,
      departmentId: row.departmentId,
      skilled: row._sum.skilledCount ?? 0,
      unskilled: row._sum.unskilledCount ?? 0,
    }));
  },

  async pendingWorksheets(db, workspaceId, projectId) {
    return db.constructionSiteWorkWorksheet.count({
      where: {
        workspaceId,
        projectId,
        deletedAt: null,
        approvalStatus: "pending",
      },
    });
  },

  async equipmentTotals(db, workspaceId, projectId, range) {
    const where = {
      workspaceId,
      projectId,
      sheetDate: between(range),
      ...counted,
    };
    const [rows, overruns] = await Promise.all([
      db.constructionSiteWorkEquipmentUsageSheet.groupBy({
        by: ["equipmentId", "ownership", "utilisationBasis"],
        where,
        _sum: {
          usageHours: true,
          distanceKm: true,
          trips: true,
          hireCost: true,
        },
        _count: { _all: true },
      }),
      db.constructionSiteWorkEquipmentUsageSheet.groupBy({
        by: ["equipmentId", "ownership", "utilisationBasis"],
        where: { ...where, fuelOverrun: true },
        _count: { _all: true },
      }),
    ]);
    const equipment = await db.constructionSiteWorkEquipment.findMany({
      where: {
        workspaceId,
        id: { in: [...new Set(rows.map((row) => row.equipmentId))] },
      },
      select: { id: true, name: true, equipmentNumber: true },
    });
    const named = new Map(equipment.map((row) => [row.id, row]));
    const key = (row: {
      equipmentId: string;
      ownership: string;
      utilisationBasis: string;
    }) => `${row.equipmentId}|${row.ownership}|${row.utilisationBasis}`;
    const overrunCounts = new Map(
      overruns.map((row) => [key(row), row._count._all]),
    );
    return rows.map((row) => {
      const hireCost = Number(row._sum.hireCost ?? 0n);
      if (!Number.isSafeInteger(hireCost))
        throw new Error("A hire cost total is beyond a safe integer.");
      return {
        equipmentId: row.equipmentId,
        name: named.get(row.equipmentId)?.name ?? "",
        equipmentNumber: named.get(row.equipmentId)?.equipmentNumber ?? "",
        ownership: row.ownership,
        basis: row.utilisationBasis,
        sheets: row._count._all,
        hoursHundredths:
          row.utilisationBasis === "hourly"
            ? hundredths(row._sum.usageHours?.toString() ?? null)
            : 0,
        kmHundredths:
          row.utilisationBasis === "km"
            ? hundredths(row._sum.distanceKm?.toString() ?? null)
            : 0,
        trips: row.utilisationBasis === "trip" ? (row._sum.trips ?? 0) : 0,
        fuelOverruns: overrunCounts.get(key(row)) ?? 0,
        hireCost: row.ownership === "rented" ? hireCost : 0,
      };
    });
  },
};
