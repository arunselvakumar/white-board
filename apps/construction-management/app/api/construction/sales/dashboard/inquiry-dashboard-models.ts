import { z } from "zod";

import {
  CALL_ACTIVITY_PERIODS,
  type InquiryDashboard,
} from "@/src/sales/application/sales-dashboard";
import { FOLLOW_UP_ACTIVITIES } from "@/src/sales/domain/sales-terms";

export const INQUIRY_DASHBOARD_PATH =
  "/api/construction/sales/dashboard/inquiry";

export const GetConstructionSalesInquiryDashboardRequestModel = z
  .object({
    projectId: z.uuid(),
    /** The dashboard duration, by Inquiry Date (Done on for follow-ups). */
    from: z.iso.date(),
    to: z.iso.date(),
    /** Call Activity's own period; Today when left out. */
    period: z.enum(CALL_ACTIVITY_PERIODS).optional().default("today"),
  })
  .refine((value) => value.from <= value.to, {
    message: "from must not be after to.",
    path: ["from"],
  });

const named = { name: z.string() };

export const GetConstructionSalesInquiryDashboardResponseModel = z
  .object({
    projectId: z.uuid(),
    /** Null without Inquiry Read on the Project. */
    inquiry: z
      .object({
        /** Inquiries with an Inquiry Date in the duration. */
        total: z.number().int(),
        converted: z.number().int(),
        lost: z.number().int(),
        /** Converted ÷ Total × 100, one decimal; null without inquiries. */
        conversionRate: z.number().nullable(),
        /** Open inquiries now, whatever their date. */
        open: z.number().int(),
        /** Open inquiries whose next follow-up is before now. */
        overdue: z.number().int(),
        /** Open inquiries per live stage, in stage order. */
        funnel: z.array(
          z.object({ stageId: z.uuid(), ...named, count: z.number().int() }),
        ),
        /** Inquiries of the duration per Lead Source (null: none). */
        leadSources: z.array(
          z.object({
            leadSourceId: z.uuid().nullable(),
            ...named,
            total: z.number().int(),
            converted: z.number().int(),
            rate: z.number().nullable(),
          }),
        ),
        /**
         * Per assignee (null: not assigned): inquiries and conversions of
         * the duration, follow-ups they did (Done on in the duration).
         */
        team: z.array(
          z.object({
            memberId: z.uuid().nullable(),
            ...named,
            inquiries: z.number().int(),
            followUps: z.number().int(),
            conversions: z.number().int(),
          }),
        ),
        /** Follow-ups by Done on in the period, in the Company's time zone. */
        callActivity: z.object({
          period: z.enum(CALL_ACTIVITY_PERIODS),
          calls: z.number().int(),
          all: z.number().int(),
          byActivity: z.array(
            z.object({
              activity: z.enum(FOLLOW_UP_ACTIVITIES),
              count: z.number().int(),
            }),
          ),
        }),
      })
      .nullable(),
  })
  .meta({
    description:
      "The Project Dashboard's Inquiry section (CM-1008); View all scopes it like the Inquiries list.",
  });
export type GetConstructionSalesInquiryDashboardResponseModel = z.infer<
  typeof GetConstructionSalesInquiryDashboardResponseModel
>;

export function toInquiryDashboardResponse(
  projectId: string,
  inquiry: InquiryDashboard | null,
): GetConstructionSalesInquiryDashboardResponseModel {
  return { projectId, inquiry };
}
