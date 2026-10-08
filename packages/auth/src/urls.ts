/** Better Auth's endpoints. Whiteboard is served at the root of its own host (ADR-0035). */
export const AUTH_BASE_PATH = "/api/auth";

function vercelOrigin(host: string | undefined): string | null {
  return host != null && host.length > 0 ? `https://${host}` : null;
}

/**
 * The public origin of the app this process serves, without a path. Each app
 * sets `BETTER_AUTH_URL` in its own environment; `localOrigin` is the
 * development fallback (Whiteboard :3001, Construction Management :3002).
 */
export function appOrigin(localOrigin = "http://localhost:3001"): string {
  const configured = process.env["BETTER_AUTH_URL"];
  if (configured != null && configured.length > 0)
    return new URL(configured).origin;
  return (
    vercelOrigin(process.env["VERCEL_PROJECT_PRODUCTION_URL"]) ??
    vercelOrigin(process.env["VERCEL_URL"]) ??
    localOrigin
  );
}

/** Origins allowed to call the auth API (CSRF and redirect checks). */
export function trustedOrigins(localOrigin?: string): string[] {
  return [
    appOrigin(localOrigin),
    vercelOrigin(process.env["VERCEL_URL"]),
    vercelOrigin(process.env["VERCEL_BRANCH_URL"]),
    vercelOrigin(process.env["VERCEL_PROJECT_PRODUCTION_URL"]),
  ].filter((origin): origin is string => origin != null);
}

export function acceptInvitationUrl(invitationId: string): string {
  return `${appOrigin()}/accept-invitation?id=${encodeURIComponent(invitationId)}`;
}
