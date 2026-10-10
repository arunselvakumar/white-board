import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createShiftAssignmentHandlers } from "@/src/hrms/infrastructure/create-hrms-ports";

import {
  AssignConstructionHrmsShiftRequestModel,
  ListConstructionHrmsShiftAssignmentsRequestModel,
  toAssignmentResponse,
  toMemberAssignmentsResponse,
  type AssignConstructionHrmsShiftResponseModel,
  type ListConstructionHrmsShiftAssignmentsResponseModel,
} from "./assignment-models";

export const dynamic = "force-dynamic";

const assignments = createShiftAssignmentHandlers();

/** Every Team Member's shift or rotation today, what is planned, and history (CM-307). */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "hrms.shifts", "read");
    if (isResponse(session)) return session;
    const query = parseOrThrow(
      ListConstructionHrmsShiftAssignmentsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const listed = await assignments.list({
      access: session.access,
      memberId: query.memberId,
    });
    const body: ListConstructionHrmsShiftAssignmentsResponseModel = {
      today: listed.today,
      items: listed.members.map(toMemberAssignmentsResponse),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Assigns a shift or a rotation to many Team Members from a date, until
 * changed; the assignment in force closes the day before (CM-307).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "hrms.shifts", "create");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      AssignConstructionHrmsShiftRequestModel.safeParse(await request.json()),
    );
    const created = await assignments.assign({
      access: session.access,
      memberIds: model.memberIds,
      shiftTemplateId: model.shiftTemplateId ?? null,
      rotationTemplateId: model.rotationTemplateId ?? null,
      effectiveFrom: model.effectiveFrom,
    });
    const body: AssignConstructionHrmsShiftResponseModel = {
      items: created.map(toAssignmentResponse),
    };
    return Response.json(body, { status: StatusCodes.CREATED });
  } catch (error) {
    return mapError(error);
  }
}
