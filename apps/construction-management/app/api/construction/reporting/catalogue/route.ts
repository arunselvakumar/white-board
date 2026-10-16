import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";

import { jsonError } from "@/app/api/_lib/json-error";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { viewerCatalogue } from "@/src/reporting/application/report-access";
import { prismaProjectLookup } from "@/src/reporting/infrastructure/prisma-report-source";

import { requireReportSession } from "../reports/handlers";
import {
  ListConstructionReportingCatalogueRequestModel,
  toCatalogueEntryResponse,
  type ListConstructionReportingCatalogueResponseModel,
} from "./catalogue-models";

export const dynamic = "force-dynamic";

const projects = prismaProjectLookup(prisma);

/**
 * The report catalogue trimmed to the viewer (ADR CM-0021 §2): every
 * built report of the scope they may request, by the Report (or, for a
 * Progress Report, Add) flag on its menu and Project. A report about
 * money is left out without the money right; `includesMoney` says
 * whether their files would carry amounts. Another Company's Project is
 * 404; a Project the member is not on lists nothing.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireReportSession(request);
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ListConstructionReportingCatalogueRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const projectId = model.projectId ?? null;
    // A Project the member is not on answers like a missing one, so the
    // route never tells whether an id exists in the Company.
    if (
      projectId != null &&
      ((session.role !== "owner" &&
        !session.access.projectIds.has(projectId)) ||
        !(await projects.exists(session.workspaceId, projectId)))
    )
      return jsonError(
        StatusCodes.NOT_FOUND,
        "PROJECT_NOT_FOUND",
        "There is no such Project.",
      );
    const body: ListConstructionReportingCatalogueResponseModel = {
      scope: model.scope,
      items: viewerCatalogue(session.access, model.scope, projectId).map(
        toCatalogueEntryResponse,
      ),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
