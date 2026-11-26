import { whiteboardMessaging } from "@repo/auth/server";
import { renderAnnouncementEmail } from "@repo/email-templates";

import type { AnnouncementNotifier } from "../application/announcement-ports";
import { PARENT_HOME_PATH, dateText } from "./email-daily-report-notifier";

/** Emails sent at once; the rest wait their turn, so a large Workspace does not flood the provider. */
export const ANNOUNCEMENT_EMAIL_BATCH = 25;

const KIND_LABEL = {
  notice: "Notice",
  event: "Event",
  holiday: "Holiday",
} as const;

/** One email per Parent address, sent in batches; reports how many failed. */
export class EmailAnnouncementNotifier implements AnnouncementNotifier {
  constructor(private readonly batchSize: number = ANNOUNCEMENT_EMAIL_BATCH) {}

  async published(
    input: Parameters<AnnouncementNotifier["published"]>[0],
  ): Promise<void> {
    const rendered = await renderAnnouncementEmail({
      title: input.title,
      kindLabel: KIND_LABEL[input.kind],
      body: input.body,
      dateText: input.startsOn == null ? null : dateText(input.startsOn),
      url: whiteboardMessaging.url(PARENT_HOME_PATH),
    });
    let failed = 0;
    for (
      let start = 0;
      start < input.recipientEmails.length;
      start += this.batchSize
    ) {
      const batch = input.recipientEmails.slice(start, start + this.batchSize);
      const results = await Promise.allSettled(
        batch.map((to) => whiteboardMessaging.sendEmail({ to, ...rendered })),
      );
      failed += results.filter((result) => result.status === "rejected").length;
    }
    if (failed > 0)
      throw new Error(
        `${String(failed)} of ${String(input.recipientEmails.length)} Announcement emails failed.`,
      );
  }
}
