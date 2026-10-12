import { z } from "zod";

/** Which accounts fit a payment mode (ADR CM-0017 §5); `bank` is labour's and HRMS's Bank. */
export const FINANCE_ACCOUNT_OPTION_MODES = [
  "cash",
  "cheque",
  "online",
  "upi",
  "bank",
] as const;

export const GetConstructionFinanceAccountOptionsRequestModel = z.object({
  mode: z.enum(FINANCE_ACCOUNT_OPTION_MODES).optional(),
});

export const ConstructionFinanceAccountOptionModel = z
  .object({
    id: z.uuid(),
    name: z.string(),
    kind: z.enum(["cash", "bank", "petty_cash"]),
    isPrimary: z.boolean(),
    holderMemberId: z.uuid().nullable(),
    holderName: z.string().nullable(),
    isOwn: z.boolean(),
  })
  .meta({ id: "ConstructionFinanceAccountOptionModel" });

export const GetConstructionFinanceAccountOptionsResponseModel = z
  .object({ items: z.array(ConstructionFinanceAccountOptionModel) })
  .meta({
    description:
      "Accounts the caller may pay from or receive into, for the account picker: every company account, and their own petty cash (every petty-cash account with Petty Cash View all). Filtered by mode when given: Cash → Cash and petty cash; Cheque, Online, UPI, Bank → Bank.",
  });
export type GetConstructionFinanceAccountOptionsResponseModel = z.infer<
  typeof GetConstructionFinanceAccountOptionsResponseModel
>;
