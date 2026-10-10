import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  AddConstructionHrmsMissedCheckoutRequestModel,
  toEntryResponse,
} from "../attendance-models";
import { attendance } from "../handlers";

export const dynamic = "force-dynamic";

/** Add Missed Checkout for an entry left open on an earlier day; it goes to approvals (CM-308). */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "hrms.attendance", "create");
    if (isResponse(session)) return session;
    const { expectedUpdatedAt, ...model } = parseOrThrow(
      AddConstructionHrmsMissedCheckoutRequestModel.safeParse(
        await request.json(),
      ),
    );
    const entry = await attendance.addMissedCheckout({
      access: session.access,
      ...model,
      expectedUpdatedAt: new Date(expectedUpdatedAt),
    });
    return Response.json(toEntryResponse(entry));
  } catch (error) {
    return mapError(error);
  }
}
