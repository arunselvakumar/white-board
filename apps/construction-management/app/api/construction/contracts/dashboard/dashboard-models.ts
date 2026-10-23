import { z } from "zod";

import type {
  ContractsDashboard,
  ContractsDashboardSide,
} from "@/src/composition/contracts-dashboard";

export const CONTRACTS_DASHBOARD_PATH = "/api/construction/contracts/dashboard";

export const GetConstructionContractsDashboardRequestModel = z.object({
  projectId: z.uuid(),
});

const money = (description: string, menu: string) =>
  z
    .int()
    .nullable()
    .describe(`Paise: ${description} Null without ${menu} Financial.`);

const side = (menu: string, due: string) =>
  z.object({
    billedToDate: money(
      "Σ gross of the approved RA bills, as the list's totals (escalation bills not counted).",
      menu,
    ),
    outstanding: money(
      `${due} on the invoices of the approved bills and retention releases, after payments, TDS and write-offs.`,
      menu,
    ),
    retentionHeld: money(
      "retention on approved bills less releases, as the list shows it.",
      menu,
    ),
    pendingApproval: z
      .int()
      .nonnegative()
      .describe("RA and escalation bills pending approval."),
  });

export const GetConstructionContractsDashboardResponseModel = z
  .object({
    projectId: z.uuid(),
    boq: z
      .object({
        value: money(
          "the BOQ total (quantity × rate, after Variations).",
          "BOQ",
        ),
      })
      .nullable()
      .describe("Null without BOQ read."),
    client: side("Client Bills", "receivable from the Client")
      .nullable()
      .describe("Null without Client Bills read."),
    contractor: side("Contractor Bills", "payable to Contractors")
      .nullable()
      .describe("Null without Contractor Bills read."),
    workOrders: z
      .object({
        open: z.int().nonnegative().describe("Issued Work Orders."),
      })
      .nullable()
      .describe("Null without Work Order read."),
  })
  .meta({
    description:
      "The Project Dashboard's Contracts section (CM-1111): a snapshot as on today, not the dashboard duration.",
  });
export type GetConstructionContractsDashboardResponseModel = z.infer<
  typeof GetConstructionContractsDashboardResponseModel
>;

const paise = (value: bigint | null): number | null => {
  if (value == null) return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number))
    throw new Error("A contracts figure is beyond a safe integer.");
  return number;
};

function sideOf(value: ContractsDashboardSide | null) {
  return value == null
    ? null
    : {
        billedToDate: paise(value.billedToDate),
        outstanding: paise(value.outstanding),
        retentionHeld: paise(value.retentionHeld),
        pendingApproval: value.pendingApproval,
      };
}

export function toContractsDashboardResponse(
  projectId: string,
  dashboard: ContractsDashboard,
): GetConstructionContractsDashboardResponseModel {
  return {
    projectId,
    boq: dashboard.boq == null ? null : { value: paise(dashboard.boq.value) },
    client: sideOf(dashboard.client),
    contractor: sideOf(dashboard.contractor),
    workOrders: dashboard.workOrders,
  };
}
