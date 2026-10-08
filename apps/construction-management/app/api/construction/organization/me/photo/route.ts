import { mapError } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { imageResponse, readUpload } from "@/app/api/_lib/uploads";
import { createMyProfileHandlers } from "@/src/organization/infrastructure/create-my-profile-handlers";
import { IMAGE_LIMITS } from "@/src/shared-kernel/files";

import { myProfileBody } from "../profile/my-profile-body";

export const dynamic = "force-dynamic";

const handlers = createMyProfileHandlers();

/** The caller's own photo, streamed from storage. */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    return imageResponse(
      await handlers.photo(session.workspaceId, session.userId),
    );
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Sets or replaces the caller's photo. The body is the image itself with
 * its `content-type`: PNG, JPEG or WebP, at most 10 MB.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    const upload = await readUpload(request, IMAGE_LIMITS.member_photo);
    const profile = await handlers.setPhoto({
      workspaceId: session.workspaceId,
      userId: session.userId,
      bytes: upload.bytes,
      contentType: upload.contentType,
    });
    return Response.json(myProfileBody(profile));
  } catch (error) {
    return mapError(error);
  }
}
