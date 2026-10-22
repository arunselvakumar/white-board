import { StatusCodes } from "http-status-codes";

import { mapError } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  measurementPhotos,
  photoParams,
  requireMeasurementPhotoSession,
  type MeasurementPhotoContext,
} from "../../../../measurement-photo-routes";

export const dynamic = "force-dynamic";

/**
 * Removes a photo: Update removes any, Create the uploader's own. 409
 * MEASUREMENT_BILLED once a bill took a row.
 */
export async function POST(
  request: Request,
  context: MeasurementPhotoContext,
): Promise<Response> {
  try {
    const session = await requireMeasurementPhotoSession(request, {
      write: true,
    });
    if (isResponse(session)) return session;
    const { id, photoId } = await photoParams(context);
    await measurementPhotos.remove({
      viewer: session.access,
      sheetId: id,
      photoId,
    });
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
