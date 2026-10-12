import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";

import { jsonError } from "@/app/api/_lib/json-error";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { financeDirectory } from "@/src/composition/finance-directory";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";

import {
  GetConstructionFinanceCounterpartyOptionsRequestModel,
  type GetConstructionFinanceCounterpartyOptionsResponseModel,
} from "../../lookup-models";

export const dynamic = "force-dynamic";

/**
 * Parties of one kind for the Paid To / Received From picker (ADR CM-0017
 * §5). Names only; any member of the Company may list them, and those of
 * a Project only when they are on it.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    // Who is asking comes first: an anonymous caller gets 401, not a 400.
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    const url = new URL(request.url);
    const model = parseOrThrow(
      GetConstructionFinanceCounterpartyOptionsRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const projectId = model.projectId ?? null;
    // Parties on a Project are listed only to members on that Project.
    if (projectId != null) {
      const access = await loadMemberAccess(prisma, session);
      if (access.role !== "owner" && !access.projectIds.has(projectId))
        return jsonError(
          StatusCodes.FORBIDDEN,
          "PERMISSION_DENIED",
          "You are not on this Project. Ask the Owner to add you to it.",
        );
    }
    const items =
      model.kind === "other_party"
        ? await prisma.constructionFinanceOtherParty.findMany({
            where: {
              workspaceId: session.workspaceId,
              deletedAt: null,
              ...(projectId == null
                ? {}
                : { projects: { some: { projectId } } }),
            },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          })
        : await financeDirectory.listParties(
            prisma,
            session.workspaceId,
            model.kind,
            projectId,
          );
    const body: GetConstructionFinanceCounterpartyOptionsResponseModel = {
      items,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
