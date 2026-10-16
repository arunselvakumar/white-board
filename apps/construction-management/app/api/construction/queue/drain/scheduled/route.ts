import { timingSafeEqual } from "node:crypto";

import { StatusCodes } from "http-status-codes";

import { jsonError } from "@/app/api/_lib/json-error";
import { mapError } from "@/app/api/_lib/map-error";
import { runDailyJobs } from "@/src/composition/queue";

import type { RunConstructionQueueDailyResponseModel } from "../../queue-models";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The daily cron (ADR CM-0021 §1): enqueues each daily job once for the
 * day (retention, orphan clean-up, "became delayed", Company deletions
 * due), then drains every due job, stragglers included, for up to 270 s.
 * No Session: the caller sends `Authorization: Bearer <CRON_SECRET>`
 * (what Vercel Cron sends). Without `CRON_SECRET` it is 503
 * `CRON_NOT_CONFIGURED`; a wrong secret is 401. Safe to call again: daily
 * jobs are deduplicated per day.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const secret = process.env["CRON_SECRET"];
    if (secret == null || secret === "")
      return jsonError(
        StatusCodes.SERVICE_UNAVAILABLE,
        "CRON_NOT_CONFIGURED",
        "Scheduled jobs are not configured on this server.",
      );
    const header = request.headers.get("authorization") ?? "";
    if (!sameSecret(header, `Bearer ${secret}`))
      return jsonError(
        StatusCodes.UNAUTHORIZED,
        "CRON_SECRET_INVALID",
        "The scheduled job secret does not match.",
      );
    const body: RunConstructionQueueDailyResponseModel = await runDailyJobs();
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
