import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { createClassWorkHandlers } from "@/src/training-institute/infrastructure/create-class-work-handlers";

import { TrainingInstituteClassWorkIdParamsModel } from "../../homework/class-work-models";
import {
  type IdContext,
  requireClassWorkMember,
} from "../../homework/class-work-session";

export const dynamic = "force-dynamic";

const handlers = createClassWorkHandlers();

/** RFC 6266 filename: an ASCII fallback plus the UTF-8 name. */
function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Downloads a file the User can see (ADR-0033). */
export async function GET(
  _request: Request,
  context: IdContext,
): Promise<Response> {
  try {
    const member = await requireClassWorkMember();
    if (member instanceof Response) return member;
    const { id } = parseOrThrow(
      TrainingInstituteClassWorkIdParamsModel.safeParse(await context.params),
    );
    const file = await handlers.download(member, id);
    return new Response(Buffer.from(file.bytes), {
      headers: {
        "content-type": file.mimeType,
        "content-disposition": contentDisposition(file.name),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
