import { StatusCodes } from "http-status-codes";

import { UploadKeyQueryModel } from "@/app/api/_lib/attachments";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { readUpload } from "@/app/api/_lib/uploads";
import { EQUIPMENT_PHOTO_MAX_BYTES } from "@/src/site-work/application/equipment-photos";

import {
  equipmentIdOf,
  equipmentPhotos as photos,
  requireEquipmentAccess,
} from "../../../../handlers";

export const dynamic = "force-dynamic";

/** Development and tests: the raw image at `?key=` (404 when deployed). */
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
    const { key } = parseOrThrow(
      UploadKeyQueryModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const upload = await readUpload(request, EQUIPMENT_PHOTO_MAX_BYTES);
    await photos.receive(session.access, id, { key, bytes: upload.bytes });
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
