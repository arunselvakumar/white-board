import { StatusCodes } from "http-status-codes";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TEST_ORIGIN } from "@/test/sessions";

import { GET } from "./route";

const URL = `${TEST_ORIGIN}/api/construction/queue/drain/scheduled`;

function call(authorization?: string) {
  return GET(
    new Request(URL, {
      headers: authorization == null ? {} : { authorization },
    }),
  );
}

describe("GET /api/construction/queue/drain/scheduled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is 503 without CRON_SECRET and 401 with the wrong one", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer x")).status).toBe(
      StatusCodes.SERVICE_UNAVAILABLE,
    );
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await call("Bearer nope")).status).toBe(StatusCodes.UNAUTHORIZED);
  });

  it("runs the daily jobs and drains with the right secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const response = await call("Bearer s3cret");
    expect(response.status).toBe(StatusCodes.OK);
    const body = (await response.json()) as {
      enqueued: string[];
      ran: number;
      failed: number;
    };
    expect(Array.isArray(body.enqueued)).toBe(true);
    expect(body.failed).toBeGreaterThanOrEqual(0);
  });
});
