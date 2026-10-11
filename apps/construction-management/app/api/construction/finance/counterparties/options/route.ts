import { prisma } from "@repo/construction-db";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { financeDirectory } from "@/src/composition/finance-directory";

import {
  GetConstructionFinanceCounterpartyOptionsRequestModel,
  type GetConstructionFinanceCounterpartyOptionsResponseModel,
} from "../../lookup-models";

export const dynamic = "force-dynamic";

/**
 * Parties of one kind for the Paid To / Received From picker (ADR CM-0017
 * §5). Names only; any member of the Company may list them.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const model = parseOrThrow(
      GetConstructionFinanceCounterpartyOptionsRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    const projectId = model.projectId ?? null;
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
