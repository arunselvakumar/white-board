import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createSequenceRuleHandlers } from "@/src/organization/infrastructure/create-sequence-rule-handlers";

import { mapSequenceRule } from "../../sequence-rule-fields";
import { ConstructionOrganizationSequenceRuleParamsModel } from "../sequence-rule-params-model";
import {
  UpdateConstructionOrganizationSequenceRuleRequestModel,
  type UpdateConstructionOrganizationSequenceRuleResponseModel,
} from "./update-sequence-rule-models";

export const dynamic = "force-dynamic";

const handlers = createSequenceRuleHandlers();

/** Changes a rule's number format; later numbers use it, issued ones stay (CM-114). */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "organization.settings",
      "update",
    );
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionOrganizationSequenceRuleParamsModel.safeParse(
        await context.params,
      ),
    );
    const { expectedUpdatedAt, ...settings } = parseOrThrow(
      UpdateConstructionOrganizationSequenceRuleRequestModel.safeParse(
        await request.json(),
      ),
    );
    const updated = await handlers.update({
      workspaceId: session.workspaceId,
      id,
      settings,
      expectedUpdatedAt: new Date(expectedUpdatedAt),
      by: session.userId,
    });
    const body: UpdateConstructionOrganizationSequenceRuleResponseModel =
      mapSequenceRule(updated);
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
