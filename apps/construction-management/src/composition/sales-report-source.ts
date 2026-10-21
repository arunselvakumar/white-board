import { prisma, type PrismaClient } from "@repo/construction-db";

import { salesDirectory } from "@/src/composition/sales-directory";
import type { SalesReportSource } from "@/src/reporting/application/ports";
import {
  BOOKING_DISPLAY_STATUS_LABELS,
  bookingDisplayStatus,
} from "@/src/sales/domain/booking";
import { fromStoredFollowUpAt } from "@/src/sales/domain/sales-time";
import {
  INQUIRY_STATUS_LABELS,
  INTEREST_TYPE_LABELS,
} from "@/src/sales/domain/sales-terms";
import { inquiryVisibilityWhere } from "@/src/sales/infrastructure/inquiry-store";
import { areaWithUnit } from "@/src/sales/domain/unit-profile";
import { bookingStatusWhere } from "@/src/sales/infrastructure/prisma-booking-store";
import { PrismaUnitProfileStore } from "@/src/sales/infrastructure/prisma-unit-profile-store";
import {
  calendarDateFromDb,
  calendarDateToDb,
} from "@/src/shared-kernel/calendar-date";
import { companyTimezone } from "@/src/shared-kernel/company-today";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** `2026-10-18` and `10:30` → "18 Oct 2026, 10:30". */
function followUpWords(value: { date: string; time: string | null }): string {
  const [year = "", month = "", day = ""] = value.date.split("-");
  const date = `${String(Number(day))} ${MONTHS[Number(month) - 1] ?? ""} ${year}`;
  return value.time == null ? date : `${date}, ${value.time}`;
}

const NAMED = { id: true, name: true } as const;

/**
 * The sales reports' read model (CM-1008, ADR CM-0022 §11): inquiries
 * with their lists' and Team Members' names (View all as the list), and
 * bookings with
 * sales' own rules — Hold expired on the Company's today, the unit's Unit
 * type and Carpet area — and unit and Wing names from projects through
 * the `SalesDirectory`. Lives in composition because it crosses contexts.
 */
export function createSalesReportSource(
  db: PrismaClient = prisma,
): SalesReportSource {
  const profiles = new PrismaUnitProfileStore();
  return {
    async bookings(workspaceId, projectId, filter) {
      const status = bookingStatusWhere(
        filter.status == null ? undefined : [filter.status],
        filter.today,
      );
      const rows = await db.constructionSalesBooking.findMany({
        where: {
          workspaceId,
          projectId,
          deletedAt: null,
          bookingDate: {
            gte: calendarDateToDb(filter.range.from),
            lte: calendarDateToDb(filter.range.to),
          },
          ...(filter.wingId == null ? {} : { wingId: filter.wingId }),
          ...(status == null ? {} : { AND: [status] }),
        },
        orderBy: [{ bookingDate: "asc" }, { createdAt: "asc" }],
      });
      const unitIds = rows.map((row) => row.unitId);
      const [units, wings, profileMap] = await Promise.all([
        salesDirectory.units(db, workspaceId, projectId, unitIds),
        salesDirectory.wingsById(db, workspaceId, projectId, [
          ...rows.map((row) => row.wingId),
          ...(filter.wingId == null ? [] : [filter.wingId]),
        ]),
        profiles.profiles(db, workspaceId, projectId, unitIds),
      ]);
      return {
        wingName:
          filter.wingId == null
            ? null
            : (wings.get(filter.wingId)?.name ?? null),
        rows: rows.map((row) => {
          const profile = profileMap.get(row.unitId);
          const display = bookingDisplayStatus(
            {
              status: row.status,
              holdUntil:
                row.holdUntil == null
                  ? null
                  : calendarDateFromDb(row.holdUntil),
            },
            filter.today,
          );
          const referred = [row.referredByName, row.referredByContact].filter(
            (part): part is string => part != null,
          );
          return {
            bookingDate: calendarDateFromDb(row.bookingDate),
            customer: row.customerName,
            wing: wings.get(row.wingId)?.name ?? "",
            unit: units.get(row.unitId)?.name ?? "",
            unitType: profile?.unitType ?? null,
            carpetArea: areaWithUnit(
              profile?.carpetArea ?? null,
              profile?.areaUnit ?? "sq_ft",
            ),
            status: BOOKING_DISPLAY_STATUS_LABELS[display],
            referredBy: referred.length === 0 ? null : referred.join(" · "),
            remarks: row.remarks,
          };
        }),
      };
    },

    async inquiries(workspaceId, projectId, filter) {
      const and = [
        inquiryVisibilityWhere(filter.own),
        ...(filter.interestType == null
          ? []
          : [{ interestType: filter.interestType }]),
        ...(filter.leadSourceId == null
          ? []
          : [{ leadSourceId: filter.leadSourceId }]),
        ...(filter.funnelStageId == null
          ? []
          : [{ funnelStageId: filter.funnelStageId }]),
        ...(filter.status == null ? [] : [{ status: filter.status }]),
        ...(filter.lostReasonId == null
          ? []
          : [{ lostReasonId: filter.lostReasonId }]),
        ...(filter.assigneeMemberId == null
          ? []
          : [{ assigneeMemberId: filter.assigneeMemberId }]),
      ];
      const [rows, timeZone] = await Promise.all([
        db.constructionSalesInquiry.findMany({
          where: {
            workspaceId,
            projectId,
            deletedAt: null,
            inquiryDate: {
              gte: calendarDateToDb(filter.range.from),
              lte: calendarDateToDb(filter.range.to),
            },
            AND: and,
          },
          orderBy: [{ inquiryDate: "asc" }, { createdAt: "asc" }],
        }),
        companyTimezone(db, workspaceId),
      ]);
      const ids = (pick: (row: (typeof rows)[number]) => string | null) => [
        ...new Set(
          rows.flatMap((row) => (pick(row) == null ? [] : [pick(row) ?? ""])),
        ),
      ];
      const scope = { workspaceId, projectId };
      const [stages, sources, reasons, members, wings] = await Promise.all([
        db.constructionSalesFunnelStage.findMany({
          where: scope,
          select: NAMED,
        }),
        db.constructionSalesLeadSource.findMany({
          where: scope,
          select: NAMED,
        }),
        db.constructionSalesLostReason.findMany({
          where: scope,
          select: NAMED,
        }),
        salesDirectory.members(db, workspaceId, projectId, [
          ...ids((row) => row.assigneeMemberId),
          ...ids((row) => row.leadOwnerMemberId),
          ...(filter.assigneeMemberId == null ? [] : [filter.assigneeMemberId]),
        ]),
        salesDirectory.wingsById(
          db,
          workspaceId,
          projectId,
          ids((row) => row.interestedWingId),
        ),
      ]);
      const nameOf = (list: readonly { id: string; name: string }[]) => {
        const map = new Map(list.map((item) => [item.id, item.name]));
        return (id: string | null) =>
          id == null ? null : (map.get(id) ?? null);
      };
      const stage = nameOf(stages);
      const source = nameOf(sources);
      const reason = nameOf(reasons);
      const member = (id: string | null) =>
        id == null ? null : (members.get(id)?.name ?? null);
      const filterNames = [
        ...(filter.interestType == null
          ? []
          : [`Interest Type: ${INTEREST_TYPE_LABELS[filter.interestType]}.`]),
        ...(filter.leadSourceId == null
          ? []
          : [
              `Lead Source: ${source(filter.leadSourceId) ?? "a removed source"}.`,
            ]),
        ...(filter.funnelStageId == null
          ? []
          : [`Stage: ${stage(filter.funnelStageId) ?? "a removed stage"}.`]),
        ...(filter.status == null
          ? []
          : [`Status: ${INQUIRY_STATUS_LABELS[filter.status]}.`]),
        ...(filter.lostReasonId == null
          ? []
          : [
              `Lost Reason: ${reason(filter.lostReasonId) ?? "a removed reason"}.`,
            ]),
        ...(filter.assigneeMemberId == null
          ? []
          : [
              `Assignee: ${member(filter.assigneeMemberId) ?? "a former member"}.`,
            ]),
      ];
      return {
        filterNames,
        rows: rows.map((row) => {
          const interested = [
            row.interestedWingId == null
              ? null
              : (wings.get(row.interestedWingId)?.name ?? null),
            row.interestedUnitType,
          ].filter((part): part is string => part != null && part !== "");
          const next = fromStoredFollowUpAt(
            { at: row.nextFollowUpAt, hasTime: row.nextFollowUpHasTime },
            timeZone,
          );
          return {
            inquiryDate: calendarDateFromDb(row.inquiryDate),
            name: row.name,
            mobile: row.mobile,
            interestType:
              row.interestType == null
                ? null
                : INTEREST_TYPE_LABELS[row.interestType],
            interestedIn:
              interested.length === 0 ? null : interested.join(" · "),
            leadSource: source(row.leadSourceId),
            stage: stage(row.funnelStageId),
            status: INQUIRY_STATUS_LABELS[row.status],
            nextFollowUp:
              row.status !== "open" || next == null
                ? null
                : followUpWords(next),
            assignee: member(row.assigneeMemberId),
            leadOwner: member(row.leadOwnerMemberId),
            lostReason: reason(row.lostReasonId),
            remarks: row.remarks,
          };
        }),
      };
    },
  };
}
