import { whiteboardMessaging, workspaces } from "@repo/auth/server";
import { renderReportEmail } from "@repo/email-templates";
import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import { ReportHandlers } from "../application/report-handlers";
import type { ReportMailer, ReportRenderer } from "../application/report-ports";
import { withTimeout } from "./absence-notice-mailer";
import { PrismaReportSource, type ReportNames } from "./prisma-report-source";
import { reportPdf } from "./report-pdf";
import { reportXlsx } from "./report-xlsx";

/** The Owner waits for each email; a hung provider must not hold the request. */
export const REPORT_EMAIL_TIMEOUT_MS = 15_000;

const identityNames: ReportNames = {
  workspaceName: (workspaceId) => workspaces.name(workspaceId),
  displayNames: (userIds) => workspaces.displayNames(userIds),
};

const emailMailer: ReportMailer = {
  async send(input) {
    const rendered = await renderReportEmail({
      subject: input.subject,
      heading: input.heading,
      lines: input.lines,
    });
    await withTimeout(
      whiteboardMessaging.sendEmail({
        to: input.to,
        ...rendered,
        attachments: [input.attachment],
      }),
      REPORT_EMAIL_TIMEOUT_MS,
      "Report email",
    );
  },
};

export const reportRenderer: ReportRenderer = {
  pdf: reportPdf,
  xlsx: reportXlsx,
};

export function createReportHandlers(deps?: {
  prisma?: PrismaClient;
  names?: ReportNames;
  mailer?: ReportMailer;
  now?: () => Date;
}): ReportHandlers {
  return new ReportHandlers({
    source: new PrismaReportSource(
      deps?.prisma ?? prisma,
      deps?.names ?? identityNames,
    ),
    renderer: reportRenderer,
    mailer: deps?.mailer ?? emailMailer,
    now: deps?.now ?? (() => new Date()),
  });
}
