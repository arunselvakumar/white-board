/** A JSON response that also carries the auth cookies Better Auth set. */
export function jsonWithCookies(
  body: unknown,
  init: { status?: number; cookies: Headers },
): Response {
  const response = Response.json(body, { status: init.status ?? 200 });
  for (const cookie of init.cookies.getSetCookie())
    response.headers.append("set-cookie", cookie);
  return response;
}
