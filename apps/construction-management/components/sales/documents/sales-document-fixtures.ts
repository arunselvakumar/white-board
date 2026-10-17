import type { ApiCall } from "../../../.storybook/mocks/api";
import type { SalesDocumentFile } from "@/src/queries/sales-documents";
import type { SalesFileRole } from "@/src/sales/domain/document-files";

/**
 * Story fixtures for the sales document files (CM-1003). Feature stories
 * compose the handler into their own `mockApi`:
 *
 * ```ts
 * const files = mockSalesDocumentApi({ files: [] });
 * mockApi((call) => files(call) ?? inquiryHandler(call));
 * ```
 */

export const SALES_DOCUMENTS_API = "/api/construction/sales/documents";

let nextId = 0;

function idOf(): string {
  nextId += 1;
  return `0199c4a0-0000-7000-8000-0000005a${String(nextId).padStart(4, "0")}`;
}

/** A solid colour square as an SVG data URL, so tiles show an image. */
export function salesSwatch(color: string): string {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="${color}"/></svg>`,
  )}`;
}

/** A saved file of an inquiry (or booking). */
export function salesFile(
  fileName: string,
  role: SalesFileRole,
  extra: Partial<SalesDocumentFile> = {},
  document: { type: string; id: string } = {
    type: "inquiry",
    id: "0199c4a0-0000-7000-8000-000000510001",
  },
): SalesDocumentFile {
  const id = extra.id ?? idOf();
  return {
    id,
    role,
    fileName,
    contentType: fileName.endsWith(".pdf") ? "application/pdf" : "image/jpeg",
    bytes: 420_000,
    viewable: true,
    url: `${SALES_DOCUMENTS_API}/${document.type}/${document.id}/files/${id}`,
    thumbUrl: salesSwatch("#a8a29e"),
    createdAt: "2026-10-14T06:30:00.000Z",
    createdBy: "user-owner",
    createdByName: "Arun Selva Kumar",
    canRemove: true,
    ...extra,
  };
}

const PATH =
  /^\/api\/construction\/sales\/documents\/([a-z]+)\/([^/?]+)\/files(\/[^?]*)?(\?.*)?$/;

/**
 * A stateful answerer of every sales document's files for one story: an
 * upload is started on the `app` path and completed into the list;
 * removing drops a file. Returns undefined for other calls. Pair it with
 * `mockXhrUploads()` when a story uploads.
 */
export function mockSalesDocumentApi(
  options: { files?: SalesDocumentFile[]; canUpload?: boolean } = {},
): (call: ApiCall) => Response | undefined {
  let files = [...(options.files ?? [])];
  const started = new Map<string, { fileName: string; bytes: number }>();
  return (call) => {
    const match = PATH.exec(call.path);
    if (match == null) return undefined;
    const [, type = "", id = "", rest = ""] = match;
    const base = `${SALES_DOCUMENTS_API}/${type}/${id}`;
    if (rest === "" && call.method === "GET")
      return Response.json({
        items: files,
        canUpload: options.canUpload ?? true,
      });
    if (rest === "/uploads" && call.method === "POST") {
      const body = call.body as { fileName: string; bytes: number };
      const key = `companies/w1/sales-documents/${id}/${idOf()}.bin`;
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
      const body = call.body as {
        key: string;
        fileName: string;
        role: SalesFileRole;
      };
      const added = salesFile(
        body.fileName,
        body.role,
        {
          bytes: started.get(body.key)?.bytes ?? 0,
          createdAt: new Date().toISOString(),
        },
        { type, id },
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
