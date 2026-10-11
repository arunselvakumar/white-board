import { Prisma, type PrismaClient } from "@repo/construction-db";

import {
  calendarDateFromDb,
  calendarDateToDb,
} from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";
import {
  locationLabel,
  storedLocationRef,
  type LocationType,
} from "@/src/shared-kernel/location-ref";

import type { SiteWorkReportSource } from "../application/ports";
import type { ReportPlace } from "../domain/equipment-lifecycle-reports";
import type { DateRange } from "../domain/report-period";

/**
 * The site-work reports' reads (CM-605, CM-608): worksheets, usage sheets,
 * movements and maintenance from `construction_site_work`, with names from
 * masters, projects and organization tables. A read model like
 * `prismaReportSource`: rows by Company and id, never another context's
 * code, never a write.
 */

const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  wing: "Wing",
  amenity: "Amenity",
  common_development: "Common Development",
  location: "Location",
};

function decimal(value: Prisma.Decimal | null): number | null {
  return value == null ? null : Number(value.toString());
}

function paise(value: bigint | null): number | null {
  if (value == null) return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number))
    throw new Error("An amount is beyond a safe integer.");
  return number;
}

function names(rows: readonly { id: string; name: string }[]) {
  return new Map(rows.map((row) => [row.id, row.name]));
}

export function prismaSiteWorkReportSource(
  db: PrismaClient,
): SiteWorkReportSource {
  function between({ from, to }: DateRange) {
    return { gte: calendarDateToDb(from), lte: calendarDateToDb(to) };
  }

  const uniq = (ids: Iterable<string | null | undefined>) =>
    [...new Set(ids)].filter((id): id is string => id != null);

  async function contractorNames(workspaceId: string, ids: string[]) {
    if (ids.length === 0) return new Map<string, string>();
    return names(
      await db.constructionMastersContractor.findMany({
        where: { workspaceId, id: { in: ids } },
        select: { id: true, name: true },
      }),
    );
  }

  async function projectNames(workspaceId: string, ids: string[]) {
    if (ids.length === 0) return new Map<string, string>();
    return names(
      await db.constructionProjectsProject.findMany({
        where: { workspaceId, id: { in: ids } },
        select: { id: true, name: true },
      }),
    );
  }

  /** Team Member names by user id (the latest live row wins). */
  async function memberNames(workspaceId: string, userIds: string[]) {
    if (userIds.length === 0) return new Map<string, string>();
    const rows = await db.$queryRaw<{ userId: string; name: string }[]>(
      Prisma.sql`
        SELECT DISTINCT ON (user_id) user_id AS "userId", name
        FROM construction_organization.team_members
        WHERE workspace_id = ${workspaceId}
          AND user_id = ANY(${userIds}::text[])
        ORDER BY user_id, (deleted_at IS NULL) DESC, created_at DESC`,
    );
    return new Map(rows.map((row) => [row.userId, row.name]));
  }

  /**
   * Labels for stored LocationRefs: "Wing A · Floor 1 · Unit 101",
   * "Amenity · Swimming Pool". Names of removed structure still print.
   */
  async function locationLabels(
    workspaceId: string,
    stored: readonly unknown[],
  ): Promise<(value: unknown) => { type: string; label: string } | null> {
    const refs = stored.map(storedLocationRef);
    const ids = {
      wings: new Set<string>(),
      floors: new Set<string>(),
      units: new Set<string>(),
      developments: new Set<string>(),
      locations: new Set<string>(),
    };
    for (const ref of refs) {
      if (ref == null) continue;
      switch (ref.type) {
        case "wing":
          ids.wings.add(ref.wingId);
          ref.floorIds.forEach((id) => ids.floors.add(id));
          ref.unitIds.forEach((id) => ids.units.add(id));
          break;
        case "amenity":
        case "common_development":
          ids.developments.add(ref.developmentId);
          break;
        case "location":
          ids.locations.add(ref.locationId);
          break;
      }
    }
    const where = (set: Set<string>) => ({
      workspaceId,
      id: { in: [...set] },
    });
    const select = { id: true, name: true };
    const [wings, floors, units, developments, locations] = await Promise.all([
      ids.wings.size === 0
        ? []
        : db.constructionProjectsWing.findMany({
            where: where(ids.wings),
            select,
          }),
      ids.floors.size === 0
        ? []
        : db.constructionProjectsFloor.findMany({
            where: where(ids.floors),
            select,
          }),
      ids.units.size === 0
        ? []
        : db.constructionProjectsUnit.findMany({
            where: where(ids.units),
            select,
          }),
      ids.developments.size === 0
        ? []
        : db.constructionMastersDevelopmentType.findMany({
            where: where(ids.developments),
            select,
          }),
      ids.locations.size === 0
        ? []
        : db.constructionProjectsLocation.findMany({
            where: where(ids.locations),
            select,
          }),
    ]);
    const by = {
      wings: names(wings),
      floors: names(floors),
      units: names(units),
      developments: names(developments),
      locations: names(locations),
    };
    const named = (map: Map<string, string>, id: string) =>
      map.get(id) ?? "Removed";
    return (value) => {
      const ref = storedLocationRef(value);
      if (ref == null) return null;
      const label =
        ref.type === "wing"
          ? locationLabel({
              type: "wing",
              wing: named(by.wings, ref.wingId),
              floors: ref.floorIds.map((id) => named(by.floors, id)),
              units: ref.unitIds.map((id) => named(by.units, id)),
            })
          : locationLabel({
              type: ref.type,
              name:
                ref.type === "location"
                  ? named(by.locations, ref.locationId)
                  : named(by.developments, ref.developmentId),
            });
      return { type: LOCATION_TYPE_LABELS[ref.type], label };
    };
  }

  return {
    async dailyWork(workspaceId, projectId, filter) {
      let contractorName: string | null = null;
      if (filter.contractorId != null) {
        const contractor = await db.constructionMastersContractor.findFirst({
          where: { workspaceId, id: filter.contractorId },
          select: { name: true },
        });
        if (contractor == null)
          throw new DomainError(
            "CONTRACTOR_NOT_FOUND",
            "There is no such Contractor.",
            { details: { field: "contractorId" } },
          );
        contractorName = contractor.name;
      }
      const rows = await db.constructionSiteWorkWorksheet.findMany({
        where: {
          workspaceId,
          projectId,
          deletedAt: null,
          approvalStatus: { not: "rejected" },
          sheetDate: between(filter.range),
          ...(filter.contractorId == null
            ? {}
            : { contractorId: filter.contractorId }),
        },
        include: { materials: { orderBy: { sortOrder: "asc" } } },
        orderBy: [{ sheetDate: "asc" }, { number: "asc" }],
      });
      const ids = rows.map((row) => row.id);
      const [contractors, departments, units, photos, locations] =
        await Promise.all([
          contractorNames(
            workspaceId,
            uniq(rows.map((row) => row.contractorId)),
          ),
          db.constructionMastersDepartment
            .findMany({
              where: {
                workspaceId,
                id: { in: uniq(rows.map((row) => row.departmentId)) },
              },
              select: { id: true, name: true },
            })
            .then(names),
          db.constructionMastersMeasurementUnit
            .findMany({
              where: {
                workspaceId,
                id: { in: uniq(rows.map((row) => row.approxWorkUnitId)) },
              },
              select: { id: true, name: true },
            })
            .then(names),
          ids.length === 0
            ? []
            : db.constructionSiteWorkDocumentFile.groupBy({
                by: ["documentId"],
                where: {
                  workspaceId,
                  documentType: "worksheet",
                  documentId: { in: ids },
                  deletedAt: null,
                },
                _count: { _all: true },
              }),
          locationLabels(
            workspaceId,
            rows.map((row) => row.siteLocation),
          ),
        ]);
      const photoCounts = new Map(
        photos.map((row) => [row.documentId, row._count._all]),
      );
      return {
        contractorName,
        worksheets: rows.map((row) => {
          const location = locations(row.siteLocation);
          return {
            date: calendarDateFromDb(row.sheetDate),
            number: row.number,
            department: departments.get(row.departmentId) ?? "",
            contractor: contractors.get(row.contractorId) ?? "",
            skilled: row.skilledCount,
            unskilled: row.unskilledCount,
            locationType: location?.type ?? null,
            location: location?.label ?? null,
            approxWorkQty: row.approxWorkQty?.toString() ?? null,
            approxWorkUnit:
              row.approxWorkUnitId == null
                ? null
                : (units.get(row.approxWorkUnitId) ?? null),
            shift: row.shift,
            photos: photoCounts.get(row.id) ?? 0,
            materials: row.materials.map((line) => ({
              name: line.materialName,
              unit: line.unitName,
              quantity: line.quantity.toString(),
            })),
            remark: row.remark,
          };
        }),
      };
    },

    async equipmentUsage(workspaceId, projectId, filter) {
      let equipmentName: string | null = null;
      if (filter.equipmentId != null) {
        const equipment = await db.constructionSiteWorkEquipment.findFirst({
          where: { workspaceId, id: filter.equipmentId },
          select: { name: true, equipmentNumber: true },
        });
        if (equipment == null)
          throw new DomainError(
            "EQUIPMENT_NOT_FOUND",
            "There is no such equipment.",
            { details: { field: "equipmentId" } },
          );
        equipmentName = `${equipment.name} (${equipment.equipmentNumber})`;
      }
      const rows = await db.constructionSiteWorkEquipmentUsageSheet.findMany({
        where: {
          workspaceId,
          projectId,
          deletedAt: null,
          approvalStatus: { not: "rejected" },
          ownership: filter.ownership,
          sheetDate: between(filter.range),
          ...(filter.equipmentId == null
            ? {}
            : { equipmentId: filter.equipmentId }),
        },
        include: {
          equipment: {
            select: {
              name: true,
              equipmentNumber: true,
              fuelUnit: true,
              hirePartyId: true,
              hireBasis: true,
            },
          },
        },
        orderBy: [{ sheetDate: "asc" }, { shift: "asc" }, { number: "asc" }],
      });
      const [contractors, locations] = await Promise.all([
        contractorNames(
          workspaceId,
          uniq(
            rows.flatMap((row) => [
              row.contractorId,
              row.equipment.hirePartyId,
            ]),
          ),
        ),
        locationLabels(
          workspaceId,
          rows.map((row) => row.siteLocation),
        ),
      ]);
      return {
        equipmentName,
        sheets: rows.map((row) => {
          const usage =
            row.utilisationBasis === "hourly"
              ? decimal(row.usageHours)
              : row.utilisationBasis === "km"
                ? decimal(row.distanceKm)
                : row.trips;
          return {
            date: calendarDateFromDb(row.sheetDate),
            number: row.number,
            equipmentId: row.equipmentId,
            equipment: row.equipment.name,
            equipmentNumber: row.equipment.equipmentNumber,
            shift: row.shift,
            operator: row.operatorName,
            basis: row.utilisationBasis,
            usage,
            idleHours: decimal(row.idleHours) ?? 0,
            breakdownHours: decimal(row.breakdownHours) ?? 0,
            fuelQty: decimal(row.fuelQty),
            fuelUnit: row.equipment.fuelUnit,
            fuelOverrun: row.fuelOverrun,
            contractor:
              row.contractorId == null
                ? null
                : (contractors.get(row.contractorId) ?? null),
            location: locations(row.siteLocation)?.label ?? null,
            // Rejected sheets are filtered out above.
            approval:
              row.approvalStatus === "rejected"
                ? "pending"
                : row.approvalStatus,
            hireParty:
              row.equipment.hirePartyId == null
                ? null
                : (contractors.get(row.equipment.hirePartyId) ?? null),
            hireBasis: row.equipment.hireBasis,
            unitRate: paise(row.unitRate),
            billableQty: decimal(row.billableQty),
            hireCost: paise(row.hireCost),
          };
        }),
      };
    },

    async equipmentMaintenance(workspaceId, filter) {
      const rows = await db.$queryRaw<
        {
          equipment: string;
          equipmentNumber: string;
          kind: string;
          startDate: Date;
          endDate: Date | null;
          workshop: string | null;
          description: string | null;
          cost: bigint | null;
          projectId: string | null;
        }[]
      >(
        Prisma.sql`
          SELECT * FROM (
            SELECT e.name AS equipment,
                   e.equipment_number AS "equipmentNumber",
                   m.kind::text AS kind,
                   m.start_date AS "startDate",
                   m.end_date AS "endDate",
                   m.workshop,
                   m.description,
                   m.cost,
                   (SELECT mv.to_project_id
                      FROM construction_site_work.equipment_movements mv
                     WHERE mv.equipment_id = m.equipment_id
                       AND mv.movement_date <= m.start_date
                     ORDER BY mv.movement_date DESC, mv.created_at DESC
                     LIMIT 1)::text AS "projectId"
              FROM construction_site_work.equipment_maintenance m
              JOIN construction_site_work.equipment e ON e.id = m.equipment_id
             WHERE m.workspace_id = ${workspaceId}
               AND m.deleted_at IS NULL
               AND e.deleted_at IS NULL
               AND m.start_date <= ${calendarDateToDb(filter.range.to)}::date
               AND (m.end_date IS NULL
                    OR m.end_date >= ${calendarDateToDb(filter.range.from)}::date)
          ) entries
          ${
            filter.projectId == null
              ? Prisma.empty
              : Prisma.sql`WHERE "projectId" = ${filter.projectId}`
          }`,
      );
      const projects = await projectNames(
        workspaceId,
        uniq(rows.map((row) => row.projectId)),
      );
      return rows.map((row) => ({
        equipment: row.equipment,
        equipmentNumber: row.equipmentNumber,
        kind: row.kind,
        startDate: calendarDateFromDb(row.startDate),
        endDate: row.endDate == null ? null : calendarDateFromDb(row.endDate),
        workshop: row.workshop,
        description: row.description,
        cost: paise(row.cost),
        projectName:
          row.projectId == null ? null : (projects.get(row.projectId) ?? null),
      }));
    },

    async equipmentTransfers(workspaceId, filter) {
      const rows = await db.$queryRaw<
        {
          equipment: string;
          equipmentNumber: string;
          purchaseYear: number | null;
          date: Date;
          fromProjectId: string | null;
          toProjectId: string | null;
          locationName: string;
          remark: string | null;
          createdBy: string;
          beforeId: string | null;
          beforeProjectId: string | null;
          beforeLocationName: string | null;
        }[]
      >(
        Prisma.sql`
          SELECT * FROM (
            SELECT e.name AS equipment,
                   e.equipment_number AS "equipmentNumber",
                   e.purchase_year AS "purchaseYear",
                   mv.kind::text AS kind,
                   mv.movement_date AS date,
                   mv.from_project_id::text AS "fromProjectId",
                   mv.to_project_id::text AS "toProjectId",
                   mv.location_name AS "locationName",
                   mv.remark,
                   mv.created_by AS "createdBy",
                   LAG(mv.id::text) OVER w AS "beforeId",
                   LAG(mv.to_project_id::text) OVER w AS "beforeProjectId",
                   LAG(mv.location_name) OVER w AS "beforeLocationName"
              FROM construction_site_work.equipment_movements mv
              JOIN construction_site_work.equipment e ON e.id = mv.equipment_id
             WHERE mv.workspace_id = ${workspaceId}
               AND e.deleted_at IS NULL
            WINDOW w AS (PARTITION BY mv.equipment_id
                         ORDER BY mv.movement_date, mv.created_at)
          ) moves
          WHERE kind IN ('to_project', 'to_warehouse')
            AND date BETWEEN ${calendarDateToDb(filter.range.from)}::date
                         AND ${calendarDateToDb(filter.range.to)}::date
          ${
            filter.projectId == null
              ? Prisma.empty
              : Prisma.sql`AND (${filter.projectId} IN ("fromProjectId", "toProjectId"))`
          }`,
      );
      const [projects, members] = await Promise.all([
        projectNames(
          workspaceId,
          uniq(
            rows.flatMap((row) => [
              row.toProjectId,
              row.beforeProjectId,
              row.fromProjectId,
            ]),
          ),
        ),
        memberNames(workspaceId, uniq(rows.map((row) => row.createdBy))),
      ]);
      const projectName = (id: string | null) =>
        id == null ? null : (projects.get(id) ?? "A removed Project");
      return rows.map((row) => {
        const before: ReportPlace | null =
          row.beforeId == null
            ? row.fromProjectId == null
              ? null
              : {
                  projectName: projectName(row.fromProjectId),
                  locationName: null,
                }
            : {
                projectName: projectName(row.beforeProjectId),
                locationName: row.beforeLocationName,
              };
        return {
          equipment: row.equipment,
          equipmentNumber: row.equipmentNumber,
          purchaseYear: row.purchaseYear,
          date: calendarDateFromDb(row.date),
          before,
          toProject: projectName(row.toProjectId),
          locationName: row.locationName,
          remark: row.remark,
          entryBy: members.get(row.createdBy) ?? null,
        };
      });
    },
  };
}
