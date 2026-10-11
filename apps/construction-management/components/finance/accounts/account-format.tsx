import { cn } from "@repo/ui/lib/utils";

import { formatPaise } from "@/components/money/money-input";

/** `50100123456789` → `••••6789` (the last four only, on lists). */
export function maskAccountNumber(value: string | null): string | null {
  if (value == null || value === "") return null;
  return `••••${value.slice(-4)}`;
}

export const ACCOUNT_KIND_LABELS = {
  cash: "Cash",
  bank: "Bank",
  petty_cash: "Petty cash",
} as const;

export function bankAccountsPath(rest = ""): string {
  return `/app/masters/bank-accounts${rest}`;
}

/** A signed amount in rupees; a negative one is red (CM-0017 §2). */
export function SignedAmount({
  paise,
  className,
}: {
  paise: number;
  className?: string;
}) {
  return (
    <span
      className={cn("tabular-nums", paise < 0 && "text-destructive", className)}
    >
      {formatPaise(paise)}
    </span>
  );
}
