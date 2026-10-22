import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  AddConstructionContractsMeasurementPhotoRequestModel,
  toMeasurementPhotoResponse,
  type ListConstructionContractsMeasurementPhotosResponseModel,
} from "../../measurement-models";
import {
  measurementPhotos,
  requireMeasurementPhotoSession,
  sheetParams,
  type MeasurementSheetContext,
} from "../../measurement-photo-routes";

export const dynamic = "force-dynamic";

/** A sheet's live photos, oldest first (Measurement Book read). */
export async function GET(
  request: Request,
  context: MeasurementSheetContext,
): Promise<Response> {
  try {
    const session = await requireMeasurementPhotoSession(request, {
      write: false,
    });
    if (isResponse(session)) return session;
    const { id } = await sheetParams(context);
    const { photos, canUpload } = await measurementPhotos.list(
      session.access,
      id,
    );
    const body: ListConstructionContractsMeasurementPhotosResponseModel = {
      items: photos.map(toMeasurementPhotoResponse),
      canUpload,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Finishes a photo upload (step 3): records the image now at `key`. 201
 * for a new photo, 200 for a retry. Never joins the Gallery.
 */
export async function POST(
  request: Request,
  context: MeasurementSheetContext,
): Promise<Response> {
  try {
    const session = await requireMeasurementPhotoSession(request, {
      write: true,
    });
    if (isResponse(session)) return session;
    const { id } = await sheetParams(context);
    await measurementPhotos.assertCanUpload(session.access, id);
    const body = parseOrThrow(
      AddConstructionContractsMeasurementPhotoRequestModel.safeParse(
        await request.json(),
      ),
    );
    const { photo, created } = await measurementPhotos.complete({
      viewer: session.access,
      sheetId: id,
      key: body.key,
      fileName: body.fileName,
    });
    return Response.json(toMeasurementPhotoResponse(photo), {
      status: created ? StatusCodes.CREATED : StatusCodes.OK,
    });
  } catch (error) {
    return mapError(error);
  }
}
