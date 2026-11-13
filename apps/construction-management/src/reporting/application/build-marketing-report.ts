import {
  buildCompanyPipeline,
  buildPersonSummary,
  buildVisitRegister,
} from "../domain/marketing-reports";
import type { ReportBody } from "../domain/report-document";
import type {
  MarketingRecordScope,
  ReportJob,
  ReportParams,
} from "../domain/report-job";
import type { MarketingReportSource } from "./ports";

export type MarketingReportParams = Extract<
  ReportParams,
  {
    kind:
      | "marketing_visit_register"
      | "marketing_person_summary"
      | "marketing_company_pipeline";
  }
>;

/** The Marketing reports (ADR CM-0040 §13); the register is wide, so A3. */
export const MARKETING_TABLE_KINDS: readonly ReportJob["kind"][] = [
  "marketing_visit_register",
  "marketing_person_summary",
  "marketing_company_pipeline",
];

const own = (scope: MarketingRecordScope) => scope !== "all";

/** The body of a Marketing report (ADR CM-0040 §13). */
export async function marketingReportBody(
  job: ReportJob,
  params: MarketingReportParams,
  source: MarketingReportSource | undefined,
  now: Date,
): Promise<ReportBody> {
  if (source == null)
    throw new Error("The marketing report source is not wired.");
  switch (params.kind) {
    case "marketing_visit_register": {
      const data = await source.visitRegister(job.workspaceId, {
        range: { from: params.from, to: params.to },
        memberId: params.memberId,
        prospectCompanyId: params.prospectCompanyId,
        status: params.status,
        purpose: params.purpose,
        scopes: params.scopes,
        now,
      });
      return buildVisitRegister({
        visits: data.rows,
        own: own(params.scopes.visits),
        filters: data.filterNames,
      });
    }
    case "marketing_person_summary": {
      const people = await source.personSummary(job.workspaceId, {
        month: params.month,
        scopes: params.scopes,
        now,
      });
      return buildPersonSummary({ people, own: own(params.scopes.visits) });
    }
    case "marketing_company_pipeline": {
      const data = await source.companyPipeline(job.workspaceId, {
        asOn: params.asOn,
        stage: params.stage,
        memberId: params.memberId,
        scopes: params.scopes,
      });
      return buildCompanyPipeline({
        companies: data.rows,
        stages: data.stages,
        own: own(params.scopes.companies),
        filters: data.filterNames,
      });
    }
  }
}
