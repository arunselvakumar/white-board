import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import {
  decodeListCursor,
  encodeListCursor,
} from "@/src/shared-kernel/list-cursor";

import { ConstructionProjectsProjectParamsModel } from "../../project-models";
import {
  ListConstructionProjectsGalleryQueryModel,
  type ListConstructionProjectsGalleryResponseModel,
} from "./gallery-models";
import { readableSources, toGalleryItemResponse } from "./gallery-responses";
import { projectGallery } from "./handlers";

export const dynamic = "force-dynamic";

/**
 * The Project's Gallery (CM-410): every image and PDF from the sources the
 * member may read, newest first, filtered by type, source, uploader, upload
 * day and file name, with cursors both ways and the total. Each item links
 * to its source's own file route.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.gallery", "read");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionProjectsProjectParamsModel.safeParse(await context.params),
    );
    const query = parseOrThrow(
      ListConstructionProjectsGalleryQueryModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const page = await projectGallery.list({
      viewer: session.access,
      projectId: id,
      sources: readableSources(session.access, id),
      filter: {
        ...(query.type == null ? {} : { type: query.type }),
        ...(query.source == null ? {} : { source: query.source }),
        ...(query.uploadedBy == null ? {} : { uploadedBy: query.uploadedBy }),
        ...(query.from == null ? {} : { from: query.from }),
        ...(query.to == null ? {} : { to: query.to }),
        ...(query.q == null || query.q.length === 0 ? {} : { q: query.q }),
      },
      limit: query.limit,
      after: query.after == null ? undefined : decodeListCursor(query.after),
      before: query.before == null ? undefined : decodeListCursor(query.before),
    });
    const cursorOf = (item: { uploadedAt: Date; id: string }) =>
      encodeListCursor({ createdAt: item.uploadedAt, id: item.id });
    const first = page.items[0];
    const last = page.items.at(-1);
    const backwards = query.before != null;
    const moreAfter = backwards || page.hasMore;
    const moreBefore = backwards ? page.hasMore : query.after != null;
    const body: ListConstructionProjectsGalleryResponseModel = {
      items: page.items.flatMap((item) => {
        const response = toGalleryItemResponse(item);
        return response == null ? [] : [response];
      }),
      nextCursor: moreAfter && last != null ? cursorOf(last) : null,
      prevCursor: moreBefore && first != null ? cursorOf(first) : null,
      total: page.total,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
