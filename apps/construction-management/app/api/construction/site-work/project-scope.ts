import { z } from "zod";

import { parseOrThrow } from "@/app/api/_lib/map-error";

const SiteWorkProjectScope = z.object({ projectId: z.uuid() });

/**
 * The Project a site-work collection request is for, read before the rest
 * of the request is validated, so access is checked first: a caller
 * without access to the Project gets 403, not validation details.
 */
export function requestProjectId(raw: unknown): string {
  return parseOrThrow(SiteWorkProjectScope.safeParse(raw)).projectId;
}
