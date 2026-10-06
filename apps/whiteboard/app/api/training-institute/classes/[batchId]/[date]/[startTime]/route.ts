import { mapError } from "@/app/api/_lib/map-error";
import {
  classActor,
  type ClassRouteContext,
} from "@/app/api/training-institute/classes/class-route";
import { createClassService } from "@/src/training-institute/infrastructure/create-class-service";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: ClassRouteContext,
): Promise<Response> {
  try {
    const result = await classActor(context);
    if (result instanceof Response) return result;
    return Response.json(await createClassService().get(result.actor));
  } catch (error) {
    return mapError(error);
  }
}
