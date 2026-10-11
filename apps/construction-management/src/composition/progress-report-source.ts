import { Prisma, prisma, type PrismaClient } from "@repo/construction-db";

import { createProjectLocations } from "@/src/composition/location-resolver";
import { createSiteRecordQueries } from "@/src/composition/site-records";
import { siteRecordDirectory } from "@/src/composition/site-record-directory";
import { locationNames } from "@/src/queries/location-options";
import type { DprSource } from "@/src/reporting/application/ports";
import {
  DPR_MAX_PHOTOS,
  type DprAttendance,
  type DprConsumedLine,
  type DprEquipmentUsage,
  type DprHeadcount,
  type DprPhoto,
  type DprReadModel,
  type DprReceivedLine,
  type DprWorksheet,
} from "@/src/reporting/domain/daily-progress-report";
import { prismaReportSource } from "@/src/reporting/infrastructure/prisma-report-source";
import type { SiteRecordReads } from "@/src/site-work/application/site-record-queries";
import {
  WORK_SHIFT_LABELS,
  type SheetApprovalStatus,
  type WorkShift,
} from "@/src/site-work/domain/shift";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import {
  locationLabel,
  storedLocationRef,
} from "@/src/shared-kernel/location-ref";

/**
 * The Daily Progress Report's read model (CM-606, ADR CM-0016 §15): one
 * Project's day across site work, labour, procurement, masters and
 * projects. Reporting sees only the `DprSource` port; this composition
 * module may read every context.
 *
 * The Site Diary and the Hindrance register come through site work's own
 * reads (`createSiteRecordQueries`). The worksheet and equipment-usage
 * sections are read-model SQL over `construction_site_work.worksheets` /
 * `worksheet_materials` and `equipment_usage_sheets` / `equipment` /
 * `equipment_time_shifts` (CM-602, CM-604): each function below is
 * exported so tests and the sheets' own code can be checked against it.
 * Everything filters live rows of the Company, the Project and the date.
 */

type Db = Pick<PrismaClient, "$queryRaw">;

type Query = {
  workspaceId: string;
  projectId: string;
  date: CalendarDate;
};

/**
 * Labels a stored `site_location` with the projects context's names: null
 * (printed "—") when there is no location, "Location not available" when
 * it names something the Project no longer offers.
 */
export type LocationLabeller = (json: unknown) => string | null;

/** One `options()` read per report, then labels from memory. */
export async function projectLocationLabeller(
  workspaceId: string,
  projectId: string,
  db: PrismaClient = prisma,
): Promise<LocationLabeller> {
  const options = await createProjectLocations({ prisma: db }).options(
    workspaceId,
    projectId,
  );
  return (json) => {
    // NULL, JSON null and the `{}` `next dev` writes for DbNull: no location.
    const ref = storedLocationRef(json);
    if (ref == null) return null;
    const names = locationNames({ structure: "wings", ...options }, ref);
    return names == null ? "Location not available" : locationLabel(names);
  };
}

const day = (date: CalendarDate) => Prisma.sql`${date}::date`;

function shiftLabel(shift: string): string {
  return shift in WORK_SHIFT_LABELS
    ? WORK_SHIFT_LABELS[shift as WorkShift]
    : shift;
}

// ---------------------------------------------------------------------------
// Worksheets (CM-602 tables)
// ---------------------------------------------------------------------------

type WorksheetRow = {
  id: string;
  number: string;
  shift: string;
  approvalStatus: SheetApprovalStatus;
  contractor: string | null;
  department: string | null;
  workType: string | null;
  siteLocation: unknown;
  skilled: number | null;
  unskilled: number | null;
  approxQty: string | null;
  approxUnit: string | null;
  remark: string | null;
  materials: { name: string; quantity: string; unit: string }[];
};

/**
 * The day's live worksheets that are not rejected (as the Daily Work
 * report and the dashboard count them, CM-608), by shift then number, with Contractor,
 * Department, Work Type and Measurement Unit names and their material
 * lines. `filledBy` keeps only worksheets that User created.
 */
export async function dprWorksheets(
  db: Db,
  query: Query & { filledBy: string | null },
  label: LocationLabeller,
): Promise<DprWorksheet[]> {
  const rows = await db.$queryRaw<WorksheetRow[]>(Prisma.sql`
    SELECT w.id::text AS id, w.number, w.shift::text AS shift,
           w.approval_status::text AS "approvalStatus",
           c.name AS contractor, d.name AS department, wt.name AS "workType",
           w.site_location AS "siteLocation",
           w.skilled_count AS skilled, w.unskilled_count AS unskilled,
           w.approx_work_qty::text AS "approxQty", u.name AS "approxUnit",
           w.remark,
           COALESCE((
             SELECT json_agg(json_build_object(
                      'name', m.material_name,
                      'quantity', m.quantity::text,
                      'unit', m.unit_name) ORDER BY m.sort_order)
               FROM construction_site_work.worksheet_materials m
              WHERE m.worksheet_id = w.id), '[]'::json) AS materials
      FROM construction_site_work.worksheets w
      LEFT JOIN construction_masters.contractors c
             ON c.id = w.contractor_id AND c.workspace_id = w.workspace_id
      LEFT JOIN construction_masters.departments d
             ON d.id = w.department_id AND d.workspace_id = w.workspace_id
      LEFT JOIN construction_masters.work_types wt
             ON wt.id = w.work_type_id AND wt.workspace_id = w.workspace_id
      LEFT JOIN construction_masters.measurement_units u
             ON u.id = w.approx_work_unit_id AND u.workspace_id = w.workspace_id
     WHERE w.workspace_id = ${query.workspaceId}
       AND w.project_id = ${query.projectId}::uuid
       AND w.sheet_date = ${day(query.date)}
       AND w.deleted_at IS NULL
       AND w.approval_status <> 'rejected'
       AND (${query.filledBy}::text IS NULL OR w.created_by = ${query.filledBy})
     ORDER BY w.shift, w.number
  `);
  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    shift: shiftLabel(row.shift),
    approvalStatus: row.approvalStatus,
    contractor: row.contractor ?? "Contractor not available",
    department: row.department ?? "Department not available",
    workType: row.workType,
    location: label(row.siteLocation),
    skilled: row.skilled,
    unskilled: row.unskilled,
    approxWork:
      row.approxQty == null
        ? null
        : { quantity: row.approxQty, unit: row.approxUnit },
    materials: row.materials,
    remark: row.remark,
  }));
}

// ---------------------------------------------------------------------------
// Equipment usage (CM-603 / CM-604 tables)
// ---------------------------------------------------------------------------

const FUEL_UNIT_LABELS: Record<string, string> = {
  barrel: "Barrel",
  gallon: "Gallon",
  kg: "Kg",
  litre: "Litre",
  unit: "Unit",
};

type UsageRow = {
  id: string;
  number: string;
  shift: string;
  approvalStatus: SheetApprovalStatus;
  equipmentName: string;
  equipmentNumber: string;
  ownership: DprEquipmentUsage["ownership"];
  operator: string | null;
  basis: DprEquipmentUsage["basis"];
  usageHours: string | null;
  distanceKm: string | null;
  trips: number | null;
  openingReading: string | null;
  closingReading: string | null;
  idleHours: string;
  breakdownHours: string;
  fuelQty: string | null;
  fuelUnit: string | null;
  fuelBorneBy: "company" | "hire_party" | null;
  hireCost: bigint | null;
  siteLocation: unknown;
  workItem: string | null;
};

/**
 * The day's live Equipment Usage sheets that are not rejected, by shift
 * then number. Usage hours
 * are the sheet's, or the sum of its time shifts when it has none. Hire
 * cost is read only with `money` (Financial on Equipment Usage) and only
 * for rented sheets. `filledBy` keeps only sheets that User created.
 */
export async function dprEquipmentUsage(
  db: Db,
  query: Query & { filledBy: string | null; money: boolean },
  label: LocationLabeller,
): Promise<DprEquipmentUsage[]> {
  const rows = await db.$queryRaw<UsageRow[]>(Prisma.sql`
    SELECT s.id::text AS id, s.number, s.shift::text AS shift,
           s.approval_status::text AS "approvalStatus",
           e.name AS "equipmentName", e.equipment_number AS "equipmentNumber",
           s.ownership::text AS ownership, s.operator_name AS operator,
           s.utilisation_basis::text AS basis,
           COALESCE(s.usage_hours::text, (
             SELECT round(SUM(t.minutes) / 60.0, 2)::text
               FROM construction_site_work.equipment_time_shifts t
              WHERE t.sheet_id = s.id)) AS "usageHours",
           s.distance_km::text AS "distanceKm", s.trips,
           s.opening_reading::text AS "openingReading",
           s.closing_reading::text AS "closingReading",
           s.idle_hours::text AS "idleHours",
           s.breakdown_hours::text AS "breakdownHours",
           s.fuel_qty::text AS "fuelQty", e.fuel_unit::text AS "fuelUnit",
           s.fuel_borne_by::text AS "fuelBorneBy",
           CASE WHEN ${query.money}::boolean AND s.ownership = 'rented'
                THEN s.hire_cost END AS "hireCost",
           s.site_location AS "siteLocation", s.work_item AS "workItem"
      FROM construction_site_work.equipment_usage_sheets s
      JOIN construction_site_work.equipment e ON e.id = s.equipment_id
     WHERE s.workspace_id = ${query.workspaceId}
       AND s.project_id = ${query.projectId}::uuid
       AND s.sheet_date = ${day(query.date)}
       AND s.deleted_at IS NULL
       AND s.approval_status <> 'rejected'
       AND (${query.filledBy}::text IS NULL OR s.created_by = ${query.filledBy})
     ORDER BY s.shift, s.number
  `);
  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    shift: shiftLabel(row.shift),
    approvalStatus: row.approvalStatus,
    equipmentName: row.equipmentName,
    equipmentNumber: row.equipmentNumber,
    ownership: row.ownership,
    operator: row.operator,
    basis: row.basis,
    usageHours: row.usageHours,
    distanceKm: row.distanceKm,
    trips: row.trips,
    openingReading: row.openingReading,
    closingReading: row.closingReading,
    idleHours: row.idleHours,
    breakdownHours: row.breakdownHours,
    fuel:
      row.fuelQty == null
        ? null
        : {
            quantity: row.fuelQty,
            unit:
              row.fuelUnit == null
                ? null
                : (FUEL_UNIT_LABELS[row.fuelUnit] ?? row.fuelUnit),
            borneBy: row.fuelBorneBy,
          },
    hireCost: row.hireCost,
    location: label(row.siteLocation),
    workItem: row.workItem,
  }));
}

// ---------------------------------------------------------------------------
// Attendance (labour context)
// ---------------------------------------------------------------------------

const zero = (): DprHeadcount => ({ skilled: 0, unskilled: 0 });

/**
 * The Project's attendance that day (CM-0016 §6): Labours present or on a
 * half day, one head each; vendor full-day and half-day heads. Split by the
 * Labour Category's skill; a Labour without a category is unskilled.
 * Never filtered by Filled By: attendance is the Project's. The same rule
 * as `attendanceHeadsBetween` (`src/composition/attendance-heads.ts`),
 * which the worksheet panel and the dashboard use; the DPR keeps present /
 * half day and full / half day apart, so it reads its own rows (an HTTP
 * test checks the totals agree).
 */
export async function dprAttendance(
  db: Db,
  query: Query,
): Promise<DprAttendance> {
  const [labour, vendor] = await Promise.all([
    db.$queryRaw<{ status: string; skill: string; heads: number }[]>(
      Prisma.sql`
        SELECT a.status::text AS status,
               COALESCE(c.skill::text, 'unskilled') AS skill,
               COUNT(*)::int AS heads
          FROM construction_labour.labour_attendance a
          JOIN construction_labour.labours l ON l.id = a.labour_id
          LEFT JOIN construction_masters.labour_categories c
                 ON c.id = l.labour_category_id
         WHERE a.workspace_id = ${query.workspaceId}
           AND a.project_id = ${query.projectId}::uuid
           AND a.attendance_date = ${day(query.date)}
           AND a.deleted_at IS NULL
           AND a.status IN ('present', 'half_day')
         GROUP BY 1, 2
      `,
    ),
    db.$queryRaw<{ skill: string; full: number; half: number }[]>(Prisma.sql`
      SELECT COALESCE(c.skill::text, 'unskilled') AS skill,
             SUM(l.full_day_count)::int AS full,
             SUM(l.half_day_count)::int AS half
        FROM construction_labour.vendor_attendance v
        JOIN construction_labour.vendor_attendance_lines l
          ON l.attendance_id = v.id
        LEFT JOIN construction_masters.labour_categories c
               ON c.id = l.labour_category_id
       WHERE v.workspace_id = ${query.workspaceId}
         AND v.project_id = ${query.projectId}::uuid
         AND v.attendance_date = ${day(query.date)}
         AND v.deleted_at IS NULL
       GROUP BY 1
    `),
  ]);
  const result: DprAttendance = {
    labourPresent: zero(),
    labourHalfDay: zero(),
    vendorFullDay: zero(),
    vendorHalfDay: zero(),
  };
  const key = (skill: string) =>
    skill === "skilled" ? "skilled" : "unskilled";
  for (const row of labour) {
    const bucket =
      row.status === "present" ? result.labourPresent : result.labourHalfDay;
    bucket[key(row.skill)] += row.heads;
  }
  for (const row of vendor) {
    result.vendorFullDay[key(row.skill)] += row.full;
    result.vendorHalfDay[key(row.skill)] += row.half;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Materials (procurement context)
// ---------------------------------------------------------------------------

/**
 * Materials received at the Project that day: the lines of live GRNs with
 * that receipt date, then of live Delivery Notes delivered that day.
 */
export async function dprMaterialsReceived(
  db: Db,
  query: Query,
): Promise<DprReceivedLine[]> {
  const [grn, dn] = await Promise.all([
    db.$queryRaw<Omit<DprReceivedLine, "source">[]>(Prisma.sql`
      SELECT g.number AS document, g.supplier_name AS "from",
             i.material_name AS material, i.received_qty::text AS quantity,
             i.uom_name AS unit
        FROM construction_procurement.goods_receipts g
        JOIN construction_procurement.goods_receipt_items i
          ON i.goods_receipt_id = g.id
       WHERE g.workspace_id = ${query.workspaceId}
         AND g.location_kind = 'project'
         AND g.location_id = ${query.projectId}::uuid
         AND g.receipt_date = ${day(query.date)}
         AND g.deleted_at IS NULL
       ORDER BY g.number, i.position
    `),
    db.$queryRaw<Omit<DprReceivedLine, "source">[]>(Prisma.sql`
      SELECT n.number AS document, COALESCE(s.name, 'Central Store') AS "from",
             i.material_name AS material, i.quantity::text AS quantity,
             i.uom_name AS unit
        FROM construction_procurement.delivery_notes n
        JOIN construction_procurement.delivery_note_items i
          ON i.delivery_note_id = n.id
        LEFT JOIN construction_procurement.stores s ON s.id = n.store_id
       WHERE n.workspace_id = ${query.workspaceId}
         AND n.project_id = ${query.projectId}::uuid
         AND n.delivered_on = ${day(query.date)}
         AND n.deleted_at IS NULL
       ORDER BY n.number, i.position
    `),
  ]);
  return [
    ...grn.map((line) => ({ ...line, source: "goods_receipt" as const })),
    ...dn.map((line) => ({ ...line, source: "delivery_note" as const })),
  ];
}

const SOURCE_LABELS: Record<string, string> = {
  daily_worksheet: "Daily Worksheet",
  equipment_usage: "Equipment Usage",
  stock_movement: "Current Inventory",
};

/**
 * Materials consumed at the Project that day: Consumed ledger entries,
 * netted per source document and material so an edited or deleted sheet's
 * reversal cancels its posting. Labelled by the entry ("Consumed by
 * WS/26-27/00001"), else by its source.
 */
export async function dprMaterialsConsumed(
  db: Db,
  query: Query,
): Promise<DprConsumedLine[]> {
  const rows = await db.$queryRaw<
    {
      material: string;
      unit: string;
      quantity: string;
      sourceType: string;
      label: string | null;
    }[]
  >(Prisma.sql`
    SELECT m.name AS material, u.name AS unit,
           (-SUM(e.quantity))::text AS quantity,
           e.source_type::text AS "sourceType",
           MAX(e.counterparty_label) AS label
      FROM construction_procurement.stock_entries e
      JOIN construction_masters.materials m ON m.id = e.material_id
      JOIN construction_masters.measurement_units u ON u.id = m.uom_id
     WHERE e.workspace_id = ${query.workspaceId}
       AND e.location_kind = 'project'
       AND e.location_id = ${query.projectId}::uuid
       AND e.entry_date = ${day(query.date)}
       AND e.type = 'consumed'
     GROUP BY e.source_type, e.source_id, m.id, m.name, u.name
    HAVING SUM(e.quantity) <> 0
     ORDER BY m.name, MAX(e.counterparty_label)
  `);
  return rows.map((row) => ({
    material: row.material,
    unit: row.unit,
    quantity: row.quantity,
    source: row.label ?? SOURCE_LABELS[row.sourceType] ?? row.sourceType,
  }));
}

// ---------------------------------------------------------------------------
// Photos (the site-work document thread)
// ---------------------------------------------------------------------------

/**
 * Images on the day's worksheets, usage sheets and Site Diary (on the
 * documents and their remarks), in that order, at most `DPR_MAX_PHOTOS`:
 * the thumbnail (WebP) when there is one, else the original.
 */
export async function dprPhotos(
  db: Db,
  workspaceId: string,
  documents: {
    worksheets: readonly { id: string; number: string }[];
    usageSheets: readonly { id: string; number: string }[];
    diaryId: string | null;
  },
): Promise<{ photos: DprPhoto[]; leftOut: number }> {
  const captions = new Map<string, string>();
  for (const sheet of documents.worksheets)
    captions.set(sheet.id, `Worksheet ${sheet.number}`);
  for (const sheet of documents.usageSheets)
    captions.set(sheet.id, `Equipment Usage ${sheet.number}`);
  if (documents.diaryId != null) captions.set(documents.diaryId, "Site Diary");
  const ids = [...captions.keys()];
  if (ids.length === 0) return { photos: [], leftOut: 0 };
  const rows = await db.$queryRaw<
    { documentId: string; key: string; contentType: string; total: number }[]
  >(Prisma.sql`
    SELECT f.document_id::text AS "documentId",
           COALESCE(f.thumb_key, f.file_key) AS key,
           CASE WHEN f.thumb_key IS NULL THEN f.content_type
                ELSE 'image/webp' END AS "contentType",
           (COUNT(*) OVER ())::int AS total
      FROM construction_site_work.document_files f
     WHERE f.workspace_id = ${workspaceId}
       AND f.deleted_at IS NULL
       AND f.content_type LIKE 'image/%'
       AND f.document_type::text IN ('worksheet', 'equipment_usage', 'site_diary')
       AND f.document_id = ANY(${ids}::uuid[])
     ORDER BY CASE f.document_type::text
                WHEN 'worksheet' THEN 0
                WHEN 'equipment_usage' THEN 1
                ELSE 2 END,
              array_position(${ids}::uuid[], f.document_id),
              f.created_at, f.id
     LIMIT ${DPR_MAX_PHOTOS}
  `);
  const total = rows[0]?.total ?? 0;
  return {
    photos: rows.map((row) => ({
      key: row.key,
      contentType: row.contentType,
      caption: captions.get(row.documentId) ?? "",
    })),
    leftOut: Math.max(0, total - rows.length),
  };
}

// ---------------------------------------------------------------------------
// The whole read model
// ---------------------------------------------------------------------------

/** The Project logo, when its "Use Project logo on reports" is on. */
async function reportLogo(
  db: PrismaClient,
  workspaceId: string,
  projectId: string,
): Promise<DprReadModel["logo"]> {
  const project = await db.constructionProjectsProject.findFirst({
    where: { id: projectId, workspaceId },
    select: { logoKey: true, useLogoInReports: true },
  });
  if (project?.useLogoInReports !== true || project.logoKey == null)
    return null;
  return { key: project.logoKey, contentType: "image/*" };
}

export function createProgressReportSource(
  deps: { db?: PrismaClient; siteRecords?: SiteRecordReads } = {},
): DprSource {
  const db = deps.db ?? prisma;
  const siteRecords = deps.siteRecords ?? createSiteRecordQueries();
  const header = prismaReportSource(db);
  const directory = siteRecordDirectory(db);
  return {
    async read({ workspaceId, projectId, params, money }) {
      const query = { workspaceId, projectId, date: params.date };
      const filtered = { ...query, filledBy: params.filledBy };
      const label = await projectLocationLabeller(workspaceId, projectId, db);
      const [
        facts,
        logo,
        names,
        diary,
        hindrances,
        worksheets,
        equipment,
        attendance,
        received,
        consumed,
      ] = await Promise.all([
        header.header(workspaceId, projectId),
        reportLogo(db, workspaceId, projectId),
        directory.userNames(
          workspaceId,
          params.filledBy == null ? [] : [params.filledBy],
        ),
        siteRecords.diaryForDate(workspaceId, projectId, params.date),
        siteRecords.hindrancesOn(workspaceId, projectId, params.date),
        dprWorksheets(db, filtered, label),
        dprEquipmentUsage(db, { ...filtered, money }, label),
        dprAttendance(db, query),
        dprMaterialsReceived(db, query),
        dprMaterialsConsumed(db, query),
      ]);
      const photos = params.includeImages
        ? await dprPhotos(db, workspaceId, {
            worksheets,
            usageSheets: equipment,
            diaryId: diary?.id ?? null,
          })
        : { photos: [], leftOut: 0 };
      return {
        company: facts.companyName,
        project: {
          name: facts.project?.name ?? "",
          address: facts.project?.address ?? null,
        },
        logo,
        number: params.number,
        date: params.date,
        filledBy:
          params.filledBy == null
            ? null
            : (names.get(params.filledBy) ?? "Team Member"),
        money,
        includeImages: params.includeImages,
        diary:
          diary == null
            ? null
            : {
                weatherMorning: diary.weatherMorning?.label ?? null,
                weatherAfternoon: diary.weatherAfternoon?.label ?? null,
                rainfallMm: diary.rainfallMm,
                siteCondition: diary.siteCondition,
                notes: diary.notes,
                visitors: diary.visitors,
                instructions: diary.instructions,
              },
        attendance,
        worksheets,
        equipment,
        received,
        consumed,
        hindrances: hindrances.map((row) => ({
          number: row.number,
          cause: row.causeLabel,
          activity: row.affectedActivity,
          party:
            row.contractorName == null
              ? row.responsiblePartyLabel
              : `${row.responsiblePartyLabel} · ${row.contractorName}`,
          since: row.startDate,
          daysLost: row.daysLost,
          hoursLost: row.hoursLost,
          status: row.status,
          location: label(row.siteLocation),
        })),
        photos: photos.photos,
        photosLeftOut: photos.leftOut,
      };
    },
  };
}
