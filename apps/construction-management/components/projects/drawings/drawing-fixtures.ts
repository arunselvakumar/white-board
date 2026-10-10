import type {
  DrawingAlbum,
  DrawingDetail,
  DrawingRevision,
  DrawingSummary,
} from "@/src/queries/project-drawings";

import { mockApi } from "../../../.storybook/mocks/api";
import { ANUGRAHA } from "../project-fixtures";

/** Story fixtures for Project Drawings (CM-408), on Anugraha Residency. */
export { ANUGRAHA };

export const DRAWINGS_API = `/api/construction/projects/projects/${ANUGRAHA.id}/drawings`;

const MB = 1024 * 1024;

export const ALBUM_IDS = {
  architect: "0199c4a0-0000-7000-8000-00000000a101",
  electrical: "0199c4a0-0000-7000-8000-00000000a102",
  plumbing: "0199c4a0-0000-7000-8000-00000000a103",
  structural: "0199c4a0-0000-7000-8000-00000000a104",
} as const;

export const DRAWING_IDS = {
  gfPlan: "0199c4a0-0000-7000-8000-00000000d201",
  elevation: "0199c4a0-0000-7000-8000-00000000d202",
  sitePlan: "0199c4a0-0000-7000-8000-00000000d203",
  lighting: "0199c4a0-0000-7000-8000-00000000d204",
  columns: "0199c4a0-0000-7000-8000-00000000d205",
  footings: "0199c4a0-0000-7000-8000-00000000d206",
} as const;

const SEEDED_AT = "2026-03-01T04:30:00.000Z";

function album(id: string, name: string, isSeed = true): StoredAlbum {
  return { id, name, isSeed, updatedAt: SEEDED_AT };
}

type StoredAlbum = Omit<DrawingAlbum, "drawingCount">;

type StoredDrawing = {
  id: string;
  albumId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** Newest first. */
  revisions: DrawingRevision[];
};

function contentTypeOf(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

let made = 0;

export function revision(
  drawingId: string,
  number: number,
  fileName: string,
  bytes: number,
  createdAt: string,
  extra: Partial<DrawingRevision> = {},
): DrawingRevision {
  made += 1;
  const id = `0199c4a0-0000-7000-8000-0000000e${String(made).padStart(4, "0")}`;
  const contentType = contentTypeOf(fileName);
  return {
    id,
    revision: number,
    label: `R${String(number)}`,
    fileName,
    contentType,
    bytes: Math.round(bytes),
    viewable: contentType !== "application/octet-stream",
    url: `${DRAWINGS_API}/${drawingId}/revisions/${id}/file`,
    thumbUrl: null,
    createdAt,
    createdBy: "user-karthik",
    createdByName: "Karthik R",
    ...extra,
  };
}

function seedAlbums(): StoredAlbum[] {
  return [
    album(ALBUM_IDS.architect, "Architect"),
    album(ALBUM_IDS.electrical, "Electrical"),
    album(ALBUM_IDS.plumbing, "Plumbing"),
    album(ALBUM_IDS.structural, "Structural Drawing"),
  ];
}

function seedDrawings(): StoredDrawing[] {
  const { gfPlan, elevation, sitePlan, lighting, columns, footings } =
    DRAWING_IDS;
  return [
    {
      id: gfPlan,
      albumId: ALBUM_IDS.architect,
      name: "GF Plan",
      createdAt: "2026-03-04T06:00:00.000Z",
      updatedAt: "2026-04-18T09:15:00.000Z",
      revisions: [
        revision(gfPlan, 3, "GF Plan R3.pdf", 2.4 * MB, "2026-04-18T09:15:00Z"),
        revision(
          gfPlan,
          2,
          "GF Plan R2.pdf",
          2.1 * MB,
          "2026-03-20T05:40:00Z",
          {
            createdBy: "user-prabhu",
            createdByName: "Prabhu S",
          },
        ),
        revision(gfPlan, 1, "GF Plan.pdf", 1.9 * MB, "2026-03-04T06:00:00Z"),
      ],
    },
    {
      id: sitePlan,
      albumId: ALBUM_IDS.architect,
      name: "Site plan",
      createdAt: "2026-03-02T07:30:00.000Z",
      updatedAt: "2026-04-02T11:00:00.000Z",
      revisions: [
        revision(
          sitePlan,
          2,
          "Site plan R2.dwg",
          6.2 * MB,
          "2026-04-02T11:00:00Z",
        ),
        revision(
          sitePlan,
          1,
          "Site plan.dwg",
          5.8 * MB,
          "2026-03-02T07:30:00Z",
        ),
      ],
    },
    {
      id: elevation,
      albumId: ALBUM_IDS.architect,
      name: "Front elevation",
      createdAt: "2026-03-10T08:20:00.000Z",
      updatedAt: "2026-03-10T08:20:00.000Z",
      revisions: [
        revision(
          elevation,
          1,
          "Front elevation.jpg",
          0.8 * MB,
          "2026-03-10T08:20:00Z",
          { createdByName: null },
        ),
      ],
    },
    {
      id: lighting,
      albumId: ALBUM_IDS.electrical,
      name: "Lighting layout",
      createdAt: "2026-03-12T10:00:00.000Z",
      updatedAt: "2026-03-12T10:00:00.000Z",
      revisions: [
        revision(
          lighting,
          1,
          "Lighting layout.pdf",
          1.1 * MB,
          "2026-03-12T10:00:00Z",
        ),
      ],
    },
    {
      id: columns,
      albumId: ALBUM_IDS.structural,
      name: "Column layout",
      createdAt: "2026-03-05T06:45:00.000Z",
      updatedAt: "2026-03-25T06:45:00.000Z",
      revisions: [
        revision(
          columns,
          2,
          "Column layout R2.pdf",
          1.6 * MB,
          "2026-03-25T06:45:00Z",
        ),
        revision(
          columns,
          1,
          "Column layout.pdf",
          1.5 * MB,
          "2026-03-05T06:45:00Z",
        ),
      ],
    },
    {
      id: footings,
      albumId: ALBUM_IDS.structural,
      name: "Footing details",
      createdAt: "2026-03-06T06:45:00.000Z",
      updatedAt: "2026-03-06T06:45:00.000Z",
      revisions: [
        revision(
          footings,
          1,
          "Footing details.dxf",
          3.3 * MB,
          "2026-03-06T06:45:00Z",
        ),
      ],
    },
  ];
}

function summary(drawing: StoredDrawing): DrawingSummary {
  const latest = drawing.revisions[0];
  if (latest == null) throw new Error(`${drawing.name} has no revision`);
  return {
    id: drawing.id,
    albumId: drawing.albumId,
    name: drawing.name,
    revisionCount: drawing.revisions.length,
    latest,
    createdAt: drawing.createdAt,
    updatedAt: drawing.updatedAt,
  };
}

function conflict(code: string, message: string): Response {
  return Response.json({ code, message }, { status: 409 });
}

const NOW = "2026-10-09T06:30:00.000Z";

/**
 * A Drawings API that remembers changes for one story: albums are added,
 * renamed and deleted (refused while they hold drawings), drawings
 * uploaded (start answers the `app` path), given new revisions, renamed,
 * moved and deleted. `albums: []` is a Project whose albums were all
 * deleted; `renameError` refuses renaming a drawing.
 */
export function mockDrawingsApi(
  options: {
    albums?: StoredAlbum[];
    drawings?: StoredDrawing[];
    renameError?: { code: string; message: string };
  } = {},
) {
  let albums = options.albums ?? seedAlbums();
  let drawings =
    options.drawings ?? (options.albums == null ? seedDrawings() : []);
  const started = new Map<string, { fileName: string; bytes: number }>();
  let next = 500;
  const nextId = (prefix: string) => {
    next += 1;
    return `0199c4a0-0000-7000-8000-${prefix}${String(next).padStart(12 - prefix.length, "0")}`;
  };

  const albumOut = (stored: StoredAlbum): DrawingAlbum => ({
    ...stored,
    drawingCount: drawings.filter((drawing) => drawing.albumId === stored.id)
      .length,
  });
  const detail = (drawing: StoredDrawing): DrawingDetail => ({
    id: drawing.id,
    albumId: drawing.albumId,
    albumName: albums.find((item) => item.id === drawing.albumId)?.name ?? "",
    name: drawing.name,
    revisions: drawing.revisions,
    createdAt: drawing.createdAt,
    updatedAt: drawing.updatedAt,
  });
  const nameInUse = (name: string, except?: string) =>
    albums.some(
      (item) =>
        item.id !== except && item.name.toLowerCase() === name.toLowerCase(),
    );

  return mockApi((call) => {
    const { method, path } = call;
    if (method === "GET" && path === `${DRAWINGS_API}/albums`)
      return Response.json({
        items: [...albums]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(albumOut),
      });
    if (method === "POST" && path === `${DRAWINGS_API}/albums`) {
      const { name } = call.body as { name: string };
      if (nameInUse(name))
        return conflict(
          "ALBUM_NAME_IN_USE",
          "An album with this name is already on the Project.",
        );
      const added = { id: nextId("a"), name, isSeed: false, updatedAt: NOW };
      albums = [...albums, added];
      return Response.json(albumOut(added), { status: 201 });
    }
    const albumPath = new RegExp(
      `^${DRAWINGS_API}/albums/([^/]+)(/update|/delete)?$`,
    ).exec(path);
    if (albumPath != null) {
      const [, id, verb] = albumPath;
      const stored = albums.find((item) => item.id === id);
      if (stored == null)
        return Response.json(
          { code: "ALBUM_NOT_FOUND", message: "This album was not found." },
          { status: 404 },
        );
      if (method === "GET" && verb == null)
        return Response.json({
          album: albumOut(stored),
          drawings: drawings
            .filter((drawing) => drawing.albumId === id)
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .map(summary),
        });
      if (method === "POST" && verb === "/update") {
        const body = call.body as { name: string; updatedAt: string };
        if (body.updatedAt !== stored.updatedAt)
          return conflict(
            "ALBUM_CHANGED",
            "Someone changed this album since you opened it. Reload and try again.",
          );
        if (nameInUse(body.name, stored.id))
          return conflict(
            "ALBUM_NAME_IN_USE",
            "An album with this name is already on the Project.",
          );
        const renamed = { ...stored, name: body.name, updatedAt: NOW };
        albums = albums.map((item) => (item.id === id ? renamed : item));
        return Response.json(albumOut(renamed));
      }
      if (method === "POST" && verb === "/delete") {
        const count = drawings.filter(
          (drawing) => drawing.albumId === id,
        ).length;
        if (count > 0)
          return Response.json(
            {
              code: "ALBUM_NOT_EMPTY",
              message: "This album has drawings. Move or delete them first.",
              details: { drawings: count },
            },
            { status: 409 },
          );
        albums = albums.filter((item) => item.id !== id);
        return new Response(null, { status: 204 });
      }
    }
    if (method === "POST" && path === `${DRAWINGS_API}/uploads`) {
      const body = call.body as { fileName: string; bytes: number };
      const key = `companies/w1/project-drawings/${ANUGRAHA.id}/${String(next + 1)}.bin`;
      next += 1;
      started.set(key, body);
      return Response.json(
        {
          key,
          fileName: body.fileName,
          upload: {
            via: "app",
            url: `${DRAWINGS_API}/uploads/app?key=${encodeURIComponent(key)}`,
          },
        },
        { status: 201 },
      );
    }
    if (method === "POST" && path === DRAWINGS_API) {
      const body = call.body as {
        key: string;
        fileName: string;
        albumId: string;
        name?: string;
      };
      const id = nextId("d");
      const file = started.get(body.key);
      const added: StoredDrawing = {
        id,
        albumId: body.albumId,
        name:
          body.name != null && body.name.trim().length > 0
            ? body.name.trim()
            : body.fileName.replace(/\.[^.]+$/, ""),
        createdAt: NOW,
        updatedAt: NOW,
        revisions: [revision(id, 1, body.fileName, file?.bytes ?? 0, NOW)],
      };
      drawings = [...drawings, added];
      return Response.json(detail(added), { status: 201 });
    }
    const drawingPath = new RegExp(
      `^${DRAWINGS_API}/([^/]+)(/revisions|/update|/move|/delete)?$`,
    ).exec(path);
    if (drawingPath != null) {
      const [, id, verb] = drawingPath;
      const stored = drawings.find((drawing) => drawing.id === id);
      if (stored == null)
        return Response.json(
          { code: "DRAWING_NOT_FOUND", message: "This drawing was not found." },
          { status: 404 },
        );
      const save = (changed: StoredDrawing) => {
        drawings = drawings.map((drawing) =>
          drawing.id === id ? changed : drawing,
        );
        return Response.json(detail(changed));
      };
      if (method === "GET" && verb == null)
        return Response.json(detail(stored));
      if (method === "POST" && verb === "/revisions") {
        const body = call.body as { key: string; fileName: string };
        const number = (stored.revisions[0]?.revision ?? 0) + 1;
        return save({
          ...stored,
          updatedAt: NOW,
          revisions: [
            revision(
              stored.id,
              number,
              body.fileName,
              started.get(body.key)?.bytes ?? 0,
              NOW,
            ),
            ...stored.revisions,
          ],
        });
      }
      if (method === "POST" && verb === "/update") {
        if (options.renameError != null)
          return conflict(
            options.renameError.code,
            options.renameError.message,
          );
        const body = call.body as { name: string };
        return save({ ...stored, name: body.name, updatedAt: NOW });
      }
      if (method === "POST" && verb === "/move") {
        const body = call.body as { albumId: string };
        return save({ ...stored, albumId: body.albumId, updatedAt: NOW });
      }
      if (method === "POST" && verb === "/delete") {
        drawings = drawings.filter((drawing) => drawing.id !== id);
        return new Response(null, { status: 204 });
      }
    }
    return undefined;
  });
}
