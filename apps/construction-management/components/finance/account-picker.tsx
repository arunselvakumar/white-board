"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Skeleton } from "@repo/ui/components/skeleton";

import {
  accountOptionsQuery,
  type AccountOption,
} from "@/src/queries/finance-accounts";

/** A payment mode as finance forms send it, or labour's and HRMS's Bank. */
export type AccountPickerMode = "cash" | "cheque" | "online" | "upi" | "bank";

/** Cash takes a Cash or petty-cash account; every other mode a Bank account (ADR CM-0017 §5). */
export function accountFitsMode(
  account: Pick<AccountOption, "kind">,
  mode: AccountPickerMode,
): boolean {
  return mode === "cash" ? account.kind !== "bank" : account.kind === "bank";
}

export function accountLabel(account: AccountOption): string {
  if (account.kind !== "petty_cash") return account.name;
  return account.isOwn
    ? `My petty cash (${account.holderName ?? account.name})`
    : `Petty cash — ${account.holderName ?? account.name}`;
}

/** The account a form starts with: the primary when it fits, else your own petty cash, else the first. */
export function defaultAccountId(
  accounts: readonly AccountOption[],
  mode: AccountPickerMode,
): string | null {
  const fitting = accounts.filter((account) => accountFitsMode(account, mode));
  return (
    fitting.find((account) => account.isPrimary)?.id ??
    fitting.find((account) => account.isOwn)?.id ??
    fitting[0]?.id ??
    null
  );
}

/**
 * The shared "paid from / received into" picker (ADR CM-0017 §2): company
 * accounts, then petty cash, filtered by the payment mode. When the mode
 * changes and the chosen account no longer fits, it moves to the default
 * for the new mode. Every money form uses this one.
 */
export function AccountPicker({
  id,
  value,
  onChange,
  mode,
  invalid = false,
  disabled = false,
  exclude,
}: {
  id: string;
  value: string;
  onChange: (accountId: string) => void;
  mode: AccountPickerMode;
  invalid?: boolean;
  disabled?: boolean;
  /** An account to leave out, e.g. the "from" account of a transfer. */
  exclude?: string;
}) {
  const query = useQuery(accountOptionsQuery());
  const accounts = (query.data?.items ?? []).filter(
    (account) => account.id !== exclude,
  );
  const fitting = accounts.filter((account) => accountFitsMode(account, mode));
  const fits = fitting.some((account) => account.id === value);

  useEffect(() => {
    if (query.data == null || fits) return;
    const next = defaultAccountId(accounts, mode);
    if (next != null && next !== value) onChange(next);
    if (next == null && value !== "") onChange("");
    // `accounts` is derived from `query.data`; listing it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, mode, fits, value, exclude]);

  if (query.isPending) return <Skeleton className="h-10 w-full" />;

  const company = fitting.filter((account) => account.kind !== "petty_cash");
  const petty = fitting.filter((account) => account.kind === "petty_cash");
  const items = fitting.map((account) => ({
    value: account.id,
    label: accountLabel(account),
  }));

  return (
    <Select
      items={items}
      value={fits ? value : null}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next);
      }}
      disabled={disabled || fitting.length === 0}
    >
      <SelectTrigger
        id={id}
        size="lg"
        className="w-full min-w-0"
        aria-invalid={invalid}
      >
        <SelectValue
          placeholder={
            fitting.length === 0
              ? mode === "cash"
                ? "No cash account you can use"
                : "No bank account yet"
              : "Choose an account"
          }
        />
      </SelectTrigger>
      <SelectContent
        align="start"
        alignItemWithTrigger={false}
        aria-label="Accounts"
      >
        {company.length > 0 && (
          <SelectGroup>
            <SelectLabel>Company accounts</SelectLabel>
            {company.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {accountLabel(account)}
                {account.isPrimary ? " · Primary" : ""}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {petty.length > 0 && (
          <SelectGroup>
            <SelectLabel>Petty cash</SelectLabel>
            {petty.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {accountLabel(account)}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}
