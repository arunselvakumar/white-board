import { companies } from "@repo/auth/construction/server";

import { jsonWithCookies } from "@/app/api/_lib/forward-cookies";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireUserSession } from "@/app/api/_lib/require-session";
import { notFound } from "@/src/shared-kernel/domain-error";

import { SwitchConstructionOrganizationCompanyParamsModel } from "./switch-company-params-model";
import type { SwitchConstructionOrganizationCompanyResponseModel } from "./switch-company-response-model";

export const dynamic = "force-dynamic";

/** Makes one of the caller's Companies the Active Company (CM-105). */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireUserSession(request);
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      SwitchConstructionOrganizationCompanyParamsModel.safeParse(
        await context.params,
      ),
    );
    const mine = await companies.listForUser(session.userId);
    if (!mine.some((company) => company.id === id))
      throw notFound("COMPANY_NOT_FOUND", "You are not in this Company.");
    const cookies = await companies.activate(request.headers, id);
    const body: SwitchConstructionOrganizationCompanyResponseModel = {
      activeCompanyId: id,
    };
    return jsonWithCookies(body, { cookies });
  } catch (error) {
    return mapError(error);
  }
}
