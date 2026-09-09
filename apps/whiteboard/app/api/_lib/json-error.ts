export type ApiErrorBody = {
  code: string;
  message: string;
  details?: unknown;
};

export function jsonError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): Response {
  const body: ApiErrorBody = { code, message };
  if (details !== undefined) {
    body.details = details;
  }
  return Response.json(body, { status });
}
