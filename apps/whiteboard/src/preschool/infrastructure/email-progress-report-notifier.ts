import { whiteboardMessaging } from "@repo/auth/server";
import { renderProgressReportReadyEmail } from "@repo/email-templates";

import type { ProgressReportNotifier } from "../application/progress-report-ports";
import { PARENT_HOME_PATH } from "./email-daily-report-notifier";

/** Emails each parent address on the Child's record. */
export class EmailProgressReportNotifier implements ProgressReportNotifier {
  async published(
    input: Parameters<ProgressReportNotifier["published"]>[0],
  ): Promise<void> {
    const rendered = await renderProgressReportReadyEmail({
      childName: input.childName,
      termLabel: input.termLabel,
      academicYearName: input.academicYearName,
      url: whiteboardMessaging.url(PARENT_HOME_PATH),
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
