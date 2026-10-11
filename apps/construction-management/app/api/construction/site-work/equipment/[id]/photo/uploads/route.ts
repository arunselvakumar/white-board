import { StatusCodes } from "http-status-codes";

import { startUploadResponse } from "@/app/api/_lib/attachments";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  equipmentPhotoPath,
  StartConstructionSiteWorkEquipmentPhotoUploadRequestModel,
} from "../../../equipment-models";
import {
  equipmentIdOf,
  equipmentPhotos as photos,
  requireEquipmentAccess,
} from "../../../handlers";

export const dynamic = "force-dynamic";

/**
 * Starts a photo upload: a PNG, JPEG or WebP image, at most 5 MB. Answers
 * where the bytes and the thumbnail go; finish on `…/photo`.
 */
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
    const body = parseOrThrow(
      StartConstructionSiteWorkEquipmentPhotoUploadRequestModel.safeParse(
        await request.json(),
      ),
    );
    const started = await photos.start(session.access, id, body);
    return Response.json(
      startUploadResponse(started, `${equipmentPhotoPath(id)}/uploads`),
      { status: StatusCodes.CREATED },
    );
  } catch (error) {
    return mapError(error);
  }
}
