"use client";

import { useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
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
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";

import { accountLabel } from "@/components/finance/account-picker";
import { accountOptionsQuery } from "@/src/queries/finance-accounts";

import {
  MODE_LABELS,
  MODES,
  type PaymentModeValue,
} from "./transaction-format";

/** Cash / Cheque / Online / UPI. */
export function ModeToggle({
  labelledBy,
  value,
  onChange,
}: {
  labelledBy: string;
  value: PaymentModeValue;
  onChange: (mode: PaymentModeValue) => void;
}) {
  return (
    <ToggleGroup
      aria-labelledby={labelledBy}
      variant="outline"
      className="w-full"
      value={[value]}
      onValueChange={(next: string[]) => {
        const mode = next[0];
        if (mode != null && mode in MODE_LABELS)
          onChange(mode as PaymentModeValue);
      }}
    >
      {MODES.map((mode) => (
        <ToggleGroupItem key={mode} value={mode} className="flex-1">
          {MODE_LABELS[mode]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/**
 * 409 `DUPLICATE_REFERENCE` (ADR CM-0017 §5): the reference is already on
 * another document of the account. "Save anyway" sends it again with the
 * confirmation.
 */
export function DuplicateReferenceAlert({
  message,
  busy,
  onConfirm,
}: {
  message: string;
  busy: boolean;
  onConfirm: () => void;
}) {
  return (
    <Alert>
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>Reference already used</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>{message}</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={onConfirm}
        >
          Save anyway
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/** Any account the viewer can name as the destination of a transfer. */
export function ToAccountSelect({
  id,
  value,
  onChange,
  exclude,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (accountId: string) => void;
  exclude: string;
  invalid: boolean;
}) {
  const query = useQuery(accountOptionsQuery());
  if (query.isPending) return <Skeleton className="h-10 w-full" />;
  const accounts = (query.data?.items ?? []).filter(
    (account) => account.id !== exclude,
  );
  const company = accounts.filter((account) => account.kind !== "petty_cash");
  const petty = accounts.filter((account) => account.kind === "petty_cash");
  const items = accounts.map((account) => ({
    value: account.id,
    label: accountLabel(account),
  }));
  return (
    <Select
      items={items}
      value={accounts.some((account) => account.id === value) ? value : null}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next);
      }}
    >
      <SelectTrigger
        id={id}
        size="lg"
        className="w-full min-w-0"
        aria-invalid={invalid}
      >
        <SelectValue placeholder="Choose an account" />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        {company.length > 0 && (
          <SelectGroup>
            <SelectLabel>Company accounts</SelectLabel>
            {company.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {accountLabel(account)}
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
