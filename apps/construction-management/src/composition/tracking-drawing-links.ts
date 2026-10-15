import type {
  TrackingDrawingLink,
  TrackingDrawingLinks,
} from "@/src/tracking/application/ports";

/**
 * Where an Inspection Request's linked drawings open (CM-804): the
 * drawing's album page in Project Drawings. Reads the projects context's
 * tables so tracking never imports it.
 */
export const trackingDrawingLinks: TrackingDrawingLinks = async (
  db,
  workspaceId,
  drawingIds,
) => {
  const ids = [...new Set(drawingIds)];
  if (ids.length === 0) return new Map();
  const rows = await db.constructionProjectsDrawing.findMany({
    where: { workspaceId, id: { in: ids }, deletedAt: null },
    select: {
      id: true,
      name: true,
      albumId: true,
      album: { select: { name: true } },
      revisions: {
        where: { deletedAt: null },
        orderBy: { revision: "desc" },
        take: 1,
        select: { revision: true },
      },
    },
  });
  return new Map(
    rows.map((row): [string, TrackingDrawingLink] => [
      row.id,
      {
        id: row.id,
        name: row.name,
        albumId: row.albumId,
        albumName: row.album.name,
        revision: row.revisions[0]?.revision ?? null,
      },
    ]),
  );
};
