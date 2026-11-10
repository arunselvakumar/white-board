import { mockApi, type ApiCall } from "../../../.storybook/mocks/api";
import type { ProcurementDocumentType } from "@/src/procurement/domain/documents";
import type {
  DocumentFile,
  DocumentRemark,
} from "@/src/queries/procurement-documents";

/**
 * Story fixtures for the documents' thread and files (M5). Other
 * procurement stories compose the handler into their own `mockApi`:
 *
 * ```ts
 * const documents = documentsHandler();
 * mockApi((call) => documents(call) ?? materialOptionsHandler(call) ?? mine(call));
 * ```
 */

export const DOCUMENTS_API = "/api/construction/procurement/documents";

export const SAMPLE_DOCUMENT = {
  type: "purchase_order" as ProcurementDocumentType,
  id: "0199c4a0-0000-7000-8000-0000000e0001",
};

const HOUR = 3_600_000;

function ago(hours: number): string {
  return new Date(Date.now() - hours * HOUR).toISOString();
}

function fileUrl(type: string, id: string, fileId: string): string {
  return `${DOCUMENTS_API}/${type}/${id}/files/${fileId}`;
}

let nextId = 0;

function idOf(prefix: string): string {
  nextId += 1;
  return `0199c4a0-0000-7000-8000-${prefix}${String(nextId).padStart(12 - prefix.length, "0")}`;
}

/** A saved file of the sample document. */
export function documentFile(
  fileName: string,
  extra: Partial<DocumentFile> = {},
  document = SAMPLE_DOCUMENT,
): DocumentFile {
  const id = extra.id ?? idOf("f");
  const lower = fileName.toLowerCase();
  const contentType = lower.endsWith(".pdf")
    ? "application/pdf"
    : lower.endsWith(".jpg") || lower.endsWith(".jpeg")
      ? "image/jpeg"
      : lower.endsWith(".png")
        ? "image/png"
        : "application/octet-stream";
  return {
    id,
    remarkId: null,
    fileName,
    contentType,
    bytes: 420_000,
    viewable: contentType !== "application/octet-stream",
    url: fileUrl(document.type, document.id, id),
    thumbUrl: null,
    createdAt: ago(30),
    createdBy: "user-karthik",
    createdByName: "Karthik R",
    canRemove: true,
    ...extra,
  };
}

/** A thread on a Purchase Order: the engineer asks, the supplier's reply. */
export const DOCUMENT_REMARKS: DocumentRemark[] = [
  {
    id: "0199c4a0-0000-7000-8000-0000000e1001",
    body: "Please confirm the rate for TMT 12 mm before approving — the last PO was ₹62.50 / kg.",
    createdAt: ago(50),
    createdBy: "user-owner",
    createdByName: "Arun Selva Kumar",
    files: [],
  },
  {
    id: "0199c4a0-0000-7000-8000-0000000e1002",
    body: "Spoke to Sri Murugan Traders. Rate holds till Friday; quote attached.",
    createdAt: ago(2),
    createdBy: "user-karthik",
    createdByName: "Karthik R",
    files: [
      documentFile("Quote SMT-114.pdf", {
        id: "0199c4a0-0000-7000-8000-0000000f2001",
        remarkId: "0199c4a0-0000-7000-8000-0000000e1002",
        createdAt: ago(2),
      }),
    ],
  },
];

/** The sample document's own attachments. */
export const DOCUMENT_FILES: DocumentFile[] = [
  documentFile("Signed PO.pdf", { id: "0199c4a0-0000-7000-8000-0000000f1001" }),
  documentFile("Site photo.jpg", {
    id: "0199c4a0-0000-7000-8000-0000000f1002",
    contentType: "image/jpeg",
    viewable: true,
    createdByName: "Arun Selva Kumar",
    createdBy: "user-owner",
    canRemove: false,
  }),
  documentFile("BOQ.xlsx", { id: "0199c4a0-0000-7000-8000-0000000f1003" }),
];

export type DocumentsApiOptions = {
  remarks?: DocumentRemark[];
  /** Files on the document, the remarks' files are added from `remarks`. */
  files?: DocumentFile[];
  canComment?: boolean;
  canAttach?: boolean;
  canUpload?: boolean;
  /** Who posts: the name a new remark is shown with. */
  me?: { userId: string; name: string };
  /** Refuses posting with this error. */
  postError?: { status: number; code: string; message: string };
};

const PATH =
  /^\/api\/construction\/procurement\/documents\/([a-z_]+)\/([^/?]+)\/(remarks|files)(\/[^?]*)?(\?.*)?$/;

/**
 * A stateful answerer of every document's thread and files for one story:
 * posting adds a remark (with its files), an upload is started on the
 * `app` path and completed into the list, removing drops a file. Every
 * document id gets the same data. Returns undefined for other calls.
 */
export function documentsHandler(
  options: DocumentsApiOptions = {},
): (call: ApiCall) => Response | undefined {
  let remarks = [...(options.remarks ?? DOCUMENT_REMARKS)];
  let files = [
    ...(options.files ?? DOCUMENT_FILES),
    ...remarks.flatMap((remark) => remark.files),
  ];
  const started = new Map<string, { fileName: string; bytes: number }>();
  const me = options.me ?? { userId: "user-karthik", name: "Karthik R" };
  return (call) => {
    const match = PATH.exec(call.path);
    if (match == null) return undefined;
    const [, type = "", id = "", area, rest = ""] = match;
    const base = `${DOCUMENTS_API}/${type}/${id}`;
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
        const remark: DocumentRemark = {
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
      const key = `companies/w1/procurement-documents/${id}/${idOf("a")}.bin`;
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
      const added = documentFile(
        body.fileName,
        {
          bytes: started.get(body.key)?.bytes ?? 0,
          createdAt: new Date().toISOString(),
          createdBy: me.userId,
          createdByName: me.name,
        },
        { type: type as ProcurementDocumentType, id },
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

/** `mockApi` with only the documents' thread and files answered. */
export function mockDocumentsApi(options: DocumentsApiOptions = {}) {
  return mockApi(documentsHandler(options));
}
