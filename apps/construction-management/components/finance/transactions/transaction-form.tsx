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
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { AccountPicker } from "@/components/finance/account-picker";
import {
  CounterpartyField,
  EMPTY_COUNTERPARTY,
} from "@/components/finance/counterparty-field";
import { FinancePendingFilesField } from "@/components/finance/documents/pending-files-field";
import { useUploadPendingFinanceFiles } from "@/components/finance/documents/use-upload-pending-files";
import { PaymentCategoryPicker } from "@/components/finance/payment-category-picker";
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
  type Transaction,
} from "@/src/queries/finance-transactions";
import { QueryHttpError } from "@/src/queries/http";

import { DuplicateReferenceAlert, ModeToggle } from "./transaction-form-parts";
import { DIRECTION_LABELS, type PaymentModeValue } from "./transaction-format";

const schema = z
  .object({
    transactionDate: z.string().min(1, "Enter the date"),
    direction: z.enum(["payment_in", "payment_out"]),
    mode: z.enum(["cash", "cheque", "online", "upi"]),
    accountId: z.string().min(1, "Choose an account"),
    chequeNumber: z.string().trim().max(60, "Use at most 60 characters"),
    modeDate: z.string(),
    reference: z.string().trim().max(60, "Use at most 60 characters"),
    amount: z
      .string()
      .refine(
        (value) => isRupees(value) && (rupeesToPaise(value) ?? 0) > 0,
        "Enter an amount above zero, like 1500.50",
      ),
    paymentCategoryId: z.string(),
    counterparty: z.object({
      kind: z
        .enum([
          "contractor",
          "supplier",
          "other_party",
          "labour",
          "vendor",
          "team_member",
        ])
        .nullable(),
      id: z.string().nullable(),
      name: z.string().max(200, "Use at most 200 characters"),
    }),
    description: z.string().max(1000, "Use at most 1000 characters"),
  })
  .superRefine((values, context) => {
    if (values.mode === "cheque" && values.chequeNumber === "")
      context.addIssue({
        code: "custom",
        path: ["chequeNumber"],
        message: "Enter the cheque number",
      });
    if (
      (values.mode === "online" || values.mode === "upi") &&
      values.reference === ""
    )
      context.addIssue({
        code: "custom",
        path: ["reference"],
        message: "Enter the transaction reference",
      });
    if (values.counterparty.kind != null && values.counterparty.id == null)
      context.addIssue({
        code: "custom",
        path: ["counterparty"],
        message: "Choose who, or switch to Type a name",
      });
  });

type Values = z.infer<typeof schema>;

const SERVER_FIELDS: Record<string, keyof Values> = {
  ACCOUNT_MODE_MISMATCH: "accountId",
  ACCOUNT_NOT_YOURS: "accountId",
  ACCOUNT_NOT_FOUND: "accountId",
  CHEQUE_NUMBER_REQUIRED: "chequeNumber",
  REFERENCE_REQUIRED: "reference",
  AMOUNT_INVALID: "amount",
  AMOUNT_TOO_LARGE: "amount",
  PAYMENT_CATEGORY_NOT_FOUND: "paymentCategoryId",
  COUNTERPARTY_REQUIRED: "counterparty",
  COUNTERPARTY_NOT_FOUND: "counterparty",
  DATE_INVALID: "transactionDate",
  BACKDATED_CREATE_BLOCKED: "transactionDate",
  BACKDATED_EDIT_BLOCKED: "transactionDate",
  FINANCIAL_PERIOD_CLOSED: "transactionDate",
};

function defaults(transaction: Transaction | null, today: string): Values {
  if (transaction == null)
    return {
      transactionDate: today,
      direction: "payment_out",
      mode: "cash",
      accountId: "",
      chequeNumber: "",
      modeDate: "",
      reference: "",
      amount: "",
      paymentCategoryId: "",
      counterparty: EMPTY_COUNTERPARTY,
      description: "",
    };
  return {
    transactionDate: transaction.transactionDate,
    direction: transaction.direction,
    mode: transaction.mode,
    accountId: transaction.account.id,
    chequeNumber: transaction.chequeNumber ?? "",
    modeDate: transaction.modeDate ?? "",
    reference: transaction.reference ?? "",
    amount: paiseToRupees(transaction.amount),
    paymentCategoryId: transaction.paymentCategoryId ?? "",
    counterparty: transaction.counterparty ?? EMPTY_COUNTERPARTY,
    description: transaction.description ?? "",
  };
}

/**
 * New Transaction or Edit (CM-702, ADR CM-0017 §5): date, Payment In or
 * Out, mode, the account (fitting the mode), cheque number or reference,
 * amount, Payment Category, Paid To / Received From and description. Save
 * leaves it pending; Save & Approve (with Approve) posts it. A reference
 * already used on the account asks before saving anyway.
 */
export function TransactionDialog({
  projectId,
  transaction,
  canApprove,
  onClose,
  onSaved,
  today = localToday(),
}: {
  projectId: string;
  /** Null for a new one. */
  transaction: Transaction | null;
  canApprove: boolean;
  onClose: () => void;
  onSaved?: (transaction: Transaction) => void;
  today?: string;
}) {
  const id = useId();
  const command = useTransactionCommand();
  const files = useUploadPendingFinanceFiles("transaction");
  const [pending, setPending] = useState<File[]>([]);
  /** Saved, but some files did not upload: the dialog stays to say so. */
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{
    message: string;
    approve: boolean;
  } | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: defaults(transaction, today),
  });
  const errors = form.formState.errors;
  const mode = useWatch({ control: form.control, name: "mode" });
  const direction = useWatch({ control: form.control, name: "direction" });
  const counterpartyKind = useWatch({
    control: form.control,
    name: "counterparty.kind",
  });
  const partyLabel = direction === "payment_in" ? "Received From" : "Paid To";

  const save = (approve: boolean, confirm: boolean) =>
    form.handleSubmit(async (values) => {
      setDuplicate(null);
      const body = {
        transactionDate: values.transactionDate,
        type: values.direction,
        accountId: values.accountId,
        paymentCategoryId:
          values.paymentCategoryId === "" ? null : values.paymentCategoryId,
        mode: values.mode,
        chequeNumber: values.mode === "cheque" ? values.chequeNumber : null,
        modeDate:
          values.mode === "cheque" && values.modeDate !== ""
            ? values.modeDate
            : null,
        reference:
          values.mode === "online" || values.mode === "upi"
            ? values.reference
            : null,
        counterparty:
          values.counterparty.kind == null &&
          values.counterparty.name.trim() === ""
            ? null
            : values.counterparty,
        amount: rupeesToPaise(values.amount) ?? 0,
        description: values.description,
        approve,
        confirmDuplicateReference: confirm,
      };
      try {
        const saved = (await command.mutateAsync(
          transaction == null
            ? { kind: "createTransaction", input: { ...body, projectId } }
            : {
                kind: "updateTransaction",
                id: transaction.id,
                input: { ...body, expectedUpdatedAt: transaction.updatedAt },
              },
        )) as Transaction;
        onSaved?.(saved);
        if (transaction == null && pending.length > 0) {
          const { failed } = await files.uploadAll(saved.id, pending);
          if (failed.length > 0) {
            setSavedNote(
              `${saved.number} was saved, but ${failed.join(", ")} did not upload. Add ${failed.length === 1 ? "it" : "them"} again on its page.`,
            );
            return;
          }
        }
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
              {transaction == null
                ? "New transaction"
                : `Edit ${transaction.number}`}
            </DialogTitle>
            <DialogDescription>
              {transaction?.approvalStatus === "approved"
                ? "Saving takes this approved Transaction out of the balance and sends it for approval again."
                : "Money in or out of an account that is not a party payment. It moves the balance once approved."}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 space-y-4 overflow-y-auto px-0.5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <span id={`${id}-direction`} className="text-sm font-medium">
                  Type
                  <RequiredIndicator />
                </span>
                <Controller
                  control={form.control}
                  name="direction"
                  render={({ field }) => (
                    <ToggleGroup
                      aria-labelledby={`${id}-direction`}
                      variant="outline"
                      className="w-full"
                      value={[field.value]}
                      onValueChange={(next: string[]) => {
                        const value = next[0];
                        if (value === "payment_in" || value === "payment_out")
                          field.onChange(value);
                      }}
                    >
                      <ToggleGroupItem value="payment_out" className="flex-1">
                        {DIRECTION_LABELS.payment_out}
                      </ToggleGroupItem>
                      <ToggleGroupItem value="payment_in" className="flex-1">
                        {DIRECTION_LABELS.payment_in}
                      </ToggleGroupItem>
                    </ToggleGroup>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-date`} required>
                  Date
                </Label>
                <Input
                  id={`${id}-date`}
                  type="date"
                  className="h-10"
                  aria-required
                  aria-invalid={errors.transactionDate != null}
                  {...form.register("transactionDate")}
                />
                <FieldError message={errors.transactionDate?.message} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
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
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor={`${id}-account`} required>
                  {direction === "payment_in" ? "Received into" : "Paid from"}
                </Label>
                <Controller
                  control={form.control}
                  name="accountId"
                  render={({ field }) => (
                    <AccountPicker
                      id={`${id}-account`}
                      mode={mode}
                      value={field.value}
                      invalid={errors.accountId != null}
                      onChange={field.onChange}
                    />
                  )}
                />
                <FieldError message={errors.accountId?.message} />
              </div>
            </div>
            {mode === "cheque" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`${id}-cheque`} required>
                    Cheque number
                  </Label>
                  <Input
                    id={`${id}-cheque`}
                    className="h-10"
                    autoComplete="off"
                    aria-required
                    aria-invalid={errors.chequeNumber != null}
                    {...form.register("chequeNumber")}
                  />
                  <FieldError message={errors.chequeNumber?.message} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${id}-cheque-date`}>Cheque date</Label>
                  <Input
                    id={`${id}-cheque-date`}
                    type="date"
                    className="h-10"
                    {...form.register("modeDate")}
                  />
                </div>
              </div>
            ) : mode === "online" || mode === "upi" ? (
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-reference`} required>
                  Reference
                </Label>
                <Input
                  id={`${id}-reference`}
                  className="h-10"
                  autoComplete="off"
                  placeholder="UTR or UPI reference"
                  aria-required
                  aria-invalid={errors.reference != null}
                  {...form.register("reference")}
                />
                <FieldError message={errors.reference?.message} />
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
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
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor={`${id}-category`}>Payment Category</Label>
                <Controller
                  control={form.control}
                  name="paymentCategoryId"
                  render={({ field }) => (
                    <PaymentCategoryPicker
                      id={`${id}-category`}
                      optional
                      value={field.value}
                      invalid={errors.paymentCategoryId != null}
                      onChange={field.onChange}
                    />
                  )}
                />
                <FieldError message={errors.paymentCategoryId?.message} />
              </div>
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label
                htmlFor={`${id}-party`}
                required={counterpartyKind != null}
              >
                {partyLabel}
              </Label>
              <Controller
                control={form.control}
                name="counterparty"
                render={({ field }) => (
                  <CounterpartyField
                    id={`${id}-party`}
                    projectId={projectId}
                    value={field.value}
                    invalid={errors.counterparty != null}
                    onChange={field.onChange}
                  />
                )}
              />
              <FieldError message={errors.counterparty?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-description`}>Description</Label>
              <Textarea
                id={`${id}-description`}
                rows={2}
                maxLength={1000}
                aria-invalid={errors.description != null}
                {...form.register("description")}
              />
              <FieldError message={errors.description?.message} />
            </div>
            {transaction == null ? (
              <FinancePendingFilesField
                documentType="transaction"
                value={pending}
                onChange={setPending}
                disabled={command.isPending || files.uploading}
              />
            ) : null}
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
          <FormAlert message={errors.root?.message ?? savedNote ?? undefined} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {savedNote == null ? "Cancel" : "Close"}
            </Button>
            <Button
              type="submit"
              variant={canApprove ? "outline" : "default"}
              disabled={
                command.isPending || files.uploading || savedNote != null
              }
            >
              {files.uploading
                ? `Uploading ${String(files.done + 1)} of ${String(files.total)}…`
                : command.isPending
                  ? "Saving…"
                  : "Save"}
            </Button>
            {canApprove ? (
              <Button
                type="button"
                disabled={
                  command.isPending || files.uploading || savedNote != null
                }
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
