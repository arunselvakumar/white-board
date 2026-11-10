import type { ApiCall } from "../../../.storybook/mocks/api";
import type {
  FinanceDocumentFile,
  FinanceRemark,
} from "@/src/queries/finance-documents";
import type { FinanceDocumentType } from "@/src/finance/domain/finance-documents";

/**
 * Story fixtures for the finance documents' thread and files (M7). Other
 * finance stories compose the handler into their own `mockApi`:
 *
 * ```ts
 * const documents = mockFinanceDocumentApi();
 * mockApi((call) => documents(call) ?? vouchersHandler(call));
 * ```
 */

export const FINANCE_DOCUMENTS_API = "/api/construction/finance/documents";

export const FINANCE_SAMPLE_DOCUMENT = {
  type: "petty_cash_voucher" as FinanceDocumentType,
  id: "0199c4a0-0000-7000-8000-0000000a0001",
};

const HOUR = 3_600_000;

function ago(hours: number): string {
  return new Date(Date.now() - hours * HOUR).toISOString();
}

function fileUrl(type: string, id: string, fileId: string): string {
  return `${FINANCE_DOCUMENTS_API}/${type}/${id}/files/${fileId}`;
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

/** A saved file of a document (the sample voucher unless given). */
export function financeFile(
  fileName: string,
  extra: Partial<FinanceDocumentFile> = {},
  document = FINANCE_SAMPLE_DOCUMENT,
): FinanceDocumentFile {
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

/** A voucher's thread: the accountant's question, the holder's reply with the bill. */
export const FINANCE_REMARKS: FinanceRemark[] = [
  {
    id: "0199c4a0-0000-7000-8000-0000000a1001",
    body: "Which shop was this diesel from? The bill is missing.",
    createdAt: ago(6),
    createdBy: "user-owner",
    createdByName: "Arun Selva Kumar",
    files: [],
  },
  {
    id: "0199c4a0-0000-7000-8000-0000000a1002",
    body: "Sri Murugan Fuels, near the site gate. Bill attached.",
    createdAt: ago(2),
    createdBy: "user-karthik",
    createdByName: "Karthik R",
    files: [
      financeFile("Diesel bill.jpg", {
        id: "0199c4a0-0000-7000-8000-0000000a2001",
        remarkId: "0199c4a0-0000-7000-8000-0000000a1002",
        thumbUrl: swatch("#94a3b8"),
        createdAt: ago(2),
      }),
    ],
  },
];

/** The sample voucher's own files (the second is someone else's). */
export const FINANCE_FILES: FinanceDocumentFile[] = [
  financeFile("Receipt 1.jpg", {
    id: "0199c4a0-0000-7000-8000-0000000a3001",
    thumbUrl: swatch("#a8a29e"),
  }),
  financeFile("Shop invoice.pdf", {
    id: "0199c4a0-0000-7000-8000-0000000a3002",
    thumbUrl: null,
    createdBy: "user-owner",
    createdByName: "Arun Selva Kumar",
    canRemove: false,
  }),
];

export type FinanceDocumentApiOptions = {
  remarks?: FinanceRemark[];
  /** Files on the document; the remarks' files are added from `remarks`. */
  files?: FinanceDocumentFile[];
  canComment?: boolean;
  canAttach?: boolean;
  canUpload?: boolean;
  /** Who posts: the name a new remark or file is shown with. */
  me?: { userId: string; name: string };
  /** Refuses posting a remark with this error. */
  postError?: { status: number; code: string; message: string };
};

const PATH =
  /^\/api\/construction\/finance\/documents\/([a-z_]+)\/([^/?]+)\/(remarks|files)(\/[^?]*)?(\?.*)?$/;

/**
 * A stateful answerer of every finance document's thread and files for
 * one story: posting adds a remark (with its files), an upload is started
 * on the `app` path and completed into the list, removing drops a file.
 * Every document id gets the same data. Returns undefined for other calls,
 * so it composes with an area's own handler. Pair it with
 * `mockXhrUploads()` (`.storybook/mocks/xhr.ts`) when a story uploads.
 */
export function mockFinanceDocumentApi(
  options: FinanceDocumentApiOptions = {},
): (call: ApiCall) => Response | undefined {
  let remarks = [...(options.remarks ?? FINANCE_REMARKS)];
  let files = [
    ...(options.files ?? FINANCE_FILES),
    ...remarks.flatMap((remark) => remark.files),
  ];
  const started = new Map<string, { fileName: string; bytes: number }>();
  const me = options.me ?? { userId: "user-karthik", name: "Karthik R" };
  return (call) => {
    const match = PATH.exec(call.path);
    if (match == null) return undefined;
    const [, type = "", id = "", area, rest = ""] = match;
    const base = `${FINANCE_DOCUMENTS_API}/${type}/${id}`;
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
        const remark: FinanceRemark = {
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
      const key = `companies/w1/finance-documents/${id}/${idOf("a")}.bin`;
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
      const added = financeFile(
        body.fileName,
        {
          bytes: started.get(body.key)?.bytes ?? 0,
          createdAt: new Date().toISOString(),
          createdBy: me.userId,
          createdByName: me.name,
        },
        { type: type as FinanceDocumentType, id },
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
