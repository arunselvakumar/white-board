import { whiteboardMessaging } from "@repo/auth/server";
import { renderDailyReportReadyEmail } from "@repo/email-templates";
import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import type { DailyReportNotifier } from "../application/daily-report-ports";
import { todayInIndia, type IsoDate } from "../domain/dates";

/** Where a Parent reads Daily Reports; the email links here. */
export const PARENT_HOME_PATH = "/preschool/family";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "25 Nov 2026", as emails print a date. */
export function dateText(date: IsoDate): string {
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return `${String(day)} ${MONTHS[month - 1] ?? ""} ${String(year)}`;
}

/** Emails each parent address on the Child's record, one email per address. */
export class EmailDailyReportNotifier implements DailyReportNotifier {
  constructor(
    private readonly now: () => Date = () => new Date(),
    private readonly db: PrismaClient = prisma,
  ) {}

  async published(
    input: Parameters<DailyReportNotifier["published"]>[0],
  ): Promise<void> {
    if (input.parentEmails.length === 0) return;
    const centre = await this.db.preschoolCentre.findUnique({
      where: { id: input.centreId },
      select: { name: true },
    });
    const rendered = await renderDailyReportReadyEmail({
      childName: input.childName,
      dateText: dateText(input.date),
      isToday: input.date === todayInIndia(this.now()),
      centreName: centre?.name ?? null,
      reportUrl: whiteboardMessaging.url(PARENT_HOME_PATH),
    });
    const results = await Promise.allSettled(
      input.parentEmails.map((to) =>
        whiteboardMessaging.sendEmail({ to, ...rendered }),
      ),
    );
    const failed = results.find((result) => result.status === "rejected");
    if (failed != null) throw failed.reason;
  }
}
