import type { PrismaClient } from "@repo/construction-db";

import {
  assertCanCreate,
  type BackdatedPolicy,
} from "@/src/shared-kernel/backdated-policy";
import {
  loadBackdatedActor,
  loadBackdatedPolicy,
} from "@/src/shared-kernel/backdated-policy-reader";
import {
  calendarDateFromDb,
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";

import type { LeaveBackdatedGuard } from "../application/leave-ports";
import type { LeaveDay, LeaveDaySource } from "../application/ports";
import { firstDayOf, lastDayOf, type MonthKey } from "../domain/calendar";
import { sessionDays } from "../domain/leave-request";

/**
 * Approved leave per member per day (CM-312), read by salary (CM-316), day
 * status (CM-308) and reports. A request waiting for its cancellation to
 * be decided is still leave; a cancelled one is not.
 */
export class PrismaLeaveDaySource implements LeaveDaySource {
  constructor(
    private readonly db: Pick<
      PrismaClient,
      "constructionHrmsLeaveRequestDay" | "constructionHrmsLeaveType"
    >,
  ) {}

  async approvedForMonth(
    workspaceId: string,
    memberIds: readonly string[],
    month: MonthKey,
  ): Promise<Map<string, LeaveDay[]>> {
    const result = new Map<string, LeaveDay[]>(memberIds.map((id) => [id, []]));
    if (memberIds.length === 0) return result;
    const rows = await this.db.constructionHrmsLeaveRequestDay.findMany({
      where: {
        leaveDate: {
          gte: calendarDateToDb(firstDayOf(month)),
          lte: calendarDateToDb(lastDayOf(month)),
        },
        request: {
          workspaceId,
          memberId: { in: [...new Set(memberIds)] },
          status: { in: ["approved", "cancellation_requested"] },
        },
      },
      select: {
        leaveDate: true,
        session: true,
        request: {
          select: {
            id: true,
            memberId: true,
            leaveTypeId: true,
          },
        },
      },
      orderBy: [{ leaveDate: "asc" }, { id: "asc" }],
    });
    const typeIds = [...new Set(rows.map((row) => row.request.leaveTypeId))];
    const types =
      typeIds.length === 0
        ? []
        : await this.db.constructionHrmsLeaveType.findMany({
            where: { workspaceId, id: { in: typeIds } },
            select: { id: true, name: true, isPaid: true },
          });
    const typeById = new Map(types.map((type) => [type.id, type]));
    for (const row of rows) {
      const type = typeById.get(row.request.leaveTypeId);
      result.get(row.request.memberId)?.push({
        date: calendarDateFromDb(row.leaveDate),
        requestId: row.request.id,
        leaveTypeId: row.request.leaveTypeId,
        leaveTypeName: type?.name ?? "Leave",
        isPaid: type?.isPaid ?? true,
        session: row.session,
        days: sessionDays(row.session),
      });
    }
    return result;
  }
}

/** The kernel's back-dated entry policy for `leave` (first day of the request). */
export class PrismaLeaveBackdatedGuard implements LeaveBackdatedGuard {
  constructor(
    private readonly db: PrismaClient,
    private readonly today: (workspaceId: string) => Promise<CalendarDate>,
  ) {}

  async assertCanCreate(
    actor: { workspaceId: string; userId: string; role: "owner" | "member" },
    fromDate: CalendarDate,
  ): Promise<void> {
    const [policy, who, today]: [
      BackdatedPolicy,
      Awaited<ReturnType<typeof loadBackdatedActor>>,
      CalendarDate,
    ] = await Promise.all([
      loadBackdatedPolicy(this.db, actor.workspaceId),
      loadBackdatedActor(this.db, actor),
      this.today(actor.workspaceId),
    ]);
    assertCanCreate(policy, "leave", fromDate, who, today);
  }
}
