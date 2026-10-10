import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  CalculateConstructionHrmsSalariesResponseModel,
  ConstructionHrmsSalarySlipModel,
  ConstructionHrmsSalarySlipsResponseModel,
  ListConstructionHrmsMySalariesResponseModel,
  ListConstructionHrmsTeamSalariesResponseModel,
} from "@/app/api/construction/hrms/salaries/salary-models";

import { HRMS_KEY } from "./hrms-settings";
import { apiJson, QueryHttpError } from "./http";

/**
 * Salary runs (CM-316, CM-317). Every key is under `[...HRMS_KEY,
 * "salary"]`, so one invalidation after a write refreshes Team Salary and
 * My Salary together.
 */
export const SALARY_KEY = [...HRMS_KEY, "salary"] as const;

const BASE = "/api/construction/hrms/salaries";

export type SalarySlipModel = ConstructionHrmsSalarySlipModel;
export type TeamSalaries = ListConstructionHrmsTeamSalariesResponseModel;
export type MySalaries = ListConstructionHrmsMySalariesResponseModel;
export type SkippedSalaryMember = TeamSalaries["skipped"][number];
export type CalculateSalariesResult =
  CalculateConstructionHrmsSalariesResponseModel;

/** Team Salary for a month; null when the caller lacks View All (403). */
export function teamSalariesQuery(month: string) {
  return queryOptions({
    queryKey: [...SALARY_KEY, "team", month],
    queryFn: async (): Promise<TeamSalaries | null> => {
      try {
        return await apiJson<TeamSalaries>(
          `${BASE}?month=${encodeURIComponent(month)}`,
        );
      } catch (error) {
        if (error instanceof QueryHttpError && error.status === 403)
          return null;
        throw error;
      }
    },
  });
}

export const mySalariesQuery = queryOptions({
  queryKey: [...SALARY_KEY, "my"],
  queryFn: () => apiJson<MySalaries>(`${BASE}/my`),
});

/** The payslip PDF; `inline` opens it in the browser instead of saving it. */
export function payslipUrl(id: string, inline = false): string {
  return `${BASE}/${id}/payslip${inline ? "?inline=1" : ""}`;
}

/** The team salary workbook for a month. */
export function teamSalaryReportUrl(month: string): string {
  return `${BASE}/report/team?month=${encodeURIComponent(month)}`;
}

/** The PF ECR of an approved month (CM-320): the EPFO text file or Excel. */
export function pfReturnUrl(month: string, format: "txt" | "xlsx"): string {
  return `${BASE}/exports/pf?month=${encodeURIComponent(month)}&format=${format}`;
}

/** The ESIC monthly contribution workbook of an approved month (CM-320). */
export function esiReturnUrl(month: string): string {
  return `${BASE}/exports/esi?month=${encodeURIComponent(month)}`;
}

type Version = Pick<SalarySlipModel, "id" | "updatedAt">;

const versions = (slips: readonly Version[]) =>
  slips.map((slip) => ({ id: slip.id, expectedUpdatedAt: slip.updatedAt }));

export type SalaryCommand =
  | { kind: "calculate"; month: string; memberIds?: string[] }
  | { kind: "recalculate"; slip: Version }
  | { kind: "approve"; slips: readonly Version[] }
  | {
      kind: "mark-paid";
      slips: readonly Version[];
      mode: "cash" | "bank";
      paymentDate: string;
      reference: string | null;
    }
  | {
      kind: "advance";
      memberId: string;
      amount: number;
      instalments: number;
      advanceDate: string;
      mode: "cash" | "bank";
      reference: string | null;
      reason: string | null;
    };

export type SalaryCommandResult =
  | CalculateSalariesResult
  | SalarySlipModel
  | ConstructionHrmsSalarySlipsResponseModel;

function postJson<T>(path: string, body: unknown): Promise<T> {
  return apiJson<T>(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function runSalaryCommand(
  command: SalaryCommand,
): Promise<SalaryCommandResult> {
  switch (command.kind) {
    case "calculate":
      return postJson("/calculate-bulk", {
        month: command.month,
        memberIds: command.memberIds ?? null,
      });
    case "recalculate":
      return postJson("/recalculate", {
        id: command.slip.id,
        expectedUpdatedAt: command.slip.updatedAt,
      });
    case "approve":
      return postJson("/approve", { slips: versions(command.slips) });
    case "mark-paid":
      return postJson("/mark-paid", {
        slips: versions(command.slips),
        mode: command.mode,
        paymentDate: command.paymentDate,
        reference: command.reference,
      });
    case "advance":
      return postJson("/calculate-advance", {
        memberId: command.memberId,
        amount: command.amount,
        instalments: command.instalments,
        advanceDate: command.advanceDate,
        mode: command.mode,
        reference: command.reference,
        reason: command.reason,
      });
  }
}

/** Runs a salary command and refreshes every salary read. */
export function useSalaryCommand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runSalaryCommand,
    onSettled: () => queryClient.invalidateQueries({ queryKey: SALARY_KEY }),
  });
}
