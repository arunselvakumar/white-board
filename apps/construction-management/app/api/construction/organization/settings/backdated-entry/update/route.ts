import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createBackdatedPolicyHandlers } from "@/src/organization/infrastructure/create-backdated-policy-handlers";

import { mapBackdatedEntryPolicy } from "../map-backdated-entry-policy";
import { UpdateConstructionOrganizationBackdatedEntryPolicyRequestModel } from "./update-backdated-entry-policy-request-model";
import type { UpdateConstructionOrganizationBackdatedEntryPolicyResponseModel } from "./update-backdated-entry-policy-response-model";

export const dynamic = "force-dynamic";

const handlers = createBackdatedPolicyHandlers();

/** Replaces the Active Company's Back-dated Entry policy, audited with before and after (CM-113). */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "organization.settings",
      "update",
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      UpdateConstructionOrganizationBackdatedEntryPolicyRequestModel.safeParse(
        await request.json(),
      ),
    );
    const saved = await handlers.update({
      workspaceId: session.workspaceId,
      policy: model,
      expectedUpdatedAt:
        model.expectedUpdatedAt == null
          ? null
          : new Date(model.expectedUpdatedAt),
      by: session.userId,
    });
    const body: UpdateConstructionOrganizationBackdatedEntryPolicyResponseModel =
      mapBackdatedEntryPolicy(saved);
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
