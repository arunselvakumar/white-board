import type {
  AlbumWithCount,
  DrawingDetailView,
  DrawingRevisionView,
  DrawingView,
} from "@/src/projects/application/project-drawings";
import type { DrawingAlbum } from "@/src/projects/domain/drawing";

import type {
  ConstructionProjectsDrawingAlbumResponseModel,
  ConstructionProjectsDrawingResponseModel,
  ConstructionProjectsDrawingRevisionResponseModel,
  GetConstructionProjectsDrawingResponseModel,
} from "./drawing-models";

/** `/api/construction/projects/projects/{id}/drawings`: every URL starts here. */
export function drawingsPath(projectId: string): string {
  return `/api/construction/projects/projects/${projectId}/drawings`;
}

/** A revision's file route; the Gallery links here too. */
export function revisionFilePath(
  projectId: string,
  drawingId: string,
  revisionId: string,
): string {
  return `${drawingsPath(projectId)}/${drawingId}/revisions/${revisionId}/file`;
}

export function revisionThumbnailPath(
  projectId: string,
  drawingId: string,
  revisionId: string,
): string {
  return `${drawingsPath(projectId)}/${drawingId}/revisions/${revisionId}/thumbnail`;
}

export function toAlbumResponse(
  album: DrawingAlbum,
  drawingCount: number,
): ConstructionProjectsDrawingAlbumResponseModel {
  return {
    id: album.id,
    name: album.name,
    isSeed: album.isSeed,
    drawingCount,
    updatedAt: album.updatedAt.toISOString(),
  };
}

export function toAlbumListItem(
  album: AlbumWithCount,
): ConstructionProjectsDrawingAlbumResponseModel {
  return toAlbumResponse(album, album.drawingCount);
}

export function toRevisionResponse(
  projectId: string,
  revision: DrawingRevisionView,
): ConstructionProjectsDrawingRevisionResponseModel {
  return {
    id: revision.id,
    revision: revision.revision,
    label: revision.label,
    fileName: revision.fileName,
    contentType: revision.contentType,
    bytes: revision.bytes,
    viewable: revision.viewable,
    url: revisionFilePath(projectId, revision.drawingId, revision.id),
    thumbUrl:
      revision.thumbKey == null
        ? null
        : revisionThumbnailPath(projectId, revision.drawingId, revision.id),
    createdAt: revision.createdAt.toISOString(),
    createdBy: revision.createdBy,
    createdByName: revision.createdByName,
  };
}

export function toDrawingResponse(
  drawing: DrawingView,
): ConstructionProjectsDrawingResponseModel {
  return {
    id: drawing.id,
    albumId: drawing.albumId,
    name: drawing.name,
    revisionCount: drawing.revisionCount,
    latest: toRevisionResponse(drawing.projectId, drawing.latest),
    createdAt: drawing.createdAt.toISOString(),
    updatedAt: drawing.updatedAt.toISOString(),
  };
}

export function toDrawingDetailResponse(
  drawing: DrawingDetailView,
): GetConstructionProjectsDrawingResponseModel {
  return {
    id: drawing.id,
    albumId: drawing.albumId,
    albumName: drawing.albumName,
    name: drawing.name,
    revisions: drawing.revisions.map((revision) =>
      toRevisionResponse(drawing.projectId, revision),
    ),
    createdAt: drawing.createdAt.toISOString(),
    updatedAt: drawing.updatedAt.toISOString(),
  };
}
