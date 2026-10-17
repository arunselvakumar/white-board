import { z } from "zod";

import type {
  BookableWing,
  BookingActions,
  BookingDetail,
  BookingReadModel,
} from "@/src/sales/application/booking-handlers";
import {
  BOOKING_DISPLAY_STATUSES,
  BOOKING_START_STATUSES,
} from "@/src/sales/domain/booking";
import {
  AREA_UNITS,
  BOOKING_STATUSES,
  SALES_LIMITS,
} from "@/src/sales/domain/sales-terms";

export const BOOKINGS_PATH = "/api/construction/sales/bookings";

const displayStatus = z.enum(BOOKING_DISPLAY_STATUSES);

/** "a,b,c" → ["a", "b", "c"]. */
const commaSeparated = z
  .string()
  .min(1)
  .max(200)
  .transform((value) =>
    value
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part !== ""),
  );

/** Room for the domain's own "too long" message. */
const text = (max: number) => z.string().max(max + 50);

const BookingBody = z.object({
  /** `YYYY-MM-DD`, not after today; the back-dated window `booking` applies. */
  bookingDate: z.iso.date(),
  customerName: text(SALES_LIMITS.name),
  /** Normalised to `+91…` (or `+` and 8–15 digits). */
  customerMobile: z.string().max(30).nullable().optional(),
  customerEmail: z.string().max(300).nullable().optional(),
  customerAddress: text(SALES_LIMITS.address).nullable().optional(),
  referredByName: text(SALES_LIMITS.referredBy).nullable().optional(),
  /** A mobile number, normalised like the customer's. */
  referredByContact: z.string().max(30).nullable().optional(),
  remarks: text(SALES_LIMITS.remarks).nullable().optional(),
});

export const CreateConstructionSalesBookingRequestModel = BookingBody.extend({
  projectId: z.uuid(),
  /** A live unit of the Project: Available, or with an expired hold. */
  unitId: z.uuid(),
  /** **Hold** (`on_hold`) or **Book** (`booked`). */
  status: z.enum(BOOKING_START_STATUSES),
  /** A hold only; not before the Booking Date. After it: Hold expired. */
  holdUntil: z.iso.date().nullable().optional(),
});

export const UpdateConstructionSalesBookingRequestModel = BookingBody.extend({
  /** The booking's `updatedAt` as last seen; 409 `BOOKING_CHANGED` when stale. */
  expectedUpdatedAt: z.iso.datetime(),
});

const stale = { expectedUpdatedAt: z.iso.datetime() };

export const ConfirmConstructionSalesBookingRequestModel = z.object({
  ...stale,
  /** The day the hold became a booking: not before the Booking Date, not after today. */
  confirmedOn: z.iso.date(),
});

export const ExtendConstructionSalesBookingHoldRequestModel = z.object({
  ...stale,
  /** Today or later. */
  holdUntil: z.iso.date(),
});

export const CancelConstructionSalesBookingRequestModel = z.object({
  ...stale,
  /** Why (≤ 500); kept in the history. */
  reason: text(SALES_LIMITS.cancelReason),
  /** Not before the Booking Date, not after today. */
  cancelledOn: z.iso.date(),
});

export const DeleteConstructionSalesBookingRequestModel = z.object(stale);

export const ConstructionSalesBookingParamsModel = z.object({ id: z.uuid() });

export const GetConstructionSalesBookingFormOptionsRequestModel = z.object({
  projectId: z.uuid(),
});

export const ListConstructionSalesBookingsRequestModel = z
  .object({
    projectId: z.uuid(),
    /** Comma-separated: `on_hold,hold_expired`. Hold expired is On Hold past Hold until. */
    status: commaSeparated
      .pipe(z.array(displayStatus).min(1).max(4))
      .optional(),
    wingId: z.uuid().optional(),
    unitId: z.uuid().optional(),
    /** Part of the customer's name, mobile or email, or the Referred By name. */
    search: z.string().trim().max(100).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    after: z.string().min(1).optional(),
    before: z.string().min(1).optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });

// Responses

const person = z.object({ userId: z.string(), name: z.string().nullable() });

export const ConstructionSalesBookingActionsResponseModel = z.object({
  /** Update, while On Hold or Booked. */
  edit: z.boolean(),
  /** Update, while On Hold. */
  confirm: z.boolean(),
  /** Update, while On Hold. */
  extendHold: z.boolean(),
  /** Update, while On Hold or Booked. */
  cancel: z.boolean(),
  delete: z.boolean(),
  /** Update: add or remove the Booking Form and photos. */
  files: z.boolean(),
});

export const ConstructionSalesBookingResponseModel = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  unit: z.object({
    id: z.uuid(),
    name: z.string(),
    floorName: z.string(),
    /** Removed in the Wing editor since (it cannot be while booked). */
    deleted: z.boolean(),
  }),
  wing: z.object({ id: z.uuid(), name: z.string() }),
  unitType: z.string().nullable(),
  carpetArea: z.string().nullable(),
  areaUnit: z.enum(AREA_UNITS),
  /** On Hold / Hold expired / Booked / Cancelled on the Company's today. */
  status: displayStatus,
  storedStatus: z.enum(BOOKING_STATUSES),
  bookingDate: z.iso.date(),
  holdUntil: z.iso.date().nullable(),
  confirmedOn: z.iso.date().nullable(),
  cancelledOn: z.iso.date().nullable(),
  cancelReason: z.string().nullable(),
  customerName: z.string(),
  customerMobile: z.string().nullable(),
  customerEmail: z.string().nullable(),
  customerAddress: z.string().nullable(),
  referredByName: z.string().nullable(),
  referredByContact: z.string().nullable(),
  remarks: z.string().nullable(),
  /** The inquiry it was converted from. */
  inquiry: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  createdBy: person,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  actions: ConstructionSalesBookingActionsResponseModel,
});
export type ConstructionSalesBookingResponse = z.infer<
  typeof ConstructionSalesBookingResponseModel
>;

export const ConstructionSalesBookingHistoryItemResponseModel = z.object({
  id: z.uuid(),
  /** `created`, `confirmed`, `hold_extended`, `cancelled`. */
  kind: z.enum(["created", "confirmed", "hold_extended", "cancelled"]),
  status: z.enum(BOOKING_STATUSES),
  /** The business date: booking, confirm, cancel; the day a hold was extended. */
  onDate: z.iso.date(),
  holdUntil: z.iso.date().nullable(),
  reason: z.string().nullable(),
  /** `userId` is `system` for a hold cancelled as "Hold expired". */
  by: person,
  at: z.iso.datetime(),
});

export const ConstructionSalesBookingDetailResponseModel =
  ConstructionSalesBookingResponseModel.extend({
    /** Every status it took, oldest first. */
    history: z.array(ConstructionSalesBookingHistoryItemResponseModel),
  });
export type ConstructionSalesBookingDetailResponse = z.infer<
  typeof ConstructionSalesBookingDetailResponseModel
>;

export const ListConstructionSalesBookingsResponseModel = z.object({
  items: z.array(ConstructionSalesBookingResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.number().int(),
});
export type ListConstructionSalesBookingsResponse = z.infer<
  typeof ListConstructionSalesBookingsResponseModel
>;

export const GetConstructionSalesBookingFormOptionsResponseModel = z.object({
  /** Wings with the units that can be booked now (an expired hold counts as free). */
  wings: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      units: z.array(
        z.object({ id: z.uuid(), name: z.string(), floorName: z.string() }),
      ),
    }),
  ),
});
export type GetConstructionSalesBookingFormOptionsResponse = z.infer<
  typeof GetConstructionSalesBookingFormOptionsResponseModel
>;

export function toBookingResponse(
  booking: BookingReadModel,
  actions: BookingActions,
): ConstructionSalesBookingResponse {
  return {
    id: booking.id,
    projectId: booking.projectId,
    unit: booking.unit,
    wing: booking.wing,
    unitType: booking.unitType,
    carpetArea: booking.carpetArea,
    areaUnit: booking.areaUnit,
    status: booking.displayStatus,
    storedStatus: booking.status,
    bookingDate: booking.bookingDate,
    holdUntil: booking.holdUntil,
    confirmedOn: booking.confirmedOn,
    cancelledOn: booking.cancelledOn,
    cancelReason: booking.cancelReason,
    customerName: booking.customerName,
    customerMobile: booking.customerMobile,
    customerEmail: booking.customerEmail,
    customerAddress: booking.customerAddress,
    referredByName: booking.referredByName,
    referredByContact: booking.referredByContact,
    remarks: booking.remarks,
    inquiry: booking.inquiry,
    createdBy: booking.createdByPerson,
    createdAt: booking.createdAt.toISOString(),
    updatedAt: booking.updatedAt.toISOString(),
    actions,
  };
}

export function toBookingDetailResponse(
  booking: BookingDetail,
  actions: BookingActions,
): ConstructionSalesBookingDetailResponse {
  return {
    ...toBookingResponse(booking, actions),
    history: booking.history.map((item) => ({
      id: item.id,
      kind: item.kind,
      status: item.status,
      onDate: item.onDate,
      holdUntil: item.holdUntil,
      reason: item.reason,
      by: item.by,
      at: item.occurredAt.toISOString(),
    })),
  };
}

export function toBookingFormOptions(
  wings: readonly BookableWing[],
): GetConstructionSalesBookingFormOptionsResponse {
  return { wings: wings.map((wing) => ({ ...wing, units: [...wing.units] })) };
}
