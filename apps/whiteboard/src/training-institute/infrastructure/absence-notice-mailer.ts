import { whiteboardMessaging, workspaces } from "@repo/auth/server";
import { renderAbsenceNoticeEmail } from "@repo/email-templates";

import type {
  AbsenceNoticeMailer,
  UserDirectory,
} from "../application/absence-notice-ports";
import { ABSENCE_REASON_LABELS } from "../domain/absence-notice";

/** Where a Teacher sees expected absentees; the email links here. */
export const TEACHER_ABSENCE_NOTICES_PATH = "/teacher/absence-notices";

/** Emails a Teacher about an Absence Notice given or withdrawn (ADR-0041). */
export class EmailAbsenceNoticeMailer implements AbsenceNoticeMailer {
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
    await whiteboardMessaging.sendEmail({ to: email.to, ...rendered });
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
