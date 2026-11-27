import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createLabourActivity } from "@/src/composition/labour-activity";

import { EMPLOYEES_MENU, EmployeeIdParamsModel } from "../../employee-models";
import {
  ListConstructionLabourEmployeeActivityRequestModel,
  toEmployeeActivityResponse,
} from "./activity-models";

export const dynamic = "force-dynamic";

const activity = createLabourActivity();

/**
 * The Employee's Activity (ADR CM-0038 §1, §5, CM-0055): Project moves, attendance
 * and its changes, check-in entries (ADR CM-0044) and profile entries, 30
 * a page, newest effective date first. Entries for Projects the viewer is
 * not on are left out, and check-in entries of Projects without Attendance
 * Read. No amounts.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, EMPLOYEES_MENU, "read");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      EmployeeIdParamsModel.safeParse(await context.params),
    );
    const query = parseOrThrow(
      ListConstructionLabourEmployeeActivityRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const page = await activity.feed(session.access, id, {
      type: query.type,
      projectId: query.projectId ?? null,
      from: query.from ?? null,
      to: query.to ?? null,
      cursor: query.cursor ?? null,
    });
    return Response.json(toEmployeeActivityResponse(page));
  } catch (error) {
    return mapError(error);
  }
}
