import type { ApiCall } from "../../.storybook/mocks/api";
import type { AccountOption } from "@/src/queries/finance-accounts";

/** The account picker's options, as `/api/construction/finance/accounts/options` returns them. */
export const ACCOUNT_OPTIONS: AccountOption[] = [
  {
    id: "0199a000-0000-7000-8000-000000000001",
    name: "Company's Cash Account",
    kind: "cash",
    isPrimary: true,
    holderMemberId: null,
    holderName: null,
    isOwn: false,
  },
  {
    id: "0199a000-0000-7000-8000-000000000002",
    name: "HDFC Current A/c",
    kind: "bank",
    isPrimary: false,
    holderMemberId: null,
    holderName: null,
    isOwn: false,
  },
  {
    id: "0199a000-0000-7000-8000-000000000003",
    name: "Petty cash — Ravi Kumar",
    kind: "petty_cash",
    isPrimary: false,
    holderMemberId: "0199a000-0000-7000-8000-0000000000a1",
    holderName: "Ravi Kumar",
    isOwn: true,
  },
];

export function accountOptionsHandler(
  call: ApiCall,
  items: AccountOption[] = ACCOUNT_OPTIONS,
): Response | undefined {
  if (
    call.method === "GET" &&
    call.path.startsWith("/api/construction/finance/accounts/options")
  )
    return Response.json({ items });
  return undefined;
}

export const PAYMENT_CATEGORY_OPTIONS = [
  { id: "0199a000-0000-7000-8000-0000000000c1", name: "Conveyance" },
  { id: "0199a000-0000-7000-8000-0000000000c2", name: "Fuel" },
  { id: "0199a000-0000-7000-8000-0000000000c3", name: "Site Expenses" },
];

export const COUNTERPARTY_OPTIONS: Record<
  string,
  { id: string; name: string }[]
> = {
  contractor: [
    {
      id: "0199a000-0000-7000-8000-0000000000d1",
      name: "Sri Murugan Builders",
    },
  ],
  supplier: [
    { id: "0199a000-0000-7000-8000-0000000000d2", name: "Chennai Cements" },
  ],
  team_member: [
    { id: "0199a000-0000-7000-8000-0000000000a1", name: "Ravi Kumar" },
  ],
};

/**
 * Answers the shared finance lookups: accounts, Payment Categories and
 * Paid To / Received From options.
 */
export function financeLookupsHandler(call: ApiCall): Response | undefined {
  if (call.method !== "GET") return undefined;
  if (call.path.startsWith("/api/construction/finance/accounts/options"))
    return Response.json({ items: ACCOUNT_OPTIONS });
  if (
    call.path.startsWith("/api/construction/finance/payment-categories/options")
  )
    return Response.json({ items: PAYMENT_CATEGORY_OPTIONS });
  if (
    call.path.startsWith("/api/construction/finance/counterparties/options")
  ) {
    const kind =
      new URL(call.path, "http://storybook.local").searchParams.get("kind") ??
      "";
    return Response.json({ items: COUNTERPARTY_OPTIONS[kind] ?? [] });
  }
  return undefined;
}
