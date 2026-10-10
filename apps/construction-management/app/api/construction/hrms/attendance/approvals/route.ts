import { mapError } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { toApprovalsResponse } from "../attendance-models";
import { attendance } from "../handlers";
import { requireApprover } from "./require-approver";

export const dynamic = "force-dynamic";

/** Attendance Approvals: pending entries, oldest first (CM-309). */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireApprover(request);
    if (isResponse(session)) return session;
    const list = await attendance.approvals({ access: session.access });
    return Response.json(toApprovalsResponse(list));
  } catch (error) {
    return mapError(error);
  }
}
