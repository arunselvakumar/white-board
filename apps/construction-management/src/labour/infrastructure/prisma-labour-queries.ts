import type { PrismaClient } from "@repo/construction-db";

import { todayIn, type CalendarDate } from "@/src/shared-kernel/calendar-date";

/** Today in the Company's time zone (its profile; India by default). */
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
