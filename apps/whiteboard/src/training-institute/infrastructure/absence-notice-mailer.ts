import { whiteboardMessaging, workspaces } from "@repo/auth/server";
import { renderAbsenceNoticeEmail } from "@repo/email-templates";

import type {
  AbsenceNoticeMailer,
  UserDirectory,
} from "../application/absence-notice-ports";
import { ABSENCE_REASON_LABELS } from "../domain/absence-notice";

/** Where a Teacher sees expected absentees; the email links here. */
export const TEACHER_ABSENCE_NOTICES_PATH = "/teacher/absence-notices";

/**
 * The family's request waits for these emails, so a slow or hanging email
 * provider must not hold it up. After this long we stop waiting and the caller
 * logs it; the notice and in-app Notification are already saved. Stopping
 * waiting doesn't cancel the send (`EmailSender` takes no abort signal), so a
 * timed-out email may still arrive. Nothing retries it, so it can't arrive twice.
 */
export const ABSENCE_NOTICE_EMAIL_TIMEOUT_MS = 8_000;

/** Rejects if `work` hasn't settled within `ms`; `work` itself carries on. */
export async function withTimeout<T>(
  work: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          `${label}: no answer after ${String(ms)} ms; delivery unknown, it may still arrive.`,
        ),
      );
    }, ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Emails a Teacher about an Absence Notice given or withdrawn (ADR-0041). */
export class EmailAbsenceNoticeMailer implements AbsenceNoticeMailer {
  constructor(
    private readonly timeoutMs: number = ABSENCE_NOTICE_EMAIL_TIMEOUT_MS,
  ) {}

  async send(email: Parameters<AbsenceNoticeMailer["send"]>[0]): Promise<void> {
    const { payload } = email;
    const rendered = await renderAbsenceNoticeEmail({
      kind: email.kind === "absence_notice_given" ? "given" : "withdrawn",
      studentName: payload.studentName,
      batchName: payload.batchName,
      courseName: payload.courseName,
      classes: payload.classes,
      reasonLabel: ABSENCE_REASON_LABELS[payload.reason],
      note: payload.note,
      by: payload.by,
      noticesUrl: whiteboardMessaging.url(TEACHER_ABSENCE_NOTICES_PATH),
    });
    await withTimeout(
      whiteboardMessaging.sendEmail({ to: email.to, ...rendered }),
      this.timeoutMs,
      "Absence Notice email",
    );
  }
}

/** Display names and account emails from identity, through @repo/auth. */
export class WorkspaceUserDirectory implements UserDirectory {
  displayName(userId: string): Promise<string> {
    return workspaces.displayName(userId);
  }

  memberEmails(
    workspaceId: string,
    userIds: readonly string[],
  ): Promise<Map<string, string>> {
    return workspaces.memberEmails(workspaceId, [...userIds]);
  }
}
