import { withAppBasePath } from "@/lib/app-base-path";

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

export async function apiJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("accept")) {
    headers.set("accept", "application/json");
  }

  const requestUrl =
    typeof input === "string" && input.startsWith("/api/")
      ? withAppBasePath(input)
      : input;
  const response = await fetch(requestUrl, { ...init, headers });
  if (!response.ok) {
    throw new QueryHttpError(
      response.status,
      await readErrorEnvelope(response),
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
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
