import { mapError } from "@/app/api/_lib/map-error";
import {
  classActor,
  type ClassRouteContext,
} from "@/app/api/training-institute/classes/class-route";
import { signedClassRecordingUrl } from "@/src/training-institute/infrastructure/class-recording-download";
import { createClassService } from "@/src/training-institute/infrastructure/create-class-service";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: ClassRouteContext,
): Promise<Response> {
  try {
    const result = await classActor(context);
    if (result instanceof Response) return result;
    const key = await createClassService().recordingObjectKey(result.actor);
    return Response.redirect(await signedClassRecordingUrl(key), 302);
  } catch (error) {
    return mapError(error);
  }
}
