import { storedFileResponse } from "@/app/api/_lib/attachments";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { GetConstructionContractsMeasurementPhotoQueryModel } from "../../../measurement-models";
import {
  measurementPhotos,
  photoParams,
  requireMeasurementPhotoSession,
  type MeasurementPhotoContext,
} from "../../../measurement-photo-routes";

export const dynamic = "force-dynamic";

/** Streams one photo (Measurement Book read), never cached; `?download=1` saves it. */
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
    const query = parseOrThrow(
      GetConstructionContractsMeasurementPhotoQueryModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const { photo, object } = await measurementPhotos.read(
      session.access,
      id,
      photoId,
    );
    return storedFileResponse(
      {
        contentType: photo.contentType,
        fileName: photo.fileName,
        viewable: true,
      },
      object,
      query.download === "1",
    );
  } catch (error) {
    return mapError(error);
  }
}
