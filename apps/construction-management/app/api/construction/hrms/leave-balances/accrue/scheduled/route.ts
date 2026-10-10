import { timingSafeEqual } from "node:crypto";

import { StatusCodes } from "http-status-codes";

import { jsonError } from "@/app/api/_lib/json-error";
import { mapError } from "@/app/api/_lib/map-error";

import { leaveHandlers } from "../../../leave-route";
import type { RunConstructionHrmsScheduledLeaveAccrualResponseModel } from "../../leave-balance-models";

export const dynamic = "force-dynamic";

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The scheduled monthly accrual (CM-311): for every Company with “Credit
 * leave every month” on, posts the credits due up to today, as `system`.
 * No Session: the caller sends `Authorization: Bearer <CRON_SECRET>` (what
 * Vercel Cron sends when `CRON_SECRET` is set). Without `CRON_SECRET` on
 * the server it is 503 `CRON_NOT_CONFIGURED`; a wrong secret is 401.
 * Idempotent, so running it daily is safe: each period is credited once,
 * on or after its accrual day. To schedule it on Vercel, add to
 * `vercel.json`: `"crons": [{ "path": "/api/construction/hrms/leave-balances/accrue/scheduled", "schedule": "30 0 * * *" }]`.
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
    const body: RunConstructionHrmsScheduledLeaveAccrualResponseModel =
      await leaveHandlers.balances.accrueAllCompanies();
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
