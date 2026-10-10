import type { GalleryItemView } from "@/src/projects/application/project-gallery";
import {
  MEDIA_SOURCE_MENUS,
  mediaTypeOf,
} from "@/src/projects/domain/media-item";
import { can, type MemberAccess } from "@/src/shared-kernel/access";

import { procurementGalleryRoutes } from "@/app/api/construction/procurement/documents/document-responses";

import { documentsPath } from "../documents/project-document-responses";
import {
  revisionFilePath,
  revisionThumbnailPath,
} from "../drawings/drawing-responses";
import {
  testingReportFilePath,
  testingReportThumbnailPath,
} from "../testing-reports/testing-report-responses";
import type { ConstructionProjectsGalleryItemResponseModel } from "./gallery-models";

/**
 * The sources whose files this member may open on this Project: the Read
 * flag of each source's menu (ADR CM-0014). The Gallery leaves the others
 * out, so it never shows a tile whose file route would refuse.
 */
export function readableSources(
  access: MemberAccess,
  projectId: string,
): string[] {
  return Object.entries(MEDIA_SOURCE_MENUS)
    .filter(([, menu]) => can(access, menu, "read", { projectId }))
    .map(([source]) => source);
}

/** The source's file and thumbnail routes; null when the source has none here. */
function routesOf(
  item: GalleryItemView,
): { file: string; thumbnail: string } | null {
  switch (item.source) {
    case "document": {
      const file = `${documentsPath(item.projectId)}/${item.sourceId}`;
      return { file, thumbnail: `${file}/thumbnail` };
    }
    case "drawing":
      return item.revisionId == null
        ? null
        : {
            file: revisionFilePath(
              item.projectId,
              item.sourceId,
              item.revisionId,
            ),
            thumbnail: revisionThumbnailPath(
              item.projectId,
              item.sourceId,
              item.revisionId,
            ),
          };
    case "testing_report":
      return {
        file: testingReportFilePath(item.projectId, item.sourceId),
        thumbnail: testingReportThumbnailPath(item.projectId, item.sourceId),
      };
    default:
      // Procurement documents' files (M5) are served by their own routes.
      return procurementGalleryRoutes(item);
  }
}

export function toGalleryItemResponse(
  item: GalleryItemView,
): ConstructionProjectsGalleryItemResponseModel | null {
  const routes = routesOf(item);
  if (routes == null) return null;
  return {
    id: item.id,
    type: mediaTypeOf(item.contentType),
    source: item.source,
    sourceId: item.sourceId,
    fileName: item.fileName,
    contentType: item.contentType,
    bytes: item.bytes,
    fileUrl: routes.file,
    thumbUrl: item.thumbKey == null ? null : routes.thumbnail,
    uploadedBy: item.uploadedBy,
    uploadedByName: item.uploadedByName,
    uploadedAt: item.uploadedAt.toISOString(),
  };
}
