export type ErrorEnvelope = {
  code: string;
  message: string;
  details?: unknown;
};

export class QueryHttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, envelope: ErrorEnvelope) {
    super(envelope.message);
    this.name = "QueryHttpError";
    this.status = status;
    this.code = envelope.code;
    this.details = envelope.details;
  }
}

/** `fetch`, or a route handler a page calls in-process (ADR-0052). */
export type QueryTransport = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

declare module "@tanstack/react-query" {
  // Module augmentation merges only interfaces.
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Register {
    queryMeta: { fetch?: QueryTransport };
  }
}

/**
 * Reads JSON from the API. `meta.fetch` is the transport a page passes on the
 * server (ADR-0052); the browser uses `fetch`. Inside Next's server render
 * there is no base URL or Session cookie, so a read the page didn't prefetch
 * fails here rather than fetching a relative URL.
 */
export async function apiJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  meta?: { fetch?: QueryTransport },
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("accept")) {
    headers.set("accept", "application/json");
  }

  const transport = meta?.fetch ?? browserFetch(input);
  const response = await transport(input, { ...init, headers });
  if (!response.ok) {
    throw new QueryHttpError(
      response.status,
      await readErrorEnvelope(response),
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function browserFetch(input: RequestInfo | URL): QueryTransport {
  // Next sets NEXT_RUNTIME in its server; tests and the browser leave it unset.
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  if (typeof window === "undefined" && process.env["NEXT_RUNTIME"]) {
    throw new Error(
      `Not prefetched: ${typeof input === "string" ? input : input instanceof URL ? input.href : input.url} was read during the server render. Prefetch it in the page (ADR-0052).`,
    );
  }
  return fetch;
}

async function readErrorEnvelope(response: Response): Promise<ErrorEnvelope> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "code" in body &&
      "message" in body &&
      typeof body.code === "string" &&
      typeof body.message === "string"
    ) {
      return {
        code: body.code,
        message: body.message,
        details: "details" in body ? body.details : undefined,
      };
    }
  } catch {
    // Not JSON; fall through to the status text.
  }

  return {
    code: "http_error",
    message: response.statusText || "Request failed",
  };
}
