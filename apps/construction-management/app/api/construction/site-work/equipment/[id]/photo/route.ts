import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { imageResponse } from "@/app/api/_lib/uploads";

import { CompleteConstructionSiteWorkEquipmentPhotoRequestModel } from "../../equipment-models";
import {
  detailResponse,
  equipmentIdOf,
  equipmentPhotos as photos,
  requireEquipmentAccess,
} from "../../handlers";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * The equipment photo, streamed to those who may read the equipment
 * (Equipments Read, or Equipment Usage Read at its Project).
 */
export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  try {
    const id = await equipmentIdOf(context);
    const session = await requireEquipmentAccess(request, () => true, {
      write: false,
    });
    if (isResponse(session)) return session;
    return imageResponse(await photos.read(session.access, id));
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Finishes a photo upload: records the image at `key` as the photo,
 * replacing any earlier one (201 new, 200 when already recorded). Needs
 * Equipments Update, or Equipment Usage Create at its Project.
 */
export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  try {
    const id = await equipmentIdOf(context);
    const session = await requireEquipmentAccess(request, () => true, {
      write: true,
    });
    if (isResponse(session)) return session;
    const body = parseOrThrow(
      CompleteConstructionSiteWorkEquipmentPhotoRequestModel.safeParse(
        await request.json(),
      ),
    );
    const { created } = await photos.complete(session.access, id, body);
    return await detailResponse(
      session.access,
      id,
      created ? StatusCodes.CREATED : StatusCodes.OK,
    );
  } catch (error) {
    return mapError(error);
  }
}
