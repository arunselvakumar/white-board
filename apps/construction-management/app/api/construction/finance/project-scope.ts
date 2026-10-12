import { z } from "zod";

import { parseOrThrow } from "@/app/api/_lib/map-error";

const FinanceProjectScope = z.object({ projectId: z.uuid() });
const OptionalFinanceProjectScope = z.object({
  projectId: z.uuid().optional(),
});

/**
 * The Project a finance request is for, read before the rest of it is
 * validated so access is checked first: a caller without access gets
 * 401 / 403, not validation details (as site work does).
 */
export function requestProjectId(raw: unknown): string {
  return parseOrThrow(FinanceProjectScope.safeParse(raw)).projectId;
}

/** As `requestProjectId`, for requests where the Project is optional. */
export function optionalRequestProjectId(raw: unknown): string | undefined {
  return parseOrThrow(OptionalFinanceProjectScope.safeParse(raw)).projectId;
}
