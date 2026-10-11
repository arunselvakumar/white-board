import { mapError } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { imageResponse } from "@/app/api/_lib/uploads";

import {
  equipmentIdOf,
  equipmentPhotos as photos,
  requireEquipmentAccess,
} from "../../../handlers";

export const dynamic = "force-dynamic";

/** The photo's WebP thumbnail (the photo itself when there is none). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const id = await equipmentIdOf(context);
    const session = await requireEquipmentAccess(request, () => true, {
      write: false,
    });
    if (isResponse(session)) return session;
    return imageResponse(await photos.readThumbnail(session.access, id));
  } catch (error) {
    return mapError(error);
  }
}
