import {
  companies,
  getCompanyAuthFromHeaders,
} from "@repo/auth/construction/server";

import { isJoinPath, safeAppPath } from "@/lib/safe-redirect";

export const dynamic = "force-dynamic";

function redirectTo(request: Request, path: string, headers?: Headers) {
  const response = Response.redirect(new URL(path, request.url), 303);
  if (headers == null) return response;
  const merged = new Headers(response.headers);
  for (const cookie of headers.getSetCookie())
    merged.append("set-cookie", cookie);
  return new Response(null, { status: 303, headers: merged });
}

/**
 * Where a signed-in User goes next (CM-103): no Company → Create Company,
 * one → straight in, several → Choose Company. An Active Company that is
 * still valid goes straight in.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await getCompanyAuthFromHeaders(request.headers);
  const url = new URL(request.url);
  const target = safeAppPath(url.searchParams.get("redirect_url"));
  const carry =
    target === safeAppPath(null)
      ? ""
      : `?redirect_url=${encodeURIComponent(target)}`;

  if (!auth.isAuthenticated) return redirectTo(request, `/sign-in${carry}`);
  // An invite link works with or without a Company.
  if (isJoinPath(target)) return redirectTo(request, target);
  if (auth.workspaceId != null) return redirectTo(request, target);

  const mine = await companies.listForUser(auth.userId);
  const [only] = mine;
  if (mine.length === 0) return redirectTo(request, `/choose-company${carry}`);
  if (mine.length === 1 && only != null) {
    const headers = await companies.activate(request.headers, only.id);
    return redirectTo(request, target, headers);
  }
  return redirectTo(request, `/choose-company${carry}`);
}
