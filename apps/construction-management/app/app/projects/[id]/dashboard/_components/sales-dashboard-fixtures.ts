import type {
  BookingDashboard,
  InquiryDashboard,
} from "@/src/queries/sales-dashboard";

/** Story fixtures for the Project Dashboard's Booking section (CM-1008). */

export const BOOKING_DASHBOARD_PATH =
  "/api/construction/sales/dashboard/booking";

const counts = (
  available: number,
  onHold: number,
  booked: number,
  unavailable: number,
) => ({
  total: available + onHold + booked + unavailable,
  available,
  on_hold: onHold,
  booked,
  unavailable,
});

export function bookingDashboard(projectId: string): BookingDashboard {
  return {
    projectId,
    booking: {
      today: "2026-10-17",
      counts: counts(14, 3, 9, 2),
      wings: [
        {
          id: "0199c4a0-0000-7000-8000-00000000a101",
          name: "Tower A",
          counts: counts(6, 2, 7, 1),
        },
        {
          id: "0199c4a0-0000-7000-8000-00000000a102",
          name: "Tower B",
          counts: counts(8, 1, 2, 1),
        },
      ],
      latest: [
        {
          id: "0199c4a0-0000-7000-8000-00000000d001",
          wingName: "Tower A",
          unitName: "101",
          customerName: "Meena Raghavan",
          bookingDate: "2026-10-16",
          status: "booked",
        },
        {
          id: "0199c4a0-0000-7000-8000-00000000d002",
          wingName: "Tower B",
          unitName: "G02",
          customerName: "Ravi Kumar",
          bookingDate: "2026-10-14",
          status: "on_hold",
        },
        {
          id: "0199c4a0-0000-7000-8000-00000000d003",
          wingName: "Tower A",
          unitName: "302",
          customerName: "Kavya S",
          bookingDate: "2026-10-02",
          status: "hold_expired",
        },
      ],
    },
  };
}

export function emptyBookingDashboard(projectId: string): BookingDashboard {
  return {
    projectId,
    booking: {
      today: "2026-10-17",
      counts: counts(0, 0, 0, 0),
      wings: [],
      latest: [],
    },
  };
}

/** Without Booking Read on the Project. */
export function noBookingDashboard(projectId: string): BookingDashboard {
  return { projectId, booking: null };
}

// ---------------------------------------------------------------------------
// The Inquiry section (CM-1008)
// ---------------------------------------------------------------------------

export const INQUIRY_DASHBOARD_PATH =
  "/api/construction/sales/dashboard/inquiry";

const ACTIVITY_COUNTS = {
  today: [3, 1, 0, 1, 0, 0],
  yesterday: [5, 0, 1, 2, 0, 0],
  this_week: [14, 3, 2, 6, 1, 0],
  this_month: [41, 9, 4, 15, 3, 1],
  all_time: [96, 21, 11, 38, 6, 2],
} as const;

export function inquiryDashboard(
  projectId: string,
  period: keyof typeof ACTIVITY_COUNTS = "today",
): InquiryDashboard {
  const counts: readonly number[] = ACTIVITY_COUNTS[period];
  const activities = [
    "call",
    "site_visit",
    "meeting",
    "whatsapp",
    "email",
    "other",
  ] as const;
  return {
    projectId,
    inquiry: {
      total: 48,
      converted: 6,
      lost: 9,
      conversionRate: 12.5,
      open: 37,
      overdue: 7,
      funnel: [
        {
          stageId: "0199c4a0-0000-7000-8000-00000000e101",
          name: "New",
          count: 14,
        },
        {
          stageId: "0199c4a0-0000-7000-8000-00000000e102",
          name: "Contacted",
          count: 11,
        },
        {
          stageId: "0199c4a0-0000-7000-8000-00000000e103",
          name: "Site Visit",
          count: 8,
        },
        {
          stageId: "0199c4a0-0000-7000-8000-00000000e104",
          name: "Negotiation",
          count: 4,
        },
      ],
      leadSources: [
        {
          leadSourceId: "0199c4a0-0000-7000-8000-00000000e201",
          name: "Walk-in",
          total: 20,
          converted: 4,
          rate: 20,
        },
        {
          leadSourceId: "0199c4a0-0000-7000-8000-00000000e202",
          name: "Referral",
          total: 16,
          converted: 2,
          rate: 12.5,
        },
        {
          leadSourceId: null,
          name: "No lead source",
          total: 12,
          converted: 0,
          rate: 0,
        },
      ],
      team: [
        {
          memberId: "0199c4a0-0000-7000-8000-00000000e301",
          name: "Karthik R",
          inquiries: 30,
          followUps: 64,
          conversions: 5,
        },
        {
          memberId: null,
          name: "Not assigned",
          inquiries: 18,
          followUps: 0,
          conversions: 1,
        },
      ],
      callActivity: {
        period,
        calls: counts[0] ?? 0,
        all: counts.reduce((sum, count) => sum + count, 0),
        byActivity: activities.map((activity, index) => ({
          activity,
          count: counts[index] ?? 0,
        })),
      },
    },
  };
}

export function emptyInquiryDashboard(projectId: string): InquiryDashboard {
  return {
    projectId,
    inquiry: {
      total: 0,
      converted: 0,
      lost: 0,
      conversionRate: null,
      open: 0,
      overdue: 0,
      funnel: [],
      leadSources: [],
      team: [],
      callActivity: {
        period: "today",
        calls: 0,
        all: 0,
        byActivity: [],
      },
    },
  };
}
