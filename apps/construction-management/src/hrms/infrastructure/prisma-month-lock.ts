import type { PrismaClient } from "@repo/construction-db";

import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import type { MonthLock } from "../application/ports";
import { monthKeyOf } from "../domain/calendar";
import { monthLocked } from "../domain/month-lock";

/**
 * Reads `construction_hrms.month_locks` (ADR CM-0012 §17): a member's month
 * is closed when it has a lock of its own or a Company-wide one. Locks are
 * written by salary approval (CM-316).
 */
export class PrismaMonthLock implements MonthLock {
  constructor(
    private readonly db: Pick<PrismaClient, "constructionHrmsMonthLock">,
  ) {}

  async isLocked(
    workspaceId: string,
    memberId: string,
    date: CalendarDate,
  ): Promise<boolean> {
    const found = await this.db.constructionHrmsMonthLock.findFirst({
      where: {
        workspaceId,
        month: monthKeyOf(date),
        OR: [{ memberId }, { memberId: null }],
      },
      select: { id: true },
    });
    return found != null;
  }

  async assertOpen(
    workspaceId: string,
    memberId: string,
    date: CalendarDate,
  ): Promise<void> {
    if (await this.isLocked(workspaceId, memberId, date))
      throw monthLocked(monthKeyOf(date));
  }
}
