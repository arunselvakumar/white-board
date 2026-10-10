import { timingSafeEqual } from "node:crypto";

import { StatusCodes } from "http-status-codes";

import { jsonError } from "@/app/api/_lib/json-error";
import { mapError } from "@/app/api/_lib/map-error";

import type { RunConstructionHrmsScheduledSalaryResponseModel } from "../../salary-models";
import { salaryHandlers } from "../../salary-route";

export const dynamic = "force-dynamic";

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Automatic salary calculation (CM-316): for every Company with “Calculate
 * salary automatically” on whose salary day has come, calculates last
 * month for every member, as `system`. No Session: the caller sends
 * `Authorization: Bearer <CRON_SECRET>` (what Vercel Cron sends when
 * `CRON_SECRET` is set). Without `CRON_SECRET` it is 503
 * `CRON_NOT_CONFIGURED`; a wrong secret is 401. Idempotent: a month that
 * already has a run is left alone, so running it daily is safe. To
 * schedule it on Vercel, add to `vercel.json`:
 * `"crons": [{ "path": "/api/construction/hrms/salaries/calculate-bulk/scheduled", "schedule": "0 1 * * *" }]`.
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
    const body: RunConstructionHrmsScheduledSalaryResponseModel =
      await salaryHandlers.autoCalculateAll();
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
