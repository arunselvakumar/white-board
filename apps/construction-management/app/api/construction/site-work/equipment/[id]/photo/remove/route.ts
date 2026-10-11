import { mapError } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  detailResponse,
  equipmentIdOf,
  equipmentPhotos as photos,
  requireEquipmentAccess,
} from "../../../handlers";

export const dynamic = "force-dynamic";

/** Removes the photo; fine when there is none. Answers the equipment. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const id = await equipmentIdOf(context);
    const session = await requireEquipmentAccess(request, () => true, {
      write: true,
    });
    if (isResponse(session)) return session;
    await photos.remove(session.access, id);
    return await detailResponse(session.access, id);
  } catch (error) {
    return mapError(error);
  }
}
