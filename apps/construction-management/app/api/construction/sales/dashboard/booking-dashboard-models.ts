import { z } from "zod";

import type { BookingReadModel } from "@/src/sales/application/booking-handlers";
import type { UnitChart } from "@/src/sales/application/unit-sales-handlers";
import { BOOKING_DISPLAY_STATUSES } from "@/src/sales/domain/booking";

export const BOOKING_DASHBOARD_PATH =
  "/api/construction/sales/dashboard/booking";

export const GetConstructionSalesBookingDashboardRequestModel = z.object({
  projectId: z.uuid(),
});

const counts = z.object({
  total: z.number().int(),
  available: z.number().int(),
  on_hold: z.number().int(),
  booked: z.number().int(),
  unavailable: z.number().int(),
});

export const GetConstructionSalesBookingDashboardResponseModel = z
  .object({
    projectId: z.uuid(),
    /** Null without Booking Read on the Project. */
    booking: z
      .object({
        /** The Company's today: the figures are as on it. */
        today: z.iso.date(),
        /** Live units by sales status (a hold past Hold until counts Available). */
        counts,
        /** The same per live Wing, in the Project's Wing order. */
        wings: z.array(z.object({ id: z.uuid(), name: z.string(), counts })),
        /** The five bookings recorded last, any status. */
        latest: z.array(
          z.object({
            id: z.uuid(),
            wingName: z.string(),
            unitName: z.string(),
            customerName: z.string(),
            bookingDate: z.iso.date(),
            status: z.enum(BOOKING_DISPLAY_STATUSES),
          }),
        ),
      })
      .nullable(),
  })
  .meta({
    description:
      "The Project Dashboard's Booking section (CM-1008): a snapshot as on today, not the dashboard duration.",
  });
export type GetConstructionSalesBookingDashboardResponseModel = z.infer<
  typeof GetConstructionSalesBookingDashboardResponseModel
>;

export function toBookingDashboardResponse(
  projectId: string,
  data: { chart: UnitChart; latest: readonly BookingReadModel[] } | null,
): GetConstructionSalesBookingDashboardResponseModel {
  if (data == null) return { projectId, booking: null };
  const pick = (value: UnitChart["counts"]) => ({
    total: value.total,
    available: value.available,
    on_hold: value.on_hold,
    booked: value.booked,
    unavailable: value.unavailable,
  });
  return {
    projectId,
    booking: {
      today: data.chart.today,
      counts: pick(data.chart.counts),
      wings: data.chart.wings.map((wing) => ({
        id: wing.id,
        name: wing.name,
        counts: pick(wing.counts),
      })),
      latest: data.latest.map((booking) => ({
        id: booking.id,
        wingName: booking.wing.name,
        unitName: booking.unit.name,
        customerName: booking.customerName,
        bookingDate: booking.bookingDate,
        status: booking.displayStatus,
      })),
    },
  };
}
