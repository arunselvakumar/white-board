import { prisma } from "@repo/construction-db";
import { z } from "zod";

import {
  requireAccess,
  type AccessSession,
} from "@/app/api/_lib/require-access";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { createLeaveHandlers } from "@/src/hrms/infrastructure/create-leave-handlers";
import type { Flag, MenuKey } from "@/src/shared-kernel/access";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";

/** Leave handlers (CM-310 … CM-313), wired once for every leave route. */
export const leaveHandlers = createLeaveHandlers();

/**
 * The Session and the caller's access. With a menu and flag it is
 * `requireAccess` (403 without the flag, 402 for a write on an ended
 * plan); with none, only the Session, and the handler checks the flags
 * (own vs `view_all`, `approve` or `reject`).
 */
export async function leaveAccess(
  request: Request,
  gate?: { menu: MenuKey; flag: Flag },
): Promise<AccessSession | Response> {
  if (gate != null) return requireAccess(request, gate.menu, gate.flag);
  const session = await requireCompanySession(request);
  if (isResponse(session)) return session;
  return { ...session, access: await loadMemberAccess(prisma, session) };
}

/** `{ id }` route params. */
export const ConstructionHrmsLeaveIdParamsModel = z.object({ id: z.uuid() });

/** Compare-and-set body for named operations without other fields. */
export const ConstructionHrmsLeaveExpectedUpdatedAtRequestModel = z.object({
  expectedUpdatedAt: z.iso
    .datetime()
    .describe("The `updatedAt` you loaded; a mismatch is 409."),
});

/** Query `?leaveYear=` ("2026" or "26-27"); the current one when left out. */
export const leaveYearQuery = z
  .string()
  .regex(/^(\d{4}|\d{2}-\d{2})$/)
  .optional()
  .describe(
    'The leave year: "2026" (calendar) or "26-27" (financial), as HRMS Settings say. The current one when left out.',
  );
