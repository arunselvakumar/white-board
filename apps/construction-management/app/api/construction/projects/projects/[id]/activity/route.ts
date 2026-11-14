import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createProjectActivity } from "@/src/composition/project-activity";

import { ConstructionProjectsProjectParamsModel } from "../../project-models";
import {
  ListConstructionProjectsProjectActivityRequestModel,
  toProjectActivityResponse,
} from "./activity-models";

export const dynamic = "force-dynamic";

const activity = createProjectActivity();

/**
 * The Project's Activity (ADR CM-0038 §1, §4): Site Engineers and Labours
 * added and removed, Labours transferred in and out, and everyone's
 * check-in entries with Attendance Read (ADR CM-0044), 30 a page, newest
 * effective date first. 404 for another Company's Project or one the
 * Member is not on.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.project", "read");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionProjectsProjectParamsModel.safeParse(await context.params),
    );
    const query = parseOrThrow(
      ListConstructionProjectsProjectActivityRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const page = await activity.feed(session.access, id, {
      type: query.type,
      who: query.who,
      from: query.from ?? null,
      to: query.to ?? null,
      cursor: query.cursor ?? null,
    });
    return Response.json(toProjectActivityResponse(page));
  } catch (error) {
    return mapError(error);
  }
}
