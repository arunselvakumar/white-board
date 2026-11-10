import { Badge } from "@repo/ui/components/badge";

import type { RegisterItem } from "@/src/queries/finance-transactions";

export const MODE_LABELS = {
  cash: "Cash",
  cheque: "Cheque",
  online: "Online",
  upi: "UPI",
} as const;

export type PaymentModeValue = keyof typeof MODE_LABELS;

export const MODES = Object.keys(MODE_LABELS) as PaymentModeValue[];

export const DIRECTION_LABELS = {
  payment_in: "Payment In",
  payment_out: "Payment Out",
} as const;

export const STATUS_LABELS = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
} as const;

export type ApprovalStatusValue = keyof typeof STATUS_LABELS;

/** The Pending / Approved / Rejected chip. */
export function ApprovalChip({ status }: { status: ApprovalStatusValue }) {
  if (status === "approved")
    return (
      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
        Approved
      </Badge>
    );
  if (status === "rejected")
    return <Badge variant="destructive">Rejected</Badge>;
  return (
    <Badge
      variant="outline"
      className="border-amber-400 text-amber-800 dark:text-amber-300"
    >
      Pending
    </Badge>
  );
}

export function transactionsPath(projectId: string, rest = ""): string {
  return `/app/projects/${encodeURIComponent(projectId)}/payments/transactions${rest}`;
}

/** The detail page of a register row. */
export function itemPath(projectId: string, item: RegisterItem): string {
  return item.type === "transaction"
    ? transactionsPath(projectId, `/${item.id}`)
    : transactionsPath(projectId, `/transfers/${item.id}`);
}

/** The date a register row is dated. */
export function itemDate(item: RegisterItem): string {
  return item.type === "transaction" ? item.transactionDate : item.transferDate;
}

/** "Payment Out", "Payment In" or "Transfer". */
export function itemKind(item: RegisterItem): string {
  return item.type === "transaction"
    ? DIRECTION_LABELS[item.direction]
    : "Transfer";
}

/** The account(s) a row moves money through. */
export function itemAccounts(item: RegisterItem): string {
  if (item.type === "transaction") return item.account.name ?? "—";
  return `${item.fromAccount.name ?? "—"} → ${item.toAccount.name ?? "—"}`;
}

/** Mode and its cheque number or reference. */
export function itemMode(item: RegisterItem): string {
  const reference =
    item.type === "transaction"
      ? (item.chequeNumber ?? item.reference)
      : item.reference;
  return reference == null
    ? MODE_LABELS[item.mode]
    : `${MODE_LABELS[item.mode]} · ${reference}`;
}

/** Who the money went to or came from. */
export function itemParty(item: RegisterItem): string | null {
  return item.type === "transaction" ? (item.counterparty?.name ?? null) : null;
}
