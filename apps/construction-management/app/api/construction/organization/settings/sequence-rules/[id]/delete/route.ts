import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createSequenceRuleHandlers } from "@/src/organization/infrastructure/create-sequence-rule-handlers";

import { ConstructionOrganizationSequenceRuleParamsModel } from "../sequence-rule-params-model";

export const dynamic = "force-dynamic";

const handlers = createSequenceRuleHandlers();

/** Deletes a rule that never issued a number; 409 SEQUENCE_RULE_IN_USE otherwise (CM-114). */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "organization.settings",
      "delete",
    );
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionOrganizationSequenceRuleParamsModel.safeParse(
        await context.params,
      ),
    );
    await handlers.delete({
      workspaceId: session.workspaceId,
      id,
      by: session.userId,
    });
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
