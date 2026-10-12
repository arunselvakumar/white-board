"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
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
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Skeleton } from "@repo/ui/components/skeleton";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import {
  MoneyInput,
  isRupees,
  rupeesToPaise,
} from "@/components/money/money-input";
import { localToday } from "@/components/payments/payment-format";
import { fieldForCode } from "@/lib/server-errors";
import { counterpartyOptionsQuery } from "@/src/queries/finance-lookups";
import {
  pettyCashAccountsQuery,
  useOpenPettyCashAccount,
  type PettyCashAccount,
} from "@/src/queries/finance-petty-cash";

const schema = z.object({
  holderMemberId: z.string().min(1, "Choose the Team Member"),
  name: z.string().trim().max(120, "Use at most 120 characters"),
  openingBalance: z
    .string()
    .refine((value) => value.trim() === "" || isRupees(value), {
      message: "Enter an amount like 5000 or 5000.50",
    }),
  openingDate: z.string(),
});

type Values = z.infer<typeof schema>;

const SERVER_FIELDS: Record<string, keyof Values> = {
  TEAM_MEMBER_NOT_FOUND: "holderMemberId",
  PETTY_CASH_ACCOUNT_EXISTS: "holderMemberId",
  ACCOUNT_NAME_TAKEN: "name",
  ACCOUNT_NAME_REQUIRED: "name",
  ACCOUNT_NAME_TOO_LONG: "name",
  AMOUNT_INVALID: "openingBalance",
  FINANCIAL_PERIOD_CLOSED: "openingDate",
};

/**
 * Open a Team Member's petty-cash account (CM-0017 §2): one each, named
 * "Petty cash — <member>" unless a name is typed, with an optional opening
 * balance as of a date. Members who already hold one are not offered.
 */
export function OpenAccountDialog({
  open,
  onOpenChange,
  onOpened,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpened?: (account: PettyCashAccount) => void;
}) {
  const id = useId();
  const members = useQuery({
    ...counterpartyOptionsQuery("team_member", null),
    enabled: open,
  });
  const accounts = useQuery({ ...pettyCashAccountsQuery(), enabled: open });
  const openAccount = useOpenPettyCashAccount();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      holderMemberId: "",
      name: "",
      openingBalance: "",
      openingDate: localToday(),
    },
  });
  const errors = form.formState.errors;
  const holderId = useWatch({ control: form.control, name: "holderMemberId" });
  const held = new Set(
    (accounts.data?.items ?? []).map((account) => account.holderMemberId),
  );
  const options = (members.data?.items ?? [])
    .filter((member) => !held.has(member.id))
    .map((member) => ({ value: member.id, label: member.name }));
  const holderName = options.find((item) => item.value === holderId)?.label;

  const close = () => {
    form.reset();
    openAccount.reset();
    onOpenChange(false);
  };

  const submit = form.handleSubmit(async (values) => {
    try {
      const account = await openAccount.mutateAsync({
        holderMemberId: values.holderMemberId,
        name: values.name.trim() === "" ? null : values.name.trim(),
        openingBalance: rupeesToPaise(values.openingBalance) ?? 0,
        openingDate: values.openingDate === "" ? null : values.openingDate,
      });
      onOpened?.(account);
      close();
    } catch (error) {
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
      form.setError(field ?? "root", { message });
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else close();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <form
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>Open petty-cash account</DialogTitle>
            <DialogDescription>
              One account per Team Member. Only approved vouchers move its
              balance.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-holder`}>Team Member</Label>
            {members.isPending || accounts.isPending ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <Controller
                control={form.control}
                name="holderMemberId"
                render={({ field }) => (
                  <Select
                    items={options}
                    value={field.value === "" ? null : field.value}
                    onValueChange={(next) => {
                      if (typeof next === "string") field.onChange(next);
                    }}
                    disabled={options.length === 0}
                  >
                    <SelectTrigger
                      id={`${id}-holder`}
                      size="lg"
                      className="w-full min-w-0"
                      aria-invalid={errors.holderMemberId != null}
                    >
                      <SelectValue
                        placeholder={
                          options.length === 0
                            ? "Every Team Member has an account"
                            : "Choose a Team Member"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent align="start" alignItemWithTrigger={false}>
                      {options.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            )}
            <FieldError message={errors.holderMemberId?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-name`}>Account name (optional)</Label>
            <Input
              id={`${id}-name`}
              autoComplete="off"
              placeholder={`Petty cash — ${holderName ?? "Team Member"}`}
              aria-invalid={errors.name != null}
              {...form.register("name")}
            />
            <FieldError message={errors.name?.message} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-opening`}>Opening balance</Label>
              <MoneyInput
                id={`${id}-opening`}
                placeholder="0"
                aria-invalid={errors.openingBalance != null}
                {...form.register("openingBalance")}
              />
              <FieldError message={errors.openingBalance?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-date`}>As of</Label>
              <Input
                id={`${id}-date`}
                type="date"
                aria-invalid={errors.openingDate != null}
                {...form.register("openingDate")}
              />
              <FieldError message={errors.openingDate?.message} />
            </div>
          </div>
          <FormAlert message={errors.root?.message} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              Open account
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
