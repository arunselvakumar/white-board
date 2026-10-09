import { companies } from "@repo/auth/construction/server";
import { StatusCodes } from "http-status-codes";

import { jsonWithCookies } from "@/app/api/_lib/forward-cookies";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireUserSession } from "@/app/api/_lib/require-session";
import { createCompanyHandlers } from "@/src/organization/infrastructure/create-company-handlers";

import { CreateConstructionOrganizationCompanyRequestModel } from "./create-company-request-model";
import type { CreateConstructionOrganizationCompanyResponseModel } from "./create-company-response-model";

export const dynamic = "force-dynamic";

const handlers = createCompanyHandlers();

/**
 * Creates a Company with the caller as Owner and makes it the Active Company
 * (CM-105). Any signed-in User may create one; no Active Company is needed.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireUserSession(request);
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionOrganizationCompanyRequestModel.safeParse(
        await request.json(),
      ),
    );
    const created = await handlers.create.execute({
      ...model,
      userId: session.userId,
      userName: session.user.name,
      userMobile: session.user.phoneNumber,
      userEmail: session.user.emailVerified ? session.user.email : null,
    });
    const cookies = await companies.activate(
      request.headers,
      created.workspaceId,
    );
    const body: CreateConstructionOrganizationCompanyResponseModel = {
      id: created.workspaceId,
      name: created.name,
    };
    return jsonWithCookies(body, { status: StatusCodes.CREATED, cookies });
  } catch (error) {
    return mapError(error);
  }
}
