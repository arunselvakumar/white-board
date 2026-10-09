import { prisma } from "@repo/db";

import { mapError } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";

import { projectHandlers as handlers } from "../../handlers";
import type { ListConstructionProjectsProjectOptionsResponseModel } from "./list-project-options-response-model";

export const dynamic = "force-dynamic";

/**
 * Projects for pickers across the app — Team Member assignment, labour
 * forms, Sequence IDs (CM-204). Any Team Member may ask; the Owner gets
 * every Project, a Member the ones assigned to them.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    const access = await loadMemberAccess(prisma, session);
    const body: ListConstructionProjectsProjectOptionsResponseModel = {
      items: await handlers.options(access),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
