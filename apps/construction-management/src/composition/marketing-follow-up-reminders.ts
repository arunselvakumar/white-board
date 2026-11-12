import { prisma } from "@repo/construction-db";

import {
  FOLLOW_UP_REMINDERS_JOB,
  sendFollowUpReminders,
} from "@/src/marketing/application/follow-up-reminders";
import { FOLLOW_UP_TYPE_LABELS } from "@/src/marketing/domain/marketing-terms";
import { prismaFollowUpStore } from "@/src/marketing/infrastructure/prisma-follow-up-store";
import { todayIn } from "@/src/shared-kernel/calendar-date";
import { companyToday } from "@/src/shared-kernel/company-today";
import type { QueueHandler } from "@/src/shared-kernel/queue";

import { createNotifier, notificationRecipientDirectory } from "./messaging";

/** The zone furthest ahead of UTC: no Company's today is later than its. */
const FURTHEST_AHEAD = "Pacific/Kiritimati";

/**
 * `marketing.follow_up_reminders`, run by the daily cron (ADR CM-0040 §8):
 * "due today" and "overdue" notices to each Follow-up's owner only, while
 * the owner holds Follow-ups read and Notification (CM-0021 §6).
 */
export function createFollowUpRemindersHandler(
  clock?: () => Date,
): QueueHandler {
  const notifier = createNotifier();
  return {
    type: FOLLOW_UP_REMINDERS_JOB,
    timeLimitMs: 240_000,
    async run() {
      await sendFollowUpReminders({
        store: prismaFollowUpStore,
        latestToday: (now) => todayIn(FURTHEST_AHEAD, now),
        today: (workspaceId, now) => companyToday(prisma, workspaceId, now),
        clock,
        async send(followUp, kind, today) {
          const users = await notificationRecipientDirectory.usersOfMembers(
            followUp.workspaceId,
            [followUp.ownerMemberId],
          );
          if (users.length === 0) return;
          const recipients = await notificationRecipientDirectory.holders({
            workspaceId: followUp.workspaceId,
            menu: "marketing.follow_ups",
            flag: "read",
            among: users,
          });
          const company =
            await prisma.constructionMarketingProspectCompany.findUnique({
              where: { id: followUp.prospectCompanyId },
              select: { name: true },
            });
          const what = `${FOLLOW_UP_TYPE_LABELS[followUp.type]} · ${company?.name ?? "a Prospect Company"}`;
          await notifier.notify(followUp.workspaceId, recipients, {
            type:
              kind === "due"
                ? "marketing.follow_up_due"
                : "marketing.follow_up_overdue",
            menu: "marketing.follow_ups",
            projectId: null,
            title: kind === "due" ? "Follow-up due today" : "Follow-up overdue",
            body: followUp.note == null ? what : `${what}: ${followUp.note}`,
            href: "/app/marketing/follow-ups",
            sourceKey:
              kind === "due"
                ? `marketing.follow_up_due:${followUp.id}:${today}`
                : `marketing.follow_up_overdue:${followUp.id}:${followUp.dueDate}`,
          });
        },
      });
    },
  };
}
