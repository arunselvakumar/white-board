import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QueryHttpError } from "./http";
import { uploadProjectDocument } from "./project-documents";

const { uploadPresigned } = vi.hoisted(() => ({ uploadPresigned: vi.fn() }));
vi.mock("@vercel/blob/client", () => ({ uploadPresigned }));

const PROJECT = "0199c4a0-0000-7000-8000-000000000001";
const BASE = `/api/construction/projects/projects/${PROJECT}/documents`;
const KEY = `companies/w1/project-documents/${PROJECT}/0199c4a0-0000-7000-8000-0000000000aa.pdf`;
const APP_URL = `${BASE}/uploads/app?key=${encodeURIComponent(KEY)}`;

const DOCUMENT = {
  id: "0199c4a0-0000-7000-8000-0000000000d1",
  kind: "client_order",
  fileName: "Work order signed.pdf",
  contentType: "application/pdf",
  bytes: 9,
  viewable: true,
  url: `${BASE}/0199c4a0-0000-7000-8000-0000000000d1`,
  createdAt: "2026-03-04T05:30:00.000Z",
  createdBy: "u1",
  createdByName: "Karthik R",
};

type Call = { method: string; url: string; body: unknown };

function pdf(name = "Work order signed.pdf", type = "application/pdf") {
  return new File(["%PDF-1.7\n"], name, { type });
}

function error(status: number, code: string, message: string): Response {
  return Response.json({ code, message }, { status });
}

/** `fetch` answering steps 1 and 3 in turn, recording every call. */
function mockFetch(...responses: Response[]): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
    calls.push({
      method: init?.method ?? "GET",
      url: input,
      body:
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as unknown)
          : undefined,
    });
    const next = responses.shift();
    if (next == null) throw new Error(`Unexpected fetch ${input}`);
    return Promise.resolve(next);
  });
  return calls;
}

function started(
  upload:
    | { via: "app"; url: string }
    | { via: "blob"; handleUploadUrl: string; multipart: boolean },
) {
  return Response.json(
    { key: KEY, fileName: "Work order signed.pdf", upload },
    { status: 201 },
  );
}

/** A stand-in XHR: reports progress in steps, then answers `status`. */
class FakeXhr {
  static instances: FakeXhr[] = [];
  static status = 204;
  static responseText = "";
  static fail = false;

  method = "";
  url = "";
  headers: Record<string, string> = {};
  body: unknown;
  status = 0;
  statusText = "";
  responseText = "";
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeXhr.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  send(body: unknown) {
    this.body = body;
    queueMicrotask(() => {
      if (FakeXhr.fail) {
        this.onerror?.();
        return;
      }
      for (const loaded of [25, 64, 100])
        this.upload.onprogress?.({
          lengthComputable: true,
          loaded,
          total: 100,
        } as ProgressEvent);
      this.status = FakeXhr.status;
      this.responseText = FakeXhr.responseText;
      this.onload?.();
    });
  }

  abort() {
    this.onabort?.();
  }
}

beforeEach(() => {
  FakeXhr.instances = [];
  FakeXhr.status = 204;
  FakeXhr.responseText = "";
  FakeXhr.fail = false;
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  uploadPresigned.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uploadProjectDocument (CM-414)", () => {
  it("starts, sends the bytes through the app with progress, and completes", async () => {
    const calls = mockFetch(
      started({ via: "app", url: APP_URL }),
      Response.json(DOCUMENT, { status: 201 }),
    );
    const progress: number[] = [];

    const document = await uploadProjectDocument(
      PROJECT,
      pdf(),
      "client_order",
      {
        onProgress: (value) => progress.push(value),
      },
    );

    expect(document).toEqual(DOCUMENT);
    expect(calls).toEqual([
      {
        method: "POST",
        url: `${BASE}/uploads`,
        body: {
          kind: "client_order",
          fileName: "Work order signed.pdf",
          bytes: 9,
        },
      },
      {
        method: "POST",
        url: BASE,
        body: {
          key: KEY,
          kind: "client_order",
          fileName: "Work order signed.pdf",
        },
      },
    ]);
    const [xhr] = FakeXhr.instances;
    expect(xhr?.method).toBe("POST");
    expect(xhr?.url).toBe(APP_URL);
    expect(xhr?.headers).toEqual({ "content-type": "application/pdf" });
    expect(xhr?.body).toBeInstanceOf(File);
    expect(progress).toEqual([0, 25, 64, 100, 100]);
    expect(uploadPresigned).not.toHaveBeenCalled();
  });

  it("sends a file with no type as octet-stream", async () => {
    mockFetch(
      started({ via: "app", url: APP_URL }),
      Response.json(DOCUMENT, { status: 201 }),
    );
    await uploadProjectDocument(PROJECT, pdf("BOQ revised.xlsx", ""), "other");
    expect(FakeXhr.instances[0]?.headers["content-type"]).toBe(
      "application/octet-stream",
    );
  });

  it("sends the bytes straight to Blob with the key exactly as given", async () => {
    mockFetch(
      started({
        via: "blob",
        handleUploadUrl: `${BASE}/uploads/presign`,
        multipart: true,
      }),
      Response.json(DOCUMENT, { status: 200 }),
    );
    uploadPresigned.mockImplementation(
      (
        _key: string,
        _file: File,
        options: {
          onUploadProgress: (event: { percentage: number }) => void;
        },
      ) => {
        options.onUploadProgress({ percentage: 42.4 });
        return Promise.resolve({ pathname: KEY });
      },
    );
    const progress: number[] = [];
    const file = pdf();

    await uploadProjectDocument(PROJECT, file, "client_order", {
      onProgress: (value) => progress.push(value),
    });

    expect(uploadPresigned).toHaveBeenCalledTimes(1);
    const [key, body, options] = uploadPresigned.mock.calls[0] as [
      string,
      File,
      Record<string, unknown>,
    ];
    expect(key).toBe(KEY);
    expect(body).toBe(file);
    expect(options).toMatchObject({
      access: "private",
      handleUploadUrl: `${BASE}/uploads/presign`,
      multipart: true,
    });
    expect(options).not.toHaveProperty("addRandomSuffix");
    expect(options).not.toHaveProperty("allowOverwrite");
    expect(progress).toEqual([0, 42, 100]);
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it("turns a Blob failure into a plain message", async () => {
    const calls = mockFetch(
      started({
        via: "blob",
        handleUploadUrl: `${BASE}/uploads/presign`,
        multipart: false,
      }),
    );
    uploadPresigned.mockRejectedValue(new Error("BlobError: store suspended"));

    const failure = uploadProjectDocument(PROJECT, pdf(), "other");

    await expect(failure).rejects.toMatchObject({
      code: "UPLOAD_FAILED",
      message: "Couldn't upload. Try again.",
    });
    expect(calls).toHaveLength(1);
  });

  it("refuses a program or a file over 25 MB without a request", async () => {
    const calls = mockFetch();
    await expect(
      uploadProjectDocument(PROJECT, pdf("setup.exe"), "other"),
    ).rejects.toMatchObject({ code: "FILE_TYPE_NOT_ALLOWED", status: 400 });
    const large = pdf();
    Object.defineProperty(large, "size", { value: 25 * 1024 * 1024 + 1 });
    await expect(
      uploadProjectDocument(PROJECT, large, "other"),
    ).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
    expect(calls).toHaveLength(0);
  });

  it("passes on the server's refusal at the start", async () => {
    mockFetch(
      error(
        409,
        "DOCUMENTS_LIMIT",
        "Keep at most 50 documents on a Project. Delete one first.",
      ),
    );
    const failure = uploadProjectDocument(PROJECT, pdf(), "other");
    await expect(failure).rejects.toBeInstanceOf(QueryHttpError);
    await expect(failure).rejects.toMatchObject({
      status: 409,
      code: "DOCUMENTS_LIMIT",
      message: "Keep at most 50 documents on a Project. Delete one first.",
    });
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it("reads the error envelope when the app refuses the bytes", async () => {
    const calls = mockFetch(started({ via: "app", url: APP_URL }));
    FakeXhr.status = 400;
    FakeXhr.responseText = JSON.stringify({
      code: "FILE_TOO_LARGE",
      message: "The file must be at most 25 MB.",
    });
    await expect(
      uploadProjectDocument(PROJECT, pdf(), "other"),
    ).rejects.toMatchObject({
      status: 400,
      code: "FILE_TOO_LARGE",
      message: "The file must be at most 25 MB.",
    });
    expect(calls).toHaveLength(1);
  });

  it("says the upload failed when the network drops the bytes", async () => {
    mockFetch(started({ via: "app", url: APP_URL }));
    FakeXhr.fail = true;
    await expect(
      uploadProjectDocument(PROJECT, pdf(), "other"),
    ).rejects.toMatchObject({ code: "UPLOAD_FAILED" });
  });

  it("passes on the server's refusal at completion", async () => {
    mockFetch(
      started({ via: "app", url: APP_URL }),
      error(
        400,
        "FILE_TYPE_NOT_ALLOWED",
        "Programs cannot be kept on a Project. Choose a document, a picture, a drawing or a zip.",
      ),
    );
    await expect(
      uploadProjectDocument(PROJECT, pdf("renamed.pdf"), "other"),
    ).rejects.toMatchObject({
      status: 400,
      code: "FILE_TYPE_NOT_ALLOWED",
    });
  });

  it("rejects with an AbortError when cancelled", async () => {
    mockFetch(started({ via: "app", url: APP_URL }));
    const controller = new AbortController();
    controller.abort();
    await expect(
      uploadProjectDocument(PROJECT, pdf(), "other", {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
