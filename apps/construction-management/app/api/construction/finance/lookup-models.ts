import { z } from "zod";

/** Who a Paid To / Received From label names (ADR CM-0017 §5). */
export const COUNTERPARTY_KINDS = [
  "contractor",
  "supplier",
  "other_party",
  "labour",
  "vendor",
  "team_member",
  "client",
] as const;
export type CounterpartyKindModel = (typeof COUNTERPARTY_KINDS)[number];

export const ConstructionFinanceNamedOptionModel = z
  .object({ id: z.uuid(), name: z.string() })
  .meta({ id: "ConstructionFinanceNamedOptionModel" });

export const GetConstructionFinancePaymentCategoryOptionsResponseModel = z
  .object({ items: z.array(ConstructionFinanceNamedOptionModel) })
  .meta({
    description:
      "The Company's Payment Categories that are live and not disabled, by name.",
  });
export type GetConstructionFinancePaymentCategoryOptionsResponseModel = z.infer<
  typeof GetConstructionFinancePaymentCategoryOptionsResponseModel
>;

export const GetConstructionFinanceCounterpartyOptionsRequestModel = z.object({
  kind: z.enum(COUNTERPARTY_KINDS),
  projectId: z.uuid().optional(),
});

export const GetConstructionFinanceCounterpartyOptionsResponseModel = z
  .object({ items: z.array(ConstructionFinanceNamedOptionModel) })
  .meta({
    description:
      "Live, active parties of a kind for the Paid To / Received From picker, by name; on the Project when given (Team Members are Company-wide).",
  });
export type GetConstructionFinanceCounterpartyOptionsResponseModel = z.infer<
  typeof GetConstructionFinanceCounterpartyOptionsResponseModel
>;
