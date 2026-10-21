import { prisma } from "@repo/construction-db";

import { inquiryHandlers } from "@/src/composition/sales-inquiries";
import { salesDirectory } from "@/src/composition/sales-directory";
import {
  callActivityRange,
  inquiryDashboard,
  type CallActivityPeriod,
  type InquiryDashboard,
} from "@/src/sales/application/sales-dashboard";
import { salesInstant } from "@/src/sales/domain/sales-time";
import { PrismaInquiryDashboardStore } from "@/src/sales/infrastructure/sales-dashboard-store";
import type { MemberAccess } from "@/src/shared-kernel/access";
import { addDays, type CalendarDate } from "@/src/shared-kernel/calendar-date";
import {
  companyTimezone,
  companyToday,
} from "@/src/shared-kernel/company-today";

const store = new PrismaInquiryDashboardStore(prisma, salesDirectory);

/**
 * The Project Dashboard's Inquiry section (CM-1008): View all as the
 * Inquiries list (the inquiry handlers' `visibility`), the Company's
 * today and time zone for Overdue, the duration and Call Activity.
 */
export async function readInquiryDashboard(
  access: MemberAccess,
  projectId: string,
  range: { from: CalendarDate; to: CalendarDate },
  period: CallActivityPeriod,
): Promise<InquiryDashboard> {
  const ws = access.workspaceId;
  const [visibility, bounds, today, timeZone] = await Promise.all([
    inquiryHandlers.visibility(access, projectId),
    inquiryHandlers.bounds(ws),
    companyToday(prisma, ws),
    companyTimezone(prisma, ws),
  ]);
  const figures = await store.read({
    workspaceId: ws,
    projectId,
    visibility,
    range,
    rangeInstants: {
      from: salesInstant(range.from, null, timeZone),
      to: salesInstant(addDays(range.to, 1), null, timeZone),
    },
    bounds,
    calls: callActivityRange(period, today, timeZone),
  });
  return inquiryDashboard(figures, period);
}
