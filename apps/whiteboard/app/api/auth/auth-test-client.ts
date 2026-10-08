import { randomUUID } from "node:crypto";

import { GET, POST } from "./[...all]/route";

export const ORIGIN = "http://localhost:3000";

/** A cookie jar for one browser, enough for Better Auth's session cookie. */
export class TestBrowser {
  private cookies = new Map<string, string>();

  constructor(readonly ip = `10.${rand()}.${rand()}.${rand()}`) {}

  get cookieHeader(): string {
    return [...this.cookies]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  get hasSession(): boolean {
    return [...this.cookies.keys()].some((name) =>
      name.endsWith("session_token"),
    );
  }

  /** Headers a server component or route would see for this browser. */
  headers(): Headers {
    const headers = new Headers({ "x-forwarded-for": this.ip });
    if (this.cookies.size > 0) headers.set("cookie", this.cookieHeader);
    return headers;
  }

  async request(
    path: string,
    init: { method?: "GET" | "POST"; body?: unknown } = {},
  ): Promise<Response> {
    const method = init.method ?? (init.body === undefined ? "GET" : "POST");
    const headers = this.headers();
    headers.set("origin", ORIGIN);
    if (method === "POST") headers.set("content-type", "application/json");
    const request = new Request(`${ORIGIN}${path}`, {
      method,
      headers,
      body: method === "POST" ? JSON.stringify(init.body ?? {}) : undefined,
    });
    const response = await (method === "GET" ? GET : POST)(request);
    this.store(response);
    return response;
  }

  /** Calls `/api/auth/<path>`. */
  auth(path: string, body?: unknown): Promise<Response> {
    return this.request(`/api/auth${path}`, { body });
  }

  private store(response: Response): void {
    for (const cookie of response.headers.getSetCookie()) {
      const [pair, ...attributes] = cookie.split(";");
      const index = pair?.indexOf("=") ?? -1;
      if (pair == null || index < 0) continue;
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      const expired = attributes.some((attribute) => {
        const [key, raw] = attribute.split("=").map((part) => part.trim());
        return (
          (key?.toLowerCase() === "max-age" && Number(raw) <= 0) ||
          (key?.toLowerCase() === "expires" && new Date(raw ?? "") < new Date())
        );
      });
      if (expired || value.length === 0) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
}

function rand(): number {
  return Math.floor(Math.random() * 254) + 1;
}

/** A unique email and username for one test. */
export function newIdentity(prefix = "user") {
  const id = randomUUID().slice(0, 8);
  return {
    email: `${prefix}-${id}@example.com`,
    username: `${prefix}_${id}`,
    password: `Pass-${id}-word`,
    name: `${prefix} ${id}`,
  };
}
