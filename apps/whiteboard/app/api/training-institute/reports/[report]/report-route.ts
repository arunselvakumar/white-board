import { parseOrThrow } from "@/app/api/_lib/map-error";
import type { ReportKey } from "@/src/training-institute/domain/report-catalogue";

import { TrainingInstituteReportParamsModel } from "../report-models";

export type ReportRouteContext = { params: Promise<{ report: string }> };

export async function reportKey(
  context: ReportRouteContext,
): Promise<ReportKey> {
  return parseOrThrow(
    TrainingInstituteReportParamsModel.safeParse(await context.params),
  ).report;
}
