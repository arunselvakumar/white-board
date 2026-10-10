import { prisma } from "@repo/construction-db";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";

import { projectHome } from "../../handlers";
import { UpdateConstructionProjectsTileOrderRequestModel } from "../tile-order-models";

export const dynamic = "force-dynamic";

/**
 * Saves the caller's tile order for every Project's home (CM-411). Any
 * Team Member; it changes only their own home.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    const body = parseOrThrow(
      UpdateConstructionProjectsTileOrderRequestModel.safeParse(
        await request.json(),
      ),
    );
    const access = await loadMemberAccess(prisma, session);
    const tileOrder = await projectHome.setTileOrder({
      viewer: access,
      keys: body.tileOrder,
    });
    return Response.json({ tileOrder });
  } catch (error) {
    return mapError(error);
  }
}
