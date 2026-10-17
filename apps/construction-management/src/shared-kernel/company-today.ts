import type { PrismaClient } from "@repo/construction-db";

import { todayIn, type CalendarDate } from "./calendar-date";

/** The Company's time zone (its profile), India when unset or invalid. */
export async function companyTimezone(
  db: Pick<PrismaClient, "constructionOrganizationCompanyProfile">,
  workspaceId: string,
): Promise<string> {
  const profile = await db.constructionOrganizationCompanyProfile.findUnique({
    where: { workspaceId },
    select: { timezone: true },
  });
  const timezone = profile?.timezone ?? "Asia/Kolkata";
  try {
    new Intl.DateTimeFormat("en-IN", { timeZone: timezone });
    return timezone;
  } catch {
    return "Asia/Kolkata";
  }
}

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
