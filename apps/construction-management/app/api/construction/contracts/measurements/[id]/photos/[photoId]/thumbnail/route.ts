import { thumbnailResponse } from "@/app/api/_lib/attachments";
import { mapError } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  measurementPhotos,
  photoParams,
  requireMeasurementPhotoSession,
  type MeasurementPhotoContext,
} from "../../../../measurement-photo-routes";

export const dynamic = "force-dynamic";

/** A photo's WebP thumbnail; 404 `THUMBNAIL_NOT_FOUND` without one. */
export async function GET(
  request: Request,
  context: MeasurementPhotoContext,
): Promise<Response> {
  try {
    const session = await requireMeasurementPhotoSession(request, {
      write: false,
    });
    if (isResponse(session)) return session;
    const { id, photoId } = await photoParams(context);
    return thumbnailResponse(
      await measurementPhotos.readThumbnail(session.access, id, photoId),
    );
  } catch (error) {
    return mapError(error);
  }
}
