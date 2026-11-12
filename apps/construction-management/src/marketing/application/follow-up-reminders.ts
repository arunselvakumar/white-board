import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import { reminderDue } from "../domain/follow-up";
import type { FollowUpStore, StoredFollowUp } from "./ports";

/** The daily job that sends Follow-up reminders (ADR CM-0040 §8). */
export const FOLLOW_UP_REMINDERS_JOB = "marketing.follow_up_reminders";

const PAGE = 1_000;

export type FollowUpReminderDeps = {
  store: Pick<FollowUpStore, "openDueBy" | "markReminded">;
  /** The latest date it is anywhere now: nothing later can be due today. */
  latestToday: (now: Date) => CalendarDate;
  /** A Company's today. */
  today: (workspaceId: string, now: Date) => Promise<CalendarDate>;
  /** Tells the owner, if they hold Follow-ups read and Notification. */
  send: (
    followUp: StoredFollowUp,
    kind: "due" | "overdue",
    today: CalendarDate,
  ) => Promise<void>;
  clock?: () => Date;
};

/**
 * One notice for each Open Follow-up due today that has not had today's,
 * and one for each first found overdue (ADR CM-0040 §8). Each is marked
 * once sent, so a second run that day sends nothing; the notification's
 * source key makes a crash between the two harmless. Returns how many
 * were sent.
 */
export async function sendFollowUpReminders(
  deps: FollowUpReminderDeps,
): Promise<number> {
  const now = (deps.clock ?? (() => new Date()))();
  const todays = new Map<string, CalendarDate>();
  const todayOf = async (workspaceId: string) => {
    const known = todays.get(workspaceId);
    if (known != null) return known;
    const today = await deps.today(workspaceId, now);
    todays.set(workspaceId, today);
    return today;
  };
  let sent = 0;
  let after: string | undefined;
  for (;;) {
    const page = await deps.store.openDueBy(deps.latestToday(now), {
      after,
      limit: PAGE,
    });
    for (const followUp of page) {
      const today = await todayOf(followUp.workspaceId);
      const kind = reminderDue(followUp, today);
      if (kind == null) continue;
      await deps.send(followUp, kind, today);
      await deps.store.markReminded(
        followUp.id,
        kind === "due" ? { dueNotifiedOn: today } : { overdueNotifiedAt: now },
      );
      sent += 1;
    }
    if (page.length < PAGE) break;
    after = page.at(-1)?.id;
  }
  return sent;
}
