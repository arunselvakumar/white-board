import { betterAuth } from "better-auth";
import { toNextJsHandler } from "better-auth/next-js";

import { createAuthOptions } from "../config";
import { createEmailSender } from "../email/sender";
import { APP_BASE_PATH, AUTH_BASE_PATH } from "../urls";

function createAuth() {
  return betterAuth(createAuthOptions(emailSender));
}

export const emailSender = createEmailSender();

const globalForAuth = globalThis as typeof globalThis & {
  whiteboardAuth?: ReturnType<typeof createAuth>;
};

/** The Better Auth server. Reused across hot reloads in development. */
export const auth = globalForAuth.whiteboardAuth ?? createAuth();

if (process.env["NODE_ENV"] !== "production") {
  globalForAuth.whiteboardAuth = auth;
}

export type Auth = typeof auth;

const nextHandlers = toNextJsHandler(auth);

/**
 * Next.js strips the `/app` base path from `request.url` before a route
 * handler runs, but Better Auth matches and builds URLs on the public path
 * (`/app/api/auth`). Put the base path back first.
 */
export async function withAppBasePath(request: Request): Promise<Request> {
  const url = new URL(request.url);
  if (url.pathname.startsWith(`${AUTH_BASE_PATH}/`)) return request;
  url.pathname = `${APP_BASE_PATH}${url.pathname}`;
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  return new Request(url, {
    method: request.method,
    headers: request.headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    signal: request.signal,
  });
}

/** Route handlers for `app/api/auth/[...all]/route.ts`. */
export const authRouteHandlers = {
  GET: async (request: Request) =>
    nextHandlers.GET(await withAppBasePath(request)),
  POST: async (request: Request) =>
    nextHandlers.POST(await withAppBasePath(request)),
};
