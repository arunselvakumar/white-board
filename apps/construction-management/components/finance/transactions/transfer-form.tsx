"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
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
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { AccountPicker } from "@/components/finance/account-picker";
import {
  isRupees,
  MoneyInput,
  paiseToRupees,
  rupeesToPaise,
} from "@/components/money/money-input";
import { localToday } from "@/components/payments/payment-format";
import { fieldForCode } from "@/lib/server-errors";
import {
  useTransactionCommand,
  type Transfer,
} from "@/src/queries/finance-transactions";
import { QueryHttpError } from "@/src/queries/http";

import {
  DuplicateReferenceAlert,
  ModeToggle,
  ToAccountSelect,
} from "./transaction-form-parts";
import type { PaymentModeValue } from "./transaction-format";

const schema = z
  .object({
    transferDate: z.string().min(1, "Enter the date"),
    mode: z.enum(["cash", "cheque", "online", "upi"]),
    fromAccountId: z.string().min(1, "Choose the account the money leaves"),
    toAccountId: z.string().min(1, "Choose the account the money goes to"),
    reference: z.string().trim().max(60, "Use at most 60 characters"),
    amount: z
      .string()
      .refine(
        (value) => isRupees(value) && (rupeesToPaise(value) ?? 0) > 0,
        "Enter an amount above zero, like 1500.50",
      ),
    description: z.string().max(1000, "Use at most 1000 characters"),
  })
  .superRefine((values, context) => {
    if (values.mode !== "cash" && values.reference === "")
      context.addIssue({
        code: "custom",
        path: ["reference"],
        message:
          values.mode === "cheque"
            ? "Enter the cheque number"
            : "Enter the transaction reference",
      });
    if (
      values.fromAccountId !== "" &&
      values.fromAccountId === values.toAccountId
    )
      context.addIssue({
        code: "custom",
        path: ["toAccountId"],
        message: "Choose two different accounts",
      });
  });

type Values = z.infer<typeof schema>;

const SERVER_FIELDS: Record<string, keyof Values> = {
  ACCOUNT_MODE_MISMATCH: "fromAccountId",
  ACCOUNT_NOT_YOURS: "fromAccountId",
  ACCOUNT_NOT_FOUND: "toAccountId",
  TRANSFER_SAME_ACCOUNT: "toAccountId",
  CHEQUE_NUMBER_REQUIRED: "reference",
  REFERENCE_REQUIRED: "reference",
  AMOUNT_INVALID: "amount",
  AMOUNT_TOO_LARGE: "amount",
  DATE_INVALID: "transferDate",
  BACKDATED_CREATE_BLOCKED: "transferDate",
  BACKDATED_EDIT_BLOCKED: "transferDate",
  FINANCIAL_PERIOD_CLOSED: "transferDate",
};

/**
 * Transfer money between two accounts (CM-702): company to company,
 * company to a holder's petty cash, or petty cash back. The mode must fit
 * the account the money leaves. Approval moves both balances.
 */
export function TransferDialog({
  projectId,
  transfer,
  canApprove,
  onClose,
  onSaved,
  today = localToday(),
}: {
  projectId: string;
  transfer: Transfer | null;
  canApprove: boolean;
  onClose: () => void;
  onSaved?: (transfer: Transfer) => void;
  today?: string;
}) {
  const id = useId();
  const command = useTransactionCommand();
  const [duplicate, setDuplicate] = useState<{
    message: string;
    approve: boolean;
  } | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      transferDate: transfer?.transferDate ?? today,
      mode: transfer?.mode ?? "cash",
      fromAccountId: transfer?.fromAccount.id ?? "",
      toAccountId: transfer?.toAccount.id ?? "",
      reference: transfer?.reference ?? "",
      amount: transfer == null ? "" : paiseToRupees(transfer.amount),
      description: transfer?.description ?? "",
    },
  });
  const errors = form.formState.errors;
  const mode = useWatch({ control: form.control, name: "mode" });
  const from = useWatch({ control: form.control, name: "fromAccountId" });

  const save = (approve: boolean, confirm: boolean) =>
    form.handleSubmit(async (values) => {
      setDuplicate(null);
      const body = {
        transferDate: values.transferDate,
        fromAccountId: values.fromAccountId,
        toAccountId: values.toAccountId,
        mode: values.mode,
        reference: values.mode === "cash" ? null : values.reference,
        amount: rupeesToPaise(values.amount) ?? 0,
        description: values.description,
        approve,
        confirmDuplicateReference: confirm,
      };
      try {
        const saved = (await command.mutateAsync(
          transfer == null
            ? { kind: "createTransfer", input: { ...body, projectId } }
            : {
                kind: "updateTransfer",
                id: transfer.id,
                input: { ...body, expectedUpdatedAt: transfer.updatedAt },
              },
        )) as Transfer;
        onSaved?.(saved);
        onClose();
      } catch (error) {
        if (
          error instanceof QueryHttpError &&
          error.code === "DUPLICATE_REFERENCE"
        ) {
          setDuplicate({ message: error.message, approve });
          return;
        }
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
      <DialogContent className="flex max-h-[92dvh] flex-col sm:max-w-3xl">
        <form
          noValidate
          className="flex min-h-0 flex-col gap-5"
          onSubmit={(event) => {
            void save(false, false)(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {transfer == null ? "Transfer" : `Edit ${transfer.number}`}
            </DialogTitle>
            <DialogDescription>
              Move money between two accounts, such as funding a Team
              Member&apos;s petty cash. Both balances change once approved.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 space-y-4 overflow-y-auto px-0.5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-date`} required>
                  Date
                </Label>
                <Input
                  id={`${id}-date`}
                  type="date"
                  className="h-10"
                  aria-required
                  aria-invalid={errors.transferDate != null}
                  {...form.register("transferDate")}
                />
                <FieldError message={errors.transferDate?.message} />
              </div>
              <div className="space-y-1.5">
                <span id={`${id}-mode`} className="text-sm font-medium">
                  Mode
                  <RequiredIndicator />
                </span>
                <Controller
                  control={form.control}
                  name="mode"
                  render={({ field }) => (
                    <ModeToggle
                      labelledBy={`${id}-mode`}
                      value={field.value}
                      onChange={(next: PaymentModeValue) => {
                        field.onChange(next);
                      }}
                    />
                  )}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor={`${id}-from`} required>
                  From account
                </Label>
                <Controller
                  control={form.control}
                  name="fromAccountId"
                  render={({ field }) => (
                    <AccountPicker
                      id={`${id}-from`}
                      mode={mode}
                      value={field.value}
                      invalid={errors.fromAccountId != null}
                      onChange={field.onChange}
                    />
                  )}
                />
                <FieldError message={errors.fromAccountId?.message} />
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor={`${id}-to`} required>
                  To account
                </Label>
                <Controller
                  control={form.control}
                  name="toAccountId"
                  render={({ field }) => (
                    <ToAccountSelect
                      id={`${id}-to`}
                      value={field.value}
                      exclude={from}
                      invalid={errors.toAccountId != null}
                      onChange={field.onChange}
                    />
                  )}
                />
                <FieldError message={errors.toAccountId?.message} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {mode !== "cash" ? (
                <div className="space-y-1.5">
                  <Label htmlFor={`${id}-reference`} required>
                    {mode === "cheque" ? "Cheque number" : "Reference"}
                  </Label>
                  <Input
                    id={`${id}-reference`}
                    className="h-10"
                    autoComplete="off"
                    aria-required
                    aria-invalid={errors.reference != null}
                    {...form.register("reference")}
                  />
                  <FieldError message={errors.reference?.message} />
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-amount`} required>
                  Amount
                </Label>
                <MoneyInput
                  id={`${id}-amount`}
                  className="h-10"
                  aria-required
                  aria-invalid={errors.amount != null}
                  {...form.register("amount")}
                />
                <FieldError message={errors.amount?.message} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-description`}>Description</Label>
              <Textarea
                id={`${id}-description`}
                rows={2}
                maxLength={1000}
                {...form.register("description")}
              />
              <FieldError message={errors.description?.message} />
            </div>
          </div>
          {duplicate != null ? (
            <DuplicateReferenceAlert
              message={duplicate.message}
              busy={command.isPending}
              onConfirm={() => {
                void save(duplicate.approve, true)();
              }}
            />
          ) : null}
          <FormAlert message={errors.root?.message} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={canApprove ? "outline" : "default"}
              disabled={command.isPending}
            >
              {command.isPending ? "Saving…" : "Save"}
            </Button>
            {canApprove ? (
              <Button
                type="button"
                disabled={command.isPending}
                onClick={() => {
                  void save(true, false)();
                }}
              >
                Save & Approve
              </Button>
            ) : null}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
