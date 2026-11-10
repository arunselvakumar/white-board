import { Badge } from "@repo/ui/components/badge";
import { cn } from "@repo/ui/lib/utils";

import { formatPaise } from "@/components/money/money-input";
import { VOUCHER_TYPE_LABELS } from "@/src/finance/domain/petty-cash";
import type {
  PettyCashVoucher,
  VoucherType,
} from "@/src/queries/finance-petty-cash";
import type { ApprovalStatus } from "@/src/shared-kernel/approval";

export { VOUCHER_TYPE_LABELS };

export const APPROVAL_LABELS: Record<ApprovalStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

/** `/app/projects/<id>/payments/petty-cash[/rest]`. */
export function pettyCashPath(projectId: string, rest = ""): string {
  return `/app/projects/${encodeURIComponent(projectId)}/payments/petty-cash${rest}`;
}

export function VoucherStatusBadge({ status }: { status: ApprovalStatus }) {
  return (
    <Badge
      variant={
        status === "approved"
          ? "default"
          : status === "rejected"
            ? "destructive"
            : "secondary"
      }
    >
      {APPROVAL_LABELS[status]}
    </Badge>
  );
}

/** Money with its sign's colour: a negative balance shows red (CM-0017 §2). */
export function Amount({
  paise,
  signed = false,
  className,
}: {
  paise: number;
  /** "+" before money in. */
  signed?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("tabular-nums", paise < 0 && "text-destructive", className)}
    >
      {signed && paise > 0 ? "+" : ""}
      {formatPaise(paise)}
    </span>
  );
}

/** What a voucher does to its own account: − out, + in. */
export function voucherSign(type: VoucherType): -1 | 1 {
  return type === "receipt" ? 1 : -1;
}

/** "Sri Murugan Fuels", "To Company's Cash Account", or a dash. */
export function voucherParty(voucher: PettyCashVoucher): string {
  if (voucher.voucherType === "transfer")
    return `To ${voucher.toAccountName ?? "another account"}`;
  return voucher.counterparty.name ?? "—";
}

/** "Payment · Fuel" under a voucher's number. */
export function voucherSummary(voucher: PettyCashVoucher): string {
  const type = VOUCHER_TYPE_LABELS[voucher.voucherType];
  return voucher.paymentCategoryName == null
    ? type
    : `${type} · ${voucher.paymentCategoryName}`;
}
