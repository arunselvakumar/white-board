import { mapError } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  equipmentIdOf,
  equipmentPhotos as photos,
  requireEquipmentAccess,
} from "../../../../handlers";

export const dynamic = "force-dynamic";

/** Deployed: the `uploadPresigned()` handshake for one key (404 with files on disk). */
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
    const body: unknown = await request.json();
    return Response.json(
      await photos.answerDirectUpload(session.access, id, { request, body }),
    );
  } catch (error) {
    return mapError(error);
  }
}
