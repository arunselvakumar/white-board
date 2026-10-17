import { queryOptions } from "@tanstack/react-query";

import type { GetConstructionSalesBookingDashboardResponseModel } from "@/app/api/construction/sales/dashboard/booking-dashboard-models";
import type { GetConstructionSalesInquiryDashboardResponseModel } from "@/app/api/construction/sales/dashboard/inquiry-dashboard-models";
import type { CallActivityPeriod } from "@/src/sales/application/sales-dashboard";

import { apiJson } from "./http";
import { SALES_API, SALES_KEY } from "./sales-access";

export type BookingDashboard =
  GetConstructionSalesBookingDashboardResponseModel;
export type BookingDashboardSection = NonNullable<BookingDashboard["booking"]>;

/** Under the bookings key, so booking and unit writes refresh it. */
const KEY = [...SALES_KEY, "bookings", "dashboard"] as const;

/**
 * The Project Dashboard's Booking section (CM-1008): a snapshot as on
 * today, so it takes no duration.
 */
export function bookingDashboardQuery(projectId: string) {
  return queryOptions({
    queryKey: [...KEY, projectId] as const,
    queryFn: () =>
      apiJson<BookingDashboard>(
        `${SALES_API}/dashboard/booking?projectId=${encodeURIComponent(projectId)}`,
      ),
  });
}

export type InquiryDashboard =
  GetConstructionSalesInquiryDashboardResponseModel;
export type InquiryDashboardSection = NonNullable<InquiryDashboard["inquiry"]>;

/** Under the inquiries key, so inquiry and follow-up writes refresh it. */
const INQUIRY_KEY = [...SALES_KEY, "inquiries", "dashboard"] as const;

/** The Project Dashboard's Inquiry section (CM-1008), for a duration and a Call Activity period. */
export function inquiryDashboardQuery(
  projectId: string,
  range: { from: string; to: string },
  period: CallActivityPeriod,
) {
  const query = new URLSearchParams({
    projectId,
    from: range.from,
    to: range.to,
    period,
  }).toString();
  return queryOptions({
    queryKey: [
      ...INQUIRY_KEY,
      projectId,
      range.from,
      range.to,
      period,
    ] as const,
    queryFn: () =>
      apiJson<InquiryDashboard>(`${SALES_API}/dashboard/inquiry?${query}`),
  });
}
