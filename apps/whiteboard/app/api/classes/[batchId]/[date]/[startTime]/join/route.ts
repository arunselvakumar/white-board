import { mapError } from "@/app/api/_lib/map-error";
import {
  classActor,
  type ClassRouteContext,
} from "@/app/api/classes/class-route";
import { createClassService } from "@/src/training/infrastructure/create-class-service";

export async function POST(
  _request: Request,
  context: ClassRouteContext,
): Promise<Response> {
  try {
    const result = await classActor(context);
    if (result instanceof Response) return result;
    return Response.json(
      await createClassService().join(result.actor, result.name),
    );
  } catch (error) {
    return mapError(error);
  }
}
