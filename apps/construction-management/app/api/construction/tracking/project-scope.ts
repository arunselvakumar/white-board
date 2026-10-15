import { z } from "zod";

import { parseOrThrow } from "@/app/api/_lib/map-error";

const TrackingProjectScope = z.object({ projectId: z.uuid() });

/**
 * The Project a tracking collection request is for (a query string or a
 * JSON body), read before the rest of the request is validated, so access
 * is checked first: a caller without access to the Project gets 403, not
 * validation details.
 */
export function requestProjectId(raw: unknown): string {
  return parseOrThrow(TrackingProjectScope.safeParse(raw)).projectId;
}
