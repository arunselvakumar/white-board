import { vi } from "vitest";

import { FIXTURE_NOW } from "../_lib/testing";

// Request helpers for the stock HTTP tests.

/** Freezes `Date` (only) at FIXTURE_NOW: today is 2026-11-25 in India. */
export function freezeToday(): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FIXTURE_NOW);
}

export function unfreezeToday(): void {
  vi.useRealTimers();
}

export function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/preschool/stock", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function getRequest(path: string, query: Record<string, string> = {}) {
  const search = new URLSearchParams(query).toString();
  return new Request(
    `http://localhost/api/preschool/stock${path}${search === "" ? "" : `?${search}`}`,
  );
}

export function emptyRequest(): Request {
  return new Request("http://localhost", { method: "POST" });
}

export function idContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

export function childContext(childId: string) {
  return { params: Promise.resolve({ childId }) };
}

export async function codeOf(response: Response): Promise<string> {
  return ((await response.json()) as { code: string }).code;
}
