import { mapError } from "@/app/api/_lib/map-error";
import { requireFamilySession } from "@/app/api/_lib/require-family-session";
import { createFamilyHomeHandler } from "@/src/training-institute/infrastructure/create-family-home-handlers";

import type { GetTrainingInstituteFamilyHomeResponseModel } from "./get-family-home-response-model";

export const dynamic = "force-dynamic";

const handler = createFamilyHomeHandler();

export async function GET(): Promise<Response> {
  try {
    const session = await requireFamilySession();
    if (session instanceof Response) return session;
    const home: GetTrainingInstituteFamilyHomeResponseModel =
      await handler.execute({
        workspaceId: session.workspaceId,
        role: session.role,
        verifiedEmails: session.verifiedEmails,
      });
    return Response.json(home);
  } catch (error) {
    return mapError(error);
  }
}
