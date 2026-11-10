import type { ApiCall } from "../../../.storybook/mocks/api";
import type {
  SiteWorkDocumentFile,
  SiteWorkRemark,
} from "@/src/queries/site-work-documents";
import type { SiteWorkDocumentType } from "@/src/site-work/domain/site-work-documents";

/**
 * Story fixtures for the site-work documents' thread and files (M6).
 * Other site-work stories compose the handler into their own `mockApi`:
 *
 * ```ts
 * const documents = mockSiteWorkDocumentApi();
 * mockApi((call) => documents(call) ?? worksheetsHandler(call));
 * ```
 */

export const SITE_WORK_DOCUMENTS_API = "/api/construction/site-work/documents";

export const SITE_WORK_SAMPLE_DOCUMENT = {
  type: "worksheet" as SiteWorkDocumentType,
  id: "0199c4a0-0000-7000-8000-0000000a0001",
};

const HOUR = 3_600_000;

function ago(hours: number): string {
  return new Date(Date.now() - hours * HOUR).toISOString();
}

function fileUrl(type: string, id: string, fileId: string): string {
  return `${SITE_WORK_DOCUMENTS_API}/${type}/${id}/files/${fileId}`;
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

/**
 * A tiny inline picture, so tiles show an image in stories without a
 * server: a solid colour square as an SVG data URL.
 */
export function swatch(color: string): string {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="${color}"/></svg>`,
  )}`;
}

/** A saved file of a document (the sample worksheet unless given). */
export function siteWorkFile(
  fileName: string,
  extra: Partial<SiteWorkDocumentFile> = {},
  document = SITE_WORK_SAMPLE_DOCUMENT,
): SiteWorkDocumentFile {
  const id = extra.id ?? idOf("f");
  return {
    id,
    remarkId: null,
    fileName,
    contentType: contentTypeOf(fileName),
    bytes: 1_240_000,
    viewable: true,
    url: fileUrl(document.type, document.id, id),
    thumbUrl: null,
    createdAt: ago(5),
    createdBy: "user-karthik",
    createdByName: "Karthik R",
    canRemove: true,
    ...extra,
  };
}

/** A worksheet's thread: the engineer's note, the supervisor's reply with a photo. */
export const SITE_WORK_REMARKS: SiteWorkRemark[] = [
  {
    id: "0199c4a0-0000-7000-8000-0000000a1001",
    body: "Column C4 shuttering checked. Casting after lunch.",
    createdAt: ago(6),
    createdBy: "user-owner",
    createdByName: "Arun Selva Kumar",
    files: [],
  },
  {
    id: "0199c4a0-0000-7000-8000-0000000a1002",
    body: "Cast at 3 pm. Curing started.",
    createdAt: ago(2),
    createdBy: "user-karthik",
    createdByName: "Karthik R",
    files: [
      siteWorkFile("Curing C4.jpg", {
        id: "0199c4a0-0000-7000-8000-0000000a2001",
        remarkId: "0199c4a0-0000-7000-8000-0000000a1002",
        thumbUrl: swatch("#94a3b8"),
        createdAt: ago(2),
      }),
    ],
  },
];

/** The sample worksheet's own photos (the second is someone else's). */
export const SITE_WORK_FILES: SiteWorkDocumentFile[] = [
  siteWorkFile("Column C4 before.jpg", {
    id: "0199c4a0-0000-7000-8000-0000000a3001",
    thumbUrl: swatch("#a8a29e"),
  }),
  siteWorkFile("Column C4 after.jpg", {
    id: "0199c4a0-0000-7000-8000-0000000a3002",
    thumbUrl: swatch("#78716c"),
    createdBy: "user-owner",
    createdByName: "Arun Selva Kumar",
    canRemove: false,
  }),
];

export type SiteWorkDocumentApiOptions = {
  remarks?: SiteWorkRemark[];
  /** Files on the document; the remarks' files are added from `remarks`. */
  files?: SiteWorkDocumentFile[];
  canComment?: boolean;
  canAttach?: boolean;
  canUpload?: boolean;
  /** Who posts: the name a new remark or file is shown with. */
  me?: { userId: string; name: string };
  /** Refuses posting a remark with this error. */
  postError?: { status: number; code: string; message: string };
};

const PATH =
  /^\/api\/construction\/site-work\/documents\/([a-z_]+)\/([^/?]+)\/(remarks|files)(\/[^?]*)?(\?.*)?$/;

/**
 * A stateful answerer of every site-work document's thread and files for
 * one story: posting adds a remark (with its files), an upload is started
 * on the `app` path and completed into the list, removing drops a file.
 * Every document id gets the same data. Returns undefined for other calls,
 * so it composes with an area's own handler. Pair it with
 * `mockXhrUploads()` (`.storybook/mocks/xhr.ts`) when a story uploads.
 */
export function mockSiteWorkDocumentApi(
  options: SiteWorkDocumentApiOptions = {},
): (call: ApiCall) => Response | undefined {
  let remarks = [...(options.remarks ?? SITE_WORK_REMARKS)];
  let files = [
    ...(options.files ?? SITE_WORK_FILES),
    ...remarks.flatMap((remark) => remark.files),
  ];
  const started = new Map<string, { fileName: string; bytes: number }>();
  const me = options.me ?? { userId: "user-karthik", name: "Karthik R" };
  return (call) => {
    const match = PATH.exec(call.path);
    if (match == null) return undefined;
    const [, type = "", id = "", area, rest = ""] = match;
    const base = `${SITE_WORK_DOCUMENTS_API}/${type}/${id}`;
    if (area === "remarks") {
      if (call.method === "GET")
        return Response.json({
          items: remarks,
          canComment: options.canComment ?? true,
          canAttach: options.canAttach ?? true,
        });
      if (call.method === "POST") {
        if (options.postError != null)
          return Response.json(
            {
              code: options.postError.code,
              message: options.postError.message,
            },
            { status: options.postError.status },
          );
        const body = call.body as { body: string; fileIds?: string[] };
        const remarkId = idOf("e");
        const attached = files
          .filter((file) => body.fileIds?.includes(file.id))
          .map((file) => ({ ...file, remarkId }));
        files = files.map(
          (file) => attached.find((other) => other.id === file.id) ?? file,
        );
        const remark: SiteWorkRemark = {
          id: remarkId,
          body: body.body.trim(),
          createdAt: new Date().toISOString(),
          createdBy: me.userId,
          createdByName: me.name,
          files: attached,
        };
        remarks = [...remarks, remark];
        return Response.json(remark, { status: 201 });
      }
      return undefined;
    }
    if (rest === "" && call.method === "GET")
      return Response.json({
        items: files,
        totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
        canUpload: options.canUpload ?? true,
      });
    if (rest === "/uploads" && call.method === "POST") {
      const body = call.body as { fileName: string; bytes: number };
      const key = `companies/w1/site-work-documents/${id}/${idOf("a")}.bin`;
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
      const added = siteWorkFile(
        body.fileName,
        {
          bytes: started.get(body.key)?.bytes ?? 0,
          createdAt: new Date().toISOString(),
          createdBy: me.userId,
          createdByName: me.name,
        },
        { type: type as SiteWorkDocumentType, id },
      );
      files = [...files, added];
      return Response.json(added, { status: 201 });
    }
    const removed = /^\/([^/]+)\/delete$/.exec(rest);
    if (removed != null && call.method === "POST") {
      files = files.filter((file) => file.id !== removed[1]);
      remarks = remarks.map((remark) => ({
        ...remark,
        files: remark.files.filter((file) => file.id !== removed[1]),
      }));
      return new Response(null, { status: 204 });
    }
    return undefined;
  };
}
