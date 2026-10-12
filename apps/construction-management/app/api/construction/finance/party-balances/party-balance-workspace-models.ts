import { z } from "zod";

import type { WorkspacePartyBalances } from "@/src/finance/application/party-queries";

import { Paise, PartyTypeModel, money } from "../parties/party-shared-models";

export const PARTY_BALANCES_PATH = "/api/construction/finance/party-balances";

export const ListConstructionFinanceWorkspacePartyBalancesRequestModel =
  z.object({
    /** Other Parties by default (Workspace → Party Balance, CM-708). */
    partyType: PartyTypeModel.optional(),
  });

export const ListConstructionFinanceWorkspacePartyBalancesResponseModel =
  z.object({
    partyType: PartyTypeModel,
    items: z.array(
      z.object({
        party: z.object({
          type: PartyTypeModel,
          id: z.uuid(),
          name: z.string().nullable(),
        }),
        /** Paise: + the Company owes the party; − the party owes the Company. */
        balance: Paise,
        projects: z.array(
          z.object({
            id: z.uuid(),
            name: z.string().nullable(),
            balance: Paise,
          }),
        ),
      }),
    ),
    totals: z.object({
      /** Σ of the positive balances. */
      owedByCompany: Paise,
      /** Σ of the negative balances, as a positive amount. */
      owedToCompany: Paise,
      net: Paise,
    }),
  });
export type ListConstructionFinanceWorkspacePartyBalancesResponse = z.infer<
  typeof ListConstructionFinanceWorkspacePartyBalancesResponseModel
>;

export function toWorkspacePartyBalancesResponse(
  balances: WorkspacePartyBalances,
): ListConstructionFinanceWorkspacePartyBalancesResponse {
  return {
    partyType: balances.partyType,
    items: balances.items.map((item) => ({
      party: {
        type: balances.partyType,
        id: item.partyId,
        name: item.partyName,
      },
      balance: money(item.balance),
      projects: item.projects.map((project) => ({
        id: project.projectId,
        name: project.projectName,
        balance: money(project.balance),
      })),
    })),
    totals: {
      owedByCompany: money(balances.totals.owedByCompany),
      owedToCompany: money(balances.totals.owedToCompany),
      net: money(balances.totals.net),
    },
  };
}
