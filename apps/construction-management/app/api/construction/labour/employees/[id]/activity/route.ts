import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createLabourActivity } from "@/src/composition/labour-activity";

import { LabourIdParamsModel } from "../../labour-models";
import {
  ListConstructionLabourLabourActivityRequestModel,
  toLabourActivityResponse,
} from "./activity-models";

export const dynamic = "force-dynamic";

const activity = createLabourActivity();

/**
 * The Labour's Activity (ADR CM-0038 §1, §5): Project moves, attendance
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
    const session = await requireAccess(request, "masters.labours", "read");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      LabourIdParamsModel.safeParse(await context.params),
    );
    const query = parseOrThrow(
      ListConstructionLabourLabourActivityRequestModel.safeParse(
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
    return Response.json(toLabourActivityResponse(page));
  } catch (error) {
    return mapError(error);
  }
}
