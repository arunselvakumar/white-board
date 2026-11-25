import { signInAs } from "@/.storybook/mocks/auth";
import { PRESCHOOL_CENTRE_COOKIE } from "@/lib/preschool-active-centre";
import { getQueryClient } from "@/src/queries/query-client";
import { preschoolKeys, type PreschoolMe } from "@/src/queries/preschool/me";

// Story helpers for Preschool screens: a signed-in Preschool Workspace, an
// answer for /api/preschool/me, and handlers for the rest of /api/preschool.

export type PreschoolApiReply = { status?: number; json?: unknown };
/** `url` carries the query string (`?centreId=…`). */
export type PreschoolApiHandler = (
  body: unknown,
  url: URL,
) => PreschoolApiReply;
export type PreschoolApiCall = { route: string; body: unknown };

export const CENTRE_IDS = {
  annaNagar: "5b0e8400-e29b-41d4-a716-446655440001",
  velachery: "5b0e8400-e29b-41d4-a716-446655440002",
  tambaram: "5b0e8400-e29b-41d4-a716-446655440003",
} as const;

export function preschoolMe(overrides: Partial<PreschoolMe> = {}): PreschoolMe {
  return {
    role: "owner",
    userName: "Arun",
    academicYearStartMonth: 4,
    currentAcademicYear: {
      id: "5c0e8400-e29b-41d4-a716-446655440000",
      name: "2026–27",
      startsOn: "2026-04-01",
      endsOn: "2027-03-31",
    },
    hasSeveralCentres: true,
    centres: [
      {
        id: CENTRE_IDS.annaNagar,
        name: "Little Steps Anna Nagar",
        code: "LSAN",
        ownership: "company_owned",
        status: "active",
      },
      {
        id: CENTRE_IDS.tambaram,
        name: "Little Steps Tambaram",
        code: "LSTB",
        ownership: "franchised",
        status: "active",
      },
      {
        id: CENTRE_IDS.velachery,
        name: "Little Steps Velachery",
        code: "LSVL",
        ownership: "franchised",
        status: "active",
      },
    ],
    classroomIds: [],
    children: [],
    ...overrides,
  };
}

/**
 * Signs the story in to a Preschool Workspace and answers every
 * `/api/preschool/...` request from `routes` (keyed `"GET /me"`,
 * `"POST /centres"`), recording each in `calls`. `me` answers `GET /me`
 * unless `routes` does. Anything else falls through to the real `fetch`,
 * and every request is recorded in `requests`. Returns the cleanup.
 */
export function mockPreschoolApi({
  me = preschoolMe(),
  memberRole = me == null
    ? "owner"
    : me.role === "centre_head"
      ? "teacher"
      : me.role,
  routes = {},
  calls = [],
  requests = [],
  centreId = null,
}: {
  me?: PreschoolMe | null;
  memberRole?: "owner" | "teacher" | "parent";
  routes?: Record<string, PreschoolApiHandler>;
  calls?: PreschoolApiCall[];
  requests?: string[];
  /** The Centre remembered in the cookie; null clears it. */
  centreId?: string | null;
} = {}): () => void {
  signInAs(memberRole, {
    id: "org_little_steps",
    name: "Little Steps",
    institutionType: "preschool",
  });
  document.cookie = `${PRESCHOOL_CENTRE_COOKIE}=${centreId ?? ""}; Path=/; Max-Age=${centreId == null ? 0 : 3600}`;
  const client = getQueryClient();
  client.removeQueries({ queryKey: preschoolKeys.all });
  const all: Record<string, PreschoolApiHandler> = {
    ...(me == null ? {} : { "GET /me": () => ({ json: me }) }),
    ...routes,
  };
  const original = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const href =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const url = new URL(href, window.location.origin);
    requests.push(url.pathname);
    const method = (init?.method ?? "GET").toUpperCase();
    const route = `${method} ${url.pathname.replace(/^\/api\/preschool/, "")}`;
    const handler = url.pathname.startsWith("/api/preschool/")
      ? all[route]
      : undefined;
    if (handler == null) return original(input, init);
    const body: unknown =
      typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ route, body });
    const reply = handler(body, url);
    return Promise.resolve(
      reply.status === 204
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify(reply.json ?? {}), {
            status: reply.status ?? 200,
            headers: { "content-type": "application/json" },
          }),
    );
  };
  return () => {
    globalThis.fetch = original;
    client.removeQueries({ queryKey: preschoolKeys.all });
    document.cookie = `${PRESCHOOL_CENTRE_COOKIE}=; Path=/; Max-Age=0`;
  };
}
