import type { ApiCall } from "../../../.storybook/mocks/api";
import type { TrackingDocumentFile } from "@/src/queries/tracking-documents";
import type { TrackingDocumentType } from "@/src/tracking/domain/tracking-documents";

/**
 * Story fixtures for the tracking document files (M8). Feature stories
 * compose the handler into their own `mockApi`:
 *
 * ```ts
 * const files = mockTrackingDocumentApi({ files: [] });
 * mockApi((call) => files(call) ?? issuesHandler(call));
 * ```
 */

export const TRACKING_DOCUMENTS_API = "/api/construction/tracking/documents";

export const TRACKING_SAMPLE_DOCUMENT = {
  type: "issue" as TrackingDocumentType,
  id: "0199c4a0-0000-7000-8000-0000000c0001",
};

const HOUR = 3_600_000;

function ago(hours: number): string {
  return new Date(Date.now() - hours * HOUR).toISOString();
}

let nextId = 0;

function idOf(prefix: string): string {
  nextId += 1;
  return `0199c4a0-0000-7000-8000-${prefix}${String(nextId).padStart(12 - prefix.length, "0")}`;
}

function contentTypeOf(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

/** A solid colour square as an SVG data URL, so tiles show an image. */
export function trackingSwatch(color: string): string {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="${color}"/></svg>`,
  )}`;
}

/** A saved file of a document (the sample issue unless given). */
export function trackingFile(
  fileName: string,
  extra: Partial<TrackingDocumentFile> = {},
  document = TRACKING_SAMPLE_DOCUMENT,
): TrackingDocumentFile {
  const id = extra.id ?? idOf("f");
  const url = `${TRACKING_DOCUMENTS_API}/${document.type}/${document.id}/files/${id}`;
  return {
    id,
    entryId: null,
    fileName,
    contentType: contentTypeOf(fileName),
    bytes: 1_240_000,
    viewable: true,
    url,
    thumbUrl: null,
    createdAt: ago(5),
    createdBy: "user-karthik",
    createdByName: "Karthik R",
    canRemove: true,
    ...extra,
  };
}

/** The sample issue's files: a photo, a PDF, someone else's photo, an update's. */
export const TRACKING_FILES: TrackingDocumentFile[] = [
  trackingFile("Crack near column C4.jpg", {
    id: "0199c4a0-0000-7000-8000-0000000c3001",
    thumbUrl: trackingSwatch("#a8a29e"),
  }),
  trackingFile("Structural note.pdf", {
    id: "0199c4a0-0000-7000-8000-0000000c3002",
    bytes: 240_000,
  }),
  trackingFile("Wall east.jpg", {
    id: "0199c4a0-0000-7000-8000-0000000c3003",
    thumbUrl: trackingSwatch("#78716c"),
    createdBy: "user-owner",
    createdByName: "Arun Selva Kumar",
    canRemove: false,
  }),
  trackingFile("Patch done.jpg", {
    id: "0199c4a0-0000-7000-8000-0000000c3004",
    entryId: "0199c4a0-0000-7000-8000-0000000c4001",
    thumbUrl: trackingSwatch("#94a3b8"),
  }),
];

export type TrackingDocumentApiOptions = {
  files?: TrackingDocumentFile[];
  canUpload?: boolean;
  /** Who uploads: the name a new file is shown with. */
  me?: { userId: string; name: string };
};

const PATH =
  /^\/api\/construction\/tracking\/documents\/([a-z_]+)\/([^/?]+)\/files(\/[^?]*)?(\?.*)?$/;

/**
 * A stateful answerer of every tracking document's files for one story: an
 * upload is started on the `app` path and completed into the list,
 * removing drops a file. Every document id gets the same data. Returns
 * undefined for other calls, so it composes with a feature's own handler.
 * Pair it with `mockXhrUploads()` (`.storybook/mocks/xhr.ts`) when a story
 * uploads.
 */
export function mockTrackingDocumentApi(
  options: TrackingDocumentApiOptions = {},
): (call: ApiCall) => Response | undefined {
  let files = [...(options.files ?? TRACKING_FILES)];
  const started = new Map<string, { fileName: string; bytes: number }>();
  const me = options.me ?? { userId: "user-karthik", name: "Karthik R" };
  return (call) => {
    const match = PATH.exec(call.path);
    if (match == null) return undefined;
    const [, type = "", id = "", rest = ""] = match;
    const base = `${TRACKING_DOCUMENTS_API}/${type}/${id}`;
    if (rest === "" && call.method === "GET")
      return Response.json({
        items: files,
        totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
        canUpload: options.canUpload ?? true,
      });
    if (rest === "/uploads" && call.method === "POST") {
      const body = call.body as { fileName: string; bytes: number };
      const key = `companies/w1/tracking-documents/${id}/${idOf("a")}.bin`;
      started.set(key, body);
      const encoded = encodeURIComponent(key);
      return Response.json(
        {
          key,
          fileName: body.fileName,
          upload: {
            via: "app",
            url: `${base}/files/uploads/app?key=${encoded}`,
          },
          thumbnailUrl: `${base}/files/uploads/thumbnail?key=${encoded}`,
        },
        { status: 201 },
      );
    }
    if (rest === "/uploads/thumbnail" && call.method === "POST")
      return new Response(null, { status: 204 });
    if (rest === "" && call.method === "POST") {
      const body = call.body as { key: string; fileName: string };
      const added = trackingFile(
        body.fileName,
        {
          bytes: started.get(body.key)?.bytes ?? 0,
          createdAt: new Date().toISOString(),
          createdBy: me.userId,
          createdByName: me.name,
        },
        { type: type as TrackingDocumentType, id },
      );
      files = [...files, added];
      return Response.json(added, { status: 201 });
    }
    const removed = /^\/([^/]+)\/delete$/.exec(rest);
    if (removed != null && call.method === "POST") {
      files = files.filter((file) => file.id !== removed[1]);
      return new Response(null, { status: 204 });
    }
    return undefined;
  };
}
