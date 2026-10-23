"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useId } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label, RequiredIndicator } from "@repo/ui/components/label";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import {
  isRupees,
  MoneyInput,
  paiseToRupees,
  rupeesToPaise,
} from "@/components/money/money-input";
import { localToday } from "@/components/payments/payment-format";
import { fieldForCode } from "@/lib/server-errors";
import {
  useAccountCommand,
  type CompanyAccount,
} from "@/src/queries/finance-accounts";

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

function schema(today: string) {
  return z.object({
    kind: z.enum(["cash", "bank"]),
    name: z
      .string()
      .trim()
      .min(1, "Enter the account name")
      .max(120, "Use at most 120 characters"),
    bankName: z.string().trim().max(120, "Use at most 120 characters"),
    accountNumber: z
      .string()
      .trim()
      .refine(
        (value) =>
          value === "" ||
          /^[A-Za-z0-9]{4,30}$/.test(value.replace(/[\s-]/g, "")),
        "Letters and digits only",
      ),
    ifsc: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || IFSC_RE.test(value.toUpperCase()),
        "Four letters, a zero, then six letters or digits (like HDFC0001234)",
      ),
    branch: z.string().trim().max(120, "Use at most 120 characters"),
    openingBalance: z
      .string()
      .refine(
        (value) => value.trim() === "" || isRupees(value, true),
        "Enter an amount in rupees, like 25000 or -1500.50",
      ),
    openingDate: z
      .string()
      .min(1, "Enter the opening date")
      .refine(
        (value) => value <= today,
        "The opening date cannot be after today",
      ),
  });
}

type Values = z.infer<ReturnType<typeof schema>>;

const SERVER_FIELDS: Record<string, keyof Values> = {
  ACCOUNT_NAME_REQUIRED: "name",
  ACCOUNT_NAME_TAKEN: "name",
  IFSC_INVALID: "ifsc",
  ACCOUNT_NUMBER_INVALID: "accountNumber",
  BANK_FIELDS_NOT_ALLOWED: "bankName",
  AMOUNT_TOO_LARGE: "openingBalance",
  OPENING_DATE_IN_FUTURE: "openingDate",
  FINANCIAL_PERIOD_CLOSED: "openingDate",
  DATE_INVALID: "openingDate",
};

/**
 * Add a company Cash or Bank account, or edit one (CM-701): name, bank
 * details for a Bank account, and the opening balance and date. A changed
 * opening is posted as a reversal plus a new entry by the server.
 */
export function AccountDialog({
  account,
  onClose,
  today = localToday(),
}: {
  /** Null to add. */
  account: CompanyAccount | null;
  onClose: () => void;
  today?: string;
}) {
  const id = useId();
  const command = useAccountCommand();
  const form = useForm<Values>({
    resolver: zodResolver(schema(today)),
    defaultValues: {
      kind: account?.kind ?? "bank",
      name: account?.name ?? "",
      bankName: account?.bankName ?? "",
      accountNumber: account?.accountNumber ?? "",
      ifsc: account?.ifsc ?? "",
      branch: account?.branch ?? "",
      openingBalance:
        account == null ? "0" : paiseToRupees(account.openingBalance),
      openingDate: account?.openingDate ?? today,
    },
  });
  const kind = useWatch({ control: form.control, name: "kind" });
  const errors = form.formState.errors;

  const submit = form.handleSubmit(async (values) => {
    const bank = values.kind === "bank";
    const input = {
      name: values.name,
      bankName: bank ? values.bankName : null,
      accountNumber: bank ? values.accountNumber : null,
      ifsc: bank ? values.ifsc.toUpperCase() : null,
      branch: bank ? values.branch : null,
      openingBalance: rupeesToPaise(values.openingBalance) ?? 0,
      openingDate: values.openingDate,
    };
    try {
      await command.mutateAsync(
        account == null
          ? { kind: "create", input: { ...input, kind: values.kind } }
          : {
              kind: "update",
              id: account.id,
              input: { ...input, expectedUpdatedAt: account.updatedAt },
            },
      );
      onClose();
    } catch (error) {
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
      form.setError(field ?? "root", { message });
    }
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[92vh] flex-col sm:max-w-2xl">
        <form
          noValidate
          className="flex min-h-0 flex-col gap-5"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {account == null ? "Add account" : `Edit ${account.name}`}
            </DialogTitle>
            <DialogDescription>
              A company cash box or bank account money is paid from and received
              into.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 space-y-4 overflow-y-auto">
            <div className="space-y-1.5">
              <span id={`${id}-kind`} className="text-sm font-medium">
                Account type
                <RequiredIndicator />
              </span>
              <Controller
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <ToggleGroup
                    aria-labelledby={`${id}-kind`}
                    variant="outline"
                    className="w-full sm:w-72"
                    value={[field.value]}
                    disabled={account != null}
                    onValueChange={(value: string[]) => {
                      const next = value[0];
                      if (next === "cash" || next === "bank")
                        field.onChange(next);
                    }}
                  >
                    <ToggleGroupItem value="cash" className="flex-1">
                      Cash Account
                    </ToggleGroupItem>
                    <ToggleGroupItem value="bank" className="flex-1">
                      Bank Account
                    </ToggleGroupItem>
                  </ToggleGroup>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-name`} required>
                Account name
              </Label>
              <Input
                id={`${id}-name`}
                className="h-10"
                autoComplete="off"
                placeholder={kind === "bank" ? "HDFC Current A/c" : "Site cash"}
                aria-required
                aria-invalid={errors.name != null}
                {...form.register("name")}
              />
              <FieldError message={errors.name?.message} />
            </div>
            {kind === "bank" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`${id}-bank`}>Bank name</Label>
                  <Input
                    id={`${id}-bank`}
                    className="h-10"
                    aria-invalid={errors.bankName != null}
                    {...form.register("bankName")}
                  />
                  <FieldError message={errors.bankName?.message} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${id}-number`}>Account number</Label>
                  <Input
                    id={`${id}-number`}
                    className="h-10"
                    inputMode="numeric"
                    autoComplete="off"
                    aria-invalid={errors.accountNumber != null}
                    {...form.register("accountNumber")}
                  />
                  <FieldError message={errors.accountNumber?.message} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${id}-ifsc`}>IFSC</Label>
                  <Input
                    id={`${id}-ifsc`}
                    className="h-10 uppercase"
                    autoComplete="off"
                    placeholder="HDFC0001234"
                    aria-invalid={errors.ifsc != null}
                    {...form.register("ifsc")}
                  />
                  <FieldError message={errors.ifsc?.message} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${id}-branch`}>Branch</Label>
                  <Input
                    id={`${id}-branch`}
                    className="h-10"
                    aria-invalid={errors.branch != null}
                    {...form.register("branch")}
                  />
                  <FieldError message={errors.branch?.message} />
                </div>
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-opening`}>Opening balance</Label>
                <MoneyInput
                  id={`${id}-opening`}
                  className="h-10"
                  aria-invalid={errors.openingBalance != null}
                  {...form.register("openingBalance")}
                />
                <p className="text-muted-foreground text-xs">
                  Negative for an overdraft.
                </p>
                <FieldError message={errors.openingBalance?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-opening-date`} required>
                  As of
                </Label>
                <Input
                  id={`${id}-opening-date`}
                  type="date"
                  className="h-10"
                  max={today}
                  aria-required
                  aria-invalid={errors.openingDate != null}
                  {...form.register("openingDate")}
                />
                <FieldError message={errors.openingDate?.message} />
              </div>
            </div>
          </div>
          <FormAlert message={errors.root?.message} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={command.isPending}>
              {command.isPending
                ? "Saving…"
                : account == null
                  ? "Add account"
                  : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
