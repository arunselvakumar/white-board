import type { ProjectDocumentKind } from "@/src/projects/domain/project-document-rules";
import type { ProjectDocument } from "@/src/queries/project-documents";

import { mockApi } from "../../../.storybook/mocks/api";
import { project } from "../project-fixtures";

/** Story fixtures for Project Documents (CM-414). */
export const ANUGRAHA = project({
  id: "0199c4a0-0000-7000-8000-0000000000a1",
  name: "Anugraha Residency",
  address: "Door 14, Gandhi Road, Tirunelveli Junction 627001",
  clientName: "Sri Balaji Developers",
  clientPhone: "+919843122110",
  quotationNo: "SBD/Q/2026/114",
  quotationDate: "2026-02-10",
  clientOrderNo: "WO/2026/031",
  clientOrderDate: "2026-03-03",
  agreementNo: "SBD/AGR/2026/009",
  agreementDate: "2026-03-20",
});

export const DOCUMENTS_API = `/api/construction/projects/projects/${ANUGRAHA.id}/documents`;

const MB = 1024 * 1024;

function document(
  id: number,
  kind: ProjectDocumentKind,
  fileName: string,
  bytes: number,
  createdAt: string,
  extra: Partial<ProjectDocument> = {},
): ProjectDocument {
  const docId = `0199c4a0-0000-7000-8000-0000000d${String(id).padStart(4, "0")}`;
  const pdf = fileName.toLowerCase().endsWith(".pdf");
  return {
    id: docId,
    kind,
    fileName,
    contentType: pdf ? "application/pdf" : "application/octet-stream",
    bytes: Math.round(bytes),
    viewable: pdf,
    url: `${DOCUMENTS_API}/${docId}`,
    createdAt,
    createdBy: "user-karthik",
    createdByName: "Karthik R",
    ...extra,
  };
}

/** Newest first, as the API lists them: 5 files, 6.8 MB. */
export const ANUGRAHA_DOCUMENTS: ProjectDocument[] = [
  document(
    5,
    "other",
    "Site photos March.zip",
    3.1 * MB,
    "2026-03-22T11:10:00Z",
  ),
  document(
    4,
    "client_order",
    "BOQ revised.xlsx",
    0.4 * MB,
    "2026-03-06T09:45:00Z",
    {
      createdByName: null,
    },
  ),
  document(
    3,
    "client_order",
    "Work order signed.pdf",
    1.2 * MB,
    "2026-03-04T06:20:00Z",
  ),
  document(
    2,
    "agreement",
    "Agreement stamped.jpg",
    0.9 * MB,
    "2026-03-21T07:00:00Z",
    {
      contentType: "image/jpeg",
      viewable: true,
    },
  ),
  document(
    1,
    "quotation",
    "Quotation_SBD_114.pdf",
    1.2 * MB,
    "2026-02-10T08:30:00Z",
  ),
];

/**
 * A Documents API that remembers uploads and deletes for one story:
 * start answers the `app` path, complete adds the file at the top,
 * delete removes it. `startError` refuses every upload at the start;
 * `completeError` refuses one file at completion.
 */
export function mockDocumentsApi(
  options: {
    documents?: ProjectDocument[];
    startError?: { status: number; code: string; message: string };
    /** Refuses completing one file by name. */
    completeError?: {
      fileName: string;
      status: number;
      code: string;
      message: string;
    };
  } = {},
) {
  let items = [...(options.documents ?? ANUGRAHA_DOCUMENTS)];
  const started = new Map<string, number>();
  let next = 100;
  const api = mockApi((call) => {
    if (
      call.method === "GET" &&
      call.path === `/api/construction/projects/projects/${ANUGRAHA.id}`
    )
      return Response.json(ANUGRAHA);
    if (call.method === "GET" && call.path === DOCUMENTS_API)
      return Response.json({
        items,
        totalBytes: items.reduce((sum, item) => sum + item.bytes, 0),
      });
    if (call.method === "POST" && call.path === `${DOCUMENTS_API}/uploads`) {
      if (options.startError != null)
        return Response.json(
          {
            code: options.startError.code,
            message: options.startError.message,
          },
          { status: options.startError.status },
        );
      const body = call.body as { fileName: string; bytes: number };
      next += 1;
      const key = `companies/w1/project-documents/${ANUGRAHA.id}/${String(next)}.bin`;
      started.set(key, body.bytes);
      return Response.json(
        {
          key,
          fileName: body.fileName,
          upload: {
            via: "app",
            url: `${DOCUMENTS_API}/uploads/app?key=${encodeURIComponent(key)}`,
          },
        },
        { status: 201 },
      );
    }
    if (call.method === "POST" && call.path === DOCUMENTS_API) {
      const body = call.body as {
        key: string;
        kind: ProjectDocumentKind;
        fileName: string;
      };
      const refused = options.completeError;
      if (refused?.fileName === body.fileName)
        return Response.json(
          { code: refused.code, message: refused.message },
          { status: refused.status },
        );
      next += 1;
      const added = document(
        next,
        body.kind,
        body.fileName,
        started.get(body.key) ?? 0,
        "2026-10-09T06:30:00Z",
      );
      items = [added, ...items];
      return Response.json(added, { status: 201 });
    }
    const deleted = /\/documents\/([^/]+)\/delete$/.exec(call.path);
    if (call.method === "POST" && deleted != null) {
      items = items.filter((item) => item.id !== deleted[1]);
      return new Response(null, { status: 204 });
    }
    return undefined;
  });
  return api;
}
