import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";

import { jsonError } from "@/app/api/_lib/json-error";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { reportFilterChoices } from "@/src/composition/report-filter-options";
import { viewerCatalogue } from "@/src/reporting/application/report-access";
import type { ReportFilterKey } from "@/src/reporting/domain/report-catalogue";
import { prismaProjectLookup } from "@/src/reporting/infrastructure/prisma-report-source";
import { can } from "@/src/shared-kernel/access";

import { requireReportSession } from "../reports/handlers";
import {
  ListConstructionReportingFilterOptionsRequestModel,
  toFilterOptionsResponse,
} from "./filter-options-models";

export const dynamic = "force-dynamic";

const projects = prismaProjectLookup(prisma);

/**
 * The choices for the report cards' pickers (CM-903): Projects, Stores,
 * vendors, Labour Categories, Suppliers, Material Categories, Materials
 * and who raised Purchase Requests, each read only when a report the
 * viewer may request in the scope takes that filter (the catalogue,
 * trimmed to their Permission Matrix). Another Company's Project is 404.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      ListConstructionReportingFilterOptionsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireReportSession(request);
    if (isResponse(session)) return session;
    const projectId = model.projectId ?? null;
    if (
      projectId != null &&
      !(await projects.exists(session.workspaceId, projectId))
    )
      return jsonError(
        StatusCodes.NOT_FOUND,
        "PROJECT_NOT_FOUND",
        "There is no such Project.",
      );
    const keys = new Set<ReportFilterKey>(
      viewerCatalogue(session.access, model.scope, projectId)
        .filter((entry) => !entry.progressReport)
        .flatMap((entry) => entry.filters.map((filter) => filter.key)),
    );
    const choices = await reportFilterChoices({
      workspaceId: session.workspaceId,
      keys,
      projectId,
      projectIds:
        session.role === "owner" ? null : [...session.access.projectIds],
      stores: can(session.access, "procurement.central_store", "read"),
    });
    return Response.json(toFilterOptionsResponse(choices));
  } catch (error) {
    return mapError(error);
  }
}
