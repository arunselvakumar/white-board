import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { z } from "zod";

import type {
  CreateConstructionContractsAdvanceRequestModel,
  CreateConstructionContractsBankGuaranteeRequestModel,
  CreateConstructionContractsRetentionReleaseRequestModel,
  GetConstructionContractsAdvancesRetentionResponseModel,
  UpdateConstructionContractsAdvanceRequestModel,
  UpdateConstructionContractsBankGuaranteeRequestModel,
} from "@/app/api/construction/contracts/advances/advance-models";

import { CONTRACTS_API, CONTRACTS_KEY } from "./contracts-access";
import { FINANCE_KEY } from "./finance-access";
import { apiJson } from "./http";

export type AdvancesRetention =
  GetConstructionContractsAdvancesRetentionResponseModel;
export type ContractAdvance = AdvancesRetention["advances"][number];
export type ContractGuarantee = AdvancesRetention["guarantees"][number];
export type RetentionRelease = AdvancesRetention["releases"][number];
export type AdvanceInput = z.input<
  typeof CreateConstructionContractsAdvanceRequestModel
>;
export type AdvanceUpdate = z.input<
  typeof UpdateConstructionContractsAdvanceRequestModel
>;
export type GuaranteeInput = z.input<
  typeof CreateConstructionContractsBankGuaranteeRequestModel
>;
export type GuaranteeUpdate = z.input<
  typeof UpdateConstructionContractsBankGuaranteeRequestModel
>;
export type ReleaseInput = z.input<
  typeof CreateConstructionContractsRetentionReleaseRequestModel
>;

/** A Work Order (contractor side), or the Project's client contract. */
export type ContractScope = { projectId: string; workOrderId: string | null };

/** Every advances-and-retention key starts here (CM-1108). */
export const ADVANCES_KEY = [...CONTRACTS_KEY, "advances"] as const;

/** A Work Order's or the client contract's advances, guarantees, retention and DLP. */
export function advancesRetentionQuery(scope: ContractScope) {
  return queryOptions({
    queryKey: [
      ...ADVANCES_KEY,
      scope.projectId,
      scope.workOrderId ?? "client",
    ] as const,
    queryFn: () =>
      apiJson<AdvancesRetention>(
        scope.workOrderId == null
          ? `${CONTRACTS_API}/client-bills/contract/advances-retention?projectId=${encodeURIComponent(scope.projectId)}`
          : `${CONTRACTS_API}/work-orders/${encodeURIComponent(scope.workOrderId)}/advances-retention`,
      ),
  });
}

export type AdvancesCommand =
  | { kind: "record-advance"; input: AdvanceInput }
  | { kind: "update-advance"; id: string; input: AdvanceUpdate }
  | { kind: "delete-advance"; id: string; expectedUpdatedAt: string }
  | { kind: "add-guarantee"; input: GuaranteeInput }
  | { kind: "update-guarantee"; id: string; input: GuaranteeUpdate }
  | {
      kind: "release-guarantee";
      id: string;
      releasedOn: string;
      expectedUpdatedAt: string;
    }
  | { kind: "delete-guarantee"; id: string; expectedUpdatedAt: string }
  | { kind: "release"; input: ReleaseInput }
  | { kind: "delete-release"; id: string; reason: string }
  | { kind: "completion"; completedOn: string };

function request(
  scope: ContractScope,
  command: AdvancesCommand,
): { path: string; body: unknown } {
  const contract = {
    projectId: scope.projectId,
    workOrderId: scope.workOrderId,
  };
  switch (command.kind) {
    case "record-advance":
      return {
        path: "/advances",
        body: { ...command.input, ...contract },
      };
    case "update-advance":
      return { path: `/advances/${command.id}/update`, body: command.input };
    case "delete-advance":
      return {
        path: `/advances/${command.id}/delete`,
        body: { expectedUpdatedAt: command.expectedUpdatedAt },
      };
    case "add-guarantee":
      return {
        path: "/guarantees",
        body: { ...command.input, ...contract },
      };
    case "update-guarantee":
      return { path: `/guarantees/${command.id}/update`, body: command.input };
    case "release-guarantee":
      return {
        path: `/guarantees/${command.id}/release`,
        body: {
          releasedOn: command.releasedOn,
          expectedUpdatedAt: command.expectedUpdatedAt,
        },
      };
    case "delete-guarantee":
      return {
        path: `/guarantees/${command.id}/delete`,
        body: { expectedUpdatedAt: command.expectedUpdatedAt },
      };
    case "release":
      return {
        path: "/retention-releases",
        body: { ...command.input, ...contract },
      };
    case "delete-release":
      return {
        path: `/retention-releases/${command.id}/delete`,
        body: { reason: command.reason },
      };
    case "completion":
      return {
        path: `/work-orders/${scope.workOrderId ?? ""}/completion`,
        body: { completedOn: command.completedOn },
      };
  }
}

/**
 * Every write on a contract's advances, guarantees and releases (CM-1108).
 * Each answers the contract's whole view, kept in the cache; bills (their
 * retention and recoveries), Work Orders (the completion date) and finance
 * (payments and invoices) are refreshed after.
 */
export function useAdvancesCommand(scope: ContractScope) {
  const client = useQueryClient();
  const key = advancesRetentionQuery(scope).queryKey;
  return useMutation({
    mutationFn: (command: AdvancesCommand) => {
      const { path, body } = request(scope, command);
      return apiJson<AdvancesRetention>(`${CONTRACTS_API}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    },
    onSuccess: async (view) => {
      client.setQueryData(key, view);
      await Promise.all([
        client.invalidateQueries({ queryKey: [...CONTRACTS_KEY] }),
        client.invalidateQueries({ queryKey: FINANCE_KEY }),
      ]);
    },
  });
}
