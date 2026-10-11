import { StatusCodes } from "http-status-codes";

import { UploadKeyQueryModel } from "@/app/api/_lib/attachments";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { readUpload } from "@/app/api/_lib/uploads";
import { THUMBNAIL_MAX_BYTES } from "@/src/shared-kernel/attachments";

import {
  equipmentIdOf,
  equipmentPhotos as photos,
  requireEquipmentAccess,
} from "../../../../handlers";

export const dynamic = "force-dynamic";

/** The image's WebP thumbnail at `?key=`, before finishing. */
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
    const upload = await readUpload(request, THUMBNAIL_MAX_BYTES);
    await photos.receiveThumbnail(session.access, id, {
      key,
      bytes: upload.bytes,
    });
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
