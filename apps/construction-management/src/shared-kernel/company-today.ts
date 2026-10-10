import type { PrismaClient } from "@repo/construction-db";

import { todayIn, type CalendarDate } from "./calendar-date";

/**
 * Today in the Company's time zone (its profile; India by default). Labour
 * and HRMS keep their own copies from before this existed; new code uses
 * this one.
 */
export async function companyToday(
  db: Pick<PrismaClient, "constructionOrganizationCompanyProfile">,
  workspaceId: string,
  now: Date = new Date(),
): Promise<CalendarDate> {
  const profile = await db.constructionOrganizationCompanyProfile.findUnique({
    where: { workspaceId },
    select: { timezone: true },
  });
  try {
    return todayIn(profile?.timezone ?? "Asia/Kolkata", now);
  } catch {
    return todayIn("Asia/Kolkata", now);
  }
}
