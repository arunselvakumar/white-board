import { z } from "zod";

import { BOOKING_DISPLAY_STATUSES } from "@/src/sales/domain/booking";
import {
  AREA_UNITS,
  BOOKING_STATUSES,
  SALES_LIMITS,
  UNAVAILABLE_REASONS,
  UNIT_SALES_STATUSES,
} from "@/src/sales/domain/sales-terms";
import { UNIT_NOTE_MAX } from "@/src/sales/domain/unit-profile";
import type {
  BookingSummary,
  UnitActions,
  UnitChart,
  UnitSalesCounts,
  UnitSalesDetail,
} from "@/src/sales/application/unit-sales-handlers";

export const UNITS_PATH = "/api/construction/sales/units";

/** An area as typed (`"1,250.50"`) or a number; more than 0, two decimals. */
const area = z
  .union([z.string().max(20), z.number()])
  .nullable()
  .optional();

export const GetConstructionSalesUnitChartRequestModel = z.object({
  projectId: z.uuid(),
  /** The Wing whose grid to send; the first Wing without one. */
  wingId: z.uuid().optional(),
});

export const GetConstructionSalesUnitRequestModel = z.object({
  projectId: z.uuid(),
});

export const ConstructionSalesUnitParamsModel = z.object({ unitId: z.uuid() });

const stale = {
  projectId: z.uuid(),
  /** The profile's `updatedAt` as last seen (null before it has one); 409 `UNIT_PROFILE_CHANGED` when stale. */
  expectedUpdatedAt: z.iso.datetime().nullable(),
};

export const SetConstructionSalesUnitDetailsRequestModel = z.object({
  ...stale,
  /** "2BHK", "Shop" (≤ 60). */
  unitType: z
    .string()
    .max(SALES_LIMITS.unitType + 20)
    .nullable()
    .optional(),
  /** The RERA basis. */
  carpetArea: area,
  builtUpArea: area,
  superBuiltUpArea: area,
  /** sq ft unless given. */
  areaUnit: z.enum(AREA_UNITS).nullable().optional(),
});

export const MarkConstructionSalesUnitUnavailableRequestModel = z.object({
  ...stale,
  reason: z.enum(UNAVAILABLE_REASONS),
  note: z
    .string()
    .max(UNIT_NOTE_MAX + 20)
    .nullable()
    .optional(),
});

export const MarkConstructionSalesUnitAvailableRequestModel = z.object(stale);

export const ImportConstructionSalesUnitsRequestModel = z.object({
  projectId: z.uuid(),
});

// Responses

const counts = z.object({
  total: z.number().int(),
  available: z.number().int(),
  on_hold: z.number().int(),
  booked: z.number().int(),
  unavailable: z.number().int(),
});

export const ConstructionSalesUnitCountsResponseModel = counts.meta({
  description: "Live units by sales status.",
});

const salesStatus = z.enum(UNIT_SALES_STATUSES);
const displayStatus = z.enum(BOOKING_DISPLAY_STATUSES);

export const ConstructionSalesUnitChartResponseModel = z.object({
  projectId: z.uuid(),
  /** The Company's today: a hold before it is Hold expired. */
  today: z.iso.date(),
  counts: ConstructionSalesUnitCountsResponseModel,
  wings: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      type: z.string(),
      phaseName: z.string(),
      counts: ConstructionSalesUnitCountsResponseModel,
    }),
  ),
  /** The chosen Wing with its floors (top first) and units, or null without Wings. */
  wing: z
    .object({
      id: z.uuid(),
      name: z.string(),
      type: z.string(),
      phaseName: z.string(),
      counts: ConstructionSalesUnitCountsResponseModel,
      floors: z.array(
        z.object({
          id: z.uuid(),
          name: z.string(),
          kind: z.string(),
          units: z.array(
            z.object({
              id: z.uuid(),
              name: z.string(),
              /** Available / On Hold / Booked / Unavailable on today. */
              status: salesStatus,
              unitType: z.string().nullable(),
              carpetArea: z.string().nullable(),
              areaUnit: z.enum(AREA_UNITS),
              booking: z
                .object({
                  id: z.uuid(),
                  status: displayStatus,
                  customerName: z.string(),
                  holdUntil: z.iso.date().nullable(),
                })
                .nullable(),
            }),
          ),
        }),
      ),
    })
    .nullable(),
  actions: z.object({
    /** Booking Update: unit details, unavailable, import. */
    update: z.boolean(),
    /** Booking Create: hold and book. */
    create: z.boolean(),
  }),
});
export type ConstructionSalesUnitChartResponse = z.infer<
  typeof ConstructionSalesUnitChartResponseModel
>;

export const ConstructionSalesBookingSummaryResponseModel = z.object({
  id: z.uuid(),
  /** Stored: On Hold, Booked or Cancelled. */
  storedStatus: z.enum(BOOKING_STATUSES),
  /** Shown: with Hold expired. */
  status: displayStatus,
  bookingDate: z.iso.date(),
  holdUntil: z.iso.date().nullable(),
  customerName: z.string(),
  customerMobile: z.string().nullable(),
  cancelledOn: z.iso.date().nullable(),
  cancelReason: z.string().nullable(),
});

export const ConstructionSalesUnitResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  projectId: z.uuid(),
  wing: z.object({ id: z.uuid(), name: z.string(), type: z.string() }),
  floor: z.object({ id: z.uuid(), name: z.string() }),
  status: salesStatus,
  profile: z.object({
    unitType: z.string().nullable(),
    carpetArea: z.string().nullable(),
    builtUpArea: z.string().nullable(),
    superBuiltUpArea: z.string().nullable(),
    areaUnit: z.enum(AREA_UNITS),
    unavailable: z.boolean(),
    unavailableReason: z.enum(UNAVAILABLE_REASONS).nullable(),
    unavailableNote: z.string().nullable(),
    /** Null until the unit has details; send it as `expectedUpdatedAt`. */
    updatedAt: z.iso.datetime().nullable(),
  }),
  /** The active booking (On Hold, Hold expired or Booked). */
  booking: ConstructionSalesBookingSummaryResponseModel.nullable(),
  /** Every live booking of the unit, newest first, cancelled ones included. */
  bookings: z.array(ConstructionSalesBookingSummaryResponseModel),
  actions: z.object({
    editDetails: z.boolean(),
    markUnavailable: z.boolean(),
    markAvailable: z.boolean(),
    /** Hold or Book: Create, while Available. */
    book: z.boolean(),
  }),
});
export type ConstructionSalesUnitResponse = z.infer<
  typeof ConstructionSalesUnitResponseModel
>;

export const ImportConstructionSalesUnitsResponseModel = z.object({
  /** Units whose sales details were replaced. */
  updated: z.number().int(),
});

function countsOf(value: UnitSalesCounts) {
  return {
    total: value.total,
    available: value.available,
    on_hold: value.on_hold,
    booked: value.booked,
    unavailable: value.unavailable,
  };
}

export function toUnitChartResponse(
  projectId: string,
  chart: UnitChart,
  actions: { update: boolean; create: boolean },
): ConstructionSalesUnitChartResponse {
  return {
    projectId,
    today: chart.today,
    counts: countsOf(chart.counts),
    wings: chart.wings.map((wing) => ({
      ...wing,
      counts: countsOf(wing.counts),
    })),
    wing:
      chart.wing == null
        ? null
        : { ...chart.wing, counts: countsOf(chart.wing.counts) },
    actions,
  };
}

export function toBookingSummaryResponse(booking: BookingSummary) {
  return {
    id: booking.id,
    storedStatus: booking.status,
    status: booking.displayStatus,
    bookingDate: booking.bookingDate,
    holdUntil: booking.holdUntil,
    customerName: booking.customerName,
    customerMobile: booking.customerMobile,
    cancelledOn: booking.cancelledOn,
    cancelReason: booking.cancelReason,
  };
}

export function toUnitResponse(
  unit: UnitSalesDetail,
  actions: UnitActions,
): ConstructionSalesUnitResponse {
  return {
    id: unit.id,
    name: unit.name,
    projectId: unit.projectId,
    wing: unit.wing,
    floor: unit.floor,
    status: unit.status,
    profile: {
      ...unit.profile,
      updatedAt: unit.profile.updatedAt?.toISOString() ?? null,
    },
    booking:
      unit.booking == null ? null : toBookingSummaryResponse(unit.booking),
    bookings: unit.bookings.map(toBookingSummaryResponse),
    actions,
  };
}
