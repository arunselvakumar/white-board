import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { imageResponse, readUpload } from "@/app/api/_lib/uploads";
import { createCompanyProfileHandlers } from "@/src/organization/infrastructure/create-company-profile-handlers";
import { IMAGE_LIMITS } from "@/src/shared-kernel/files";

import { companyProfileBody } from "../company-profile-body";

export const dynamic = "force-dynamic";

const handlers = createCompanyProfileHandlers();

/**
 * The Active Company's logo, streamed from storage. Any Team Member may see
 * it (it prints on their documents); there is no public URL.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    return imageResponse(await handlers.logo(session.workspaceId));
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Sets or replaces the logo (`organization.settings` update). The body is
 * the image itself with its `content-type`: PNG, JPEG or WebP, at most 2 MB.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "organization.settings",
      "update",
    );
    if (isResponse(session)) return session;
    const upload = await readUpload(request, IMAGE_LIMITS.company_logo);
    const profile = await handlers.setLogo({
      workspaceId: session.workspaceId,
      by: session.userId,
      bytes: upload.bytes,
      contentType: upload.contentType,
    });
    return Response.json(companyProfileBody(profile, session.access));
  } catch (error) {
    return mapError(error);
  }
}
