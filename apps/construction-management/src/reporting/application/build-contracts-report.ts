import {
  buildBillRegister,
  buildBoqExecutedReport,
  buildDeductionsRegister,
  buildMaterialReconciliationReport,
  buildRetentionRegister,
  buildVariationsRegister,
  buildWorkOrderRegister,
} from "../domain/contracts-reports";
import type { ReportBody } from "../domain/report-document";
import type { ReportJob, ReportParams } from "../domain/report-job";
import type { ContractsReportSource } from "./ports";

export type ContractsReportParams = Extract<
  ReportParams,
  {
    kind:
      | "boq_vs_executed"
      | "work_order_register"
      | "contractor_bill_register"
      | "client_bill_register"
      | "deductions_register"
      | "retention_register"
      | "material_reconciliation"
      | "variations_register";
  }
>;

/** The contracts reports (CM-1111); wide registers, so they print on A3. */
export const CONTRACTS_TABLE_KINDS: readonly ReportJob["kind"][] = [
  "boq_vs_executed",
  "work_order_register",
  "contractor_bill_register",
  "client_bill_register",
  "deductions_register",
  "retention_register",
  "material_reconciliation",
  "variations_register",
];

/** The body of a contracts report (CM-1111). */
export async function contractsReportBody(
  job: ReportJob,
  params: ContractsReportParams,
  source: ContractsReportSource | undefined,
): Promise<ReportBody> {
  if (source == null)
    throw new Error("The contracts report source is not wired.");
  const ws = job.workspaceId;
  const projectId = job.projectId ?? "";
  const financial = job.includesMoney;
  switch (params.kind) {
    case "boq_vs_executed":
      return buildBoqExecutedReport({
        asOn: params.asOn,
        rows: await source.boqExecuted(ws, projectId, params.asOn),
        financial,
      });
    case "work_order_register":
      return buildWorkOrderRegister({
        rows: await source.workOrders(ws, projectId, params),
        financial,
      });
    case "contractor_bill_register":
    case "client_bill_register": {
      const side =
        params.kind === "contractor_bill_register" ? "contractor" : "client";
      return buildBillRegister({
        side,
        rows: await source.bills(ws, projectId, side, params),
        financial,
      });
    }
    case "deductions_register":
      return buildDeductionsRegister({
        rows: await source.deductions(ws, projectId, params),
      });
    case "retention_register": {
      const held = await source.retention(ws, projectId, params.asOn);
      return buildRetentionRegister({
        asOn: params.asOn,
        contractor: held.contractor,
        client: params.withClient ? held.client : null,
      });
    }
    case "material_reconciliation":
      return buildMaterialReconciliationReport({
        asOn: params.asOn,
        rows: await source.materialReconciliation(ws, projectId, params.asOn),
        financial,
      });
    case "variations_register":
      return buildVariationsRegister({
        rows: await source.variations(ws, projectId, params),
        financial,
      });
  }
}
