import { isPlaceholderEmail } from "@repo/auth/construction/server";
import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";

import { jsonError } from "@/app/api/_lib/json-error";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import {
  decodeDownloadCursor,
  encodeDownloadCursor,
} from "@/app/api/construction/reporting/downloads/download-models";
import {
  allowHrmsBackup,
  allowMastersBackup,
  allowProjectBackup,
  type AllowedModules,
} from "@/src/reporting/application/backup-access";
import type { BackupRequest } from "@/src/reporting/application/backup-handlers";
import { BACKUP_MODULES } from "@/src/reporting/domain/backup-modules";
import { verifyActionCode } from "@/src/shared-kernel/action-codes";

import { requireReportSession } from "../reports/handlers";
import {
  CreateConstructionReportingBackupRequestModel,
  ListConstructionReportingBackupsRequestModel,
  type ListConstructionReportingBackupsResponseModel,
} from "./backup-models";
import {
  backupResponse,
  backupResponses,
  backups,
  requireBackupUser,
} from "./handlers";

export const dynamic = "force-dynamic";
/** A backup runs after the response, in this invocation (ADR CM-0021 §1). */
export const maxDuration = 300;

const ALL_MODULES: AllowedModules = BACKUP_MODULES.map((module) => ({
  module,
  money: true,
}));

function projectNotFound(): Response {
  return jsonError(
    StatusCodes.NOT_FOUND,
    "PROJECT_NOT_FOUND",
    "There is no such Project.",
  );
}

/**
 * Asks for a backup (CM-906, ADR CM-0021 §8), queued as one part per
 * module and a zip step; the response is the queued backup (201).
 *
 * - `project`: Project View and View on each module (403 names the
 *   first module without it); amounts only with each module's money right.
 * - `masters`: View on each master.
 * - `company`: the Owner only, with a verified `company_backup` code;
 *   every module (HRMS included) with amounts, and the link is emailed.
 *   With `modules` it is an HRMS backup: HRMS modules only, each needing
 *   View on its HRMS menu, salary amounts with Salary Management's
 *   Financial (not emailed).
 * - `my_data`: any signed-in User, with or without an Active Company.
 *
 * Never refused because the plan has ended (CM-118 keeps export open).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = parseOrThrow(
      CreateConstructionReportingBackupRequestModel.safeParse(
        await request.json(),
      ),
    );
    let input: BackupRequest;
    if (body.scope === "my_data") {
      const user = await requireBackupUser(request);
      if (isResponse(user)) return user;
      input = {
        workspaceId: null,
        projectId: null,
        scope: "my_data",
        modules: [],
        fromDate: null,
        toDate: null,
        includeData: true,
        includeMedia: false,
        requestedBy: user.userId,
        notify: { workspaceId: user.workspaceId, email: null },
      };
    } else {
      const session = await requireReportSession(request);
      if (isResponse(session)) return session;
      const base = {
        workspaceId: session.workspaceId,
        requestedBy: session.userId,
        notify: { workspaceId: session.workspaceId, email: null },
      };
      if (body.scope === "project") {
        const project = await prisma.constructionProjectsProject.findFirst({
          where: {
            id: body.projectId,
            workspaceId: session.workspaceId,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (project == null) return projectNotFound();
        input = {
          ...base,
          projectId: body.projectId,
          scope: "project",
          modules: allowProjectBackup(
            session.access,
            body.projectId,
            body.modules,
          ),
          fromDate: body.from ?? null,
          toDate: body.to ?? null,
          includeData: body.includeData,
          includeMedia: body.includeMedia,
        };
      } else if (body.scope === "masters") {
        input = {
          ...base,
          projectId: null,
          scope: "masters",
          modules: allowMastersBackup(session.access, body.modules),
          fromDate: null,
          toDate: null,
          includeData: true,
          includeMedia: false,
        };
      } else {
        if (session.role !== "owner")
          return jsonError(
            StatusCodes.FORBIDDEN,
            "FORBIDDEN",
            "Only the Owner can take a full Company backup.",
          );
        // Checked before the code is used up.
        const chosen =
          body.modules == null
            ? ALL_MODULES
            : allowHrmsBackup(session.access, body.modules);
        await verifyActionCode({
          userId: session.userId,
          purpose: "company_backup",
          code: body.code,
          workspaceId: session.workspaceId,
          sessionId: session.sessionId,
        });
        input = {
          ...base,
          projectId: null,
          scope: "company",
          modules: chosen,
          fromDate: null,
          toDate: null,
          includeData: true,
          includeMedia: body.includeMedia,
          notify: {
            workspaceId: session.workspaceId,
            email: isPlaceholderEmail(session.user.email)
              ? null
              : session.user.email,
          },
        };
      }
    }
    const job = await backups.request(input);
    return Response.json(await backupResponse(job), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}

/**
 * The signed-in User's own backups in the Active Company and their data
 * exports, newest first. A read nudges a stuck one (ADR CM-0021 §1).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      ListConstructionReportingBackupsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const user = await requireBackupUser(request);
    if (isResponse(user)) return user;
    const before =
      model.cursor == null ? null : decodeDownloadCursor(model.cursor);
    if (model.cursor != null && before == null)
      return jsonError(
        StatusCodes.BAD_REQUEST,
        "CURSOR_INVALID",
        "This page link is not valid; start from the first page.",
      );
    const jobs = await backups.handlers.listOwn(user.userId, user.workspaceId, {
      before,
      limit: model.limit + 1,
    });
    const page = jobs.slice(0, model.limit);
    await backups.heal(page);
    const last = page.at(-1);
    const body: ListConstructionReportingBackupsResponseModel = {
      items: await backupResponses(page),
      nextCursor:
        jobs.length > model.limit && last != null
          ? encodeDownloadCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
