import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { toPersonActivityResponse } from "@/app/api/construction/labour/labours/[id]/activity/activity-models";
import { createSiteEngineerActivity } from "@/src/composition/person-activity";

import { ConstructionMastersIdParamsModel } from "../../../_lib/master-models";
import { SITE_ENGINEER_MENU } from "../../site-engineer-models";
import { ListConstructionMastersSiteEngineerActivityRequestModel } from "./activity-models";

export const dynamic = "force-dynamic";

const activity = createSiteEngineerActivity();

/**
 * A Site Engineer's Activity (ADR CM-0044 §7): their check-in entries and
 * the Projects their sign-in was added to and removed from, 30 a page,
 * newest first. Entries for Projects the viewer is not on are left out,
 * and check-in entries of Projects without Attendance Read. No amounts.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, SITE_ENGINEER_MENU, "read");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionMastersIdParamsModel.safeParse(await context.params),
    );
    const query = parseOrThrow(
      ListConstructionMastersSiteEngineerActivityRequestModel.safeParse(
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
    return Response.json(toPersonActivityResponse(page));
  } catch (error) {
    return mapError(error);
  }
}
