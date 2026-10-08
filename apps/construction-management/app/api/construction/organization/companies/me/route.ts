import {
  companies,
  getCompanyAuthFromHeaders,
} from "@repo/auth/construction/server";

import { mapError } from "@/app/api/_lib/map-error";
import { isResponse, requireUserSession } from "@/app/api/_lib/require-session";

import type { ListMyConstructionOrganizationCompaniesResponseModel } from "./list-my-companies-response-model";

export const dynamic = "force-dynamic";

/** The signed-in User's Companies and which one is active (CM-105). */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireUserSession(request);
    if (isResponse(session)) return session;
    const [mine, auth] = await Promise.all([
      companies.listForUser(session.userId),
      getCompanyAuthFromHeaders(request.headers),
    ]);
    const body: ListMyConstructionOrganizationCompaniesResponseModel = {
      items: mine.map((company) => ({
        ...company,
        isActive: company.id === auth.workspaceId,
      })),
      activeCompanyId: auth.workspaceId,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
