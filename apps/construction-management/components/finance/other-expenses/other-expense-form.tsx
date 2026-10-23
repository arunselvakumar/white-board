"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label, RequiredIndicator } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { AccountPicker } from "@/components/finance/account-picker";
import { FinancePendingFilesField } from "@/components/finance/documents/pending-files-field";
import { useUploadPendingFinanceFiles } from "@/components/finance/documents/use-upload-pending-files";
import { PaymentCategoryPicker } from "@/components/finance/payment-category-picker";
import { MoneyInput } from "@/components/money/money-input";
import { localToday } from "@/components/payments/payment-format";
import { fieldForCode } from "@/lib/server-errors";
import { canInFinance, financeAccessQuery } from "@/src/queries/finance-access";
import {
  otherExpensesPath,
  useOtherExpenseCommand,
  type OtherExpense,
} from "@/src/queries/finance-other-expenses";

import {
  EXPENSE_FIELD_BY_CODE,
  EXPENSE_MODES,
  otherExpenseFormDefaults,
  otherExpenseFormSchema,
  otherExpensePayload,
  type ExpenseMode,
  type OtherExpenseFormValues,
} from "./other-expense-form-schema";
import { MODE_LABELS } from "./other-expense-parts";

function referenceLabel(mode: ExpenseMode): string {
  if (mode === "cheque") return "Cheque number";
  if (mode === "cash") return "Reference (optional)";
  return "Reference";
}

/**
 * The Other Expense form (CM-704, ADR CM-0017 §10): date, Payment
 * Category, Paid to, mode with its account and reference, amount,
 * description and, on a new expense, files. Save keeps it pending; Save &
 * Approve (with Approve) posts it at once. Editing an approved expense
 * sends it back for approval.
 */
export function OtherExpenseForm({
  projectId,
  expense,
  today = localToday(),
}: {
  projectId: string;
  /** Null adds a new one. */
  expense: OtherExpense | null;
  today?: string;
}) {
  const router = useRouter();
  const command = useOtherExpenseCommand();
  const access = useQuery(financeAccessQuery(projectId));
  const canApprove =
    access.data != null &&
    canInFinance(access.data, "finance.other_expenses", "approve");
  const uploads = useUploadPendingFinanceFiles("other_expense");
  const [saved, setSaved] = useState<OtherExpense | null>(null);
  const form = useForm<OtherExpenseFormValues>({
    resolver: zodResolver(otherExpenseFormSchema),
    defaultValues: otherExpenseFormDefaults(expense, today),
  });
  const { errors } = form.formState;
  const mode = useWatch({ control: form.control, name: "mode" });
  // Stays busy once saved: the page opens the expense next, and a second
  // press would save it twice.
  const busy = command.isPending || command.isSuccess || uploads.uploading;

  const save = (approve: boolean) =>
    form.handleSubmit(async (values) => {
      try {
        const input = otherExpensePayload(values, approve);
        const result =
          expense == null
            ? await command.mutateAsync({
                kind: "create",
                input: { ...input, projectId },
              })
            : await command.mutateAsync({
                kind: "update",
                id: expense.id,
                input,
                expectedUpdatedAt: expense.updatedAt,
              });
        if (result == null) return;
        if (expense == null && values.files.length > 0) {
          const { failed } = await uploads.uploadAll(result.id, values.files);
          if (failed.length > 0) {
            setSaved(result);
            form.setError("root", {
              message: `${result.number} was saved, but ${String(failed.length)} ${failed.length === 1 ? "file" : "files"} did not upload (${failed.join(", ")}). Add them on the expense.`,
            });
            return;
          }
        }
        router.push(otherExpensesPath(projectId, `/${result.id}`));
      } catch (error) {
        const { field, message } = fieldForCode(error, EXPENSE_FIELD_BY_CODE);
        form.setError(field ?? "root", { message });
      }
    });

  return (
    <form
      noValidate
      className="w-full max-w-4xl space-y-6"
      onSubmit={(event) => {
        void save(false)(event);
      }}
    >
      {expense?.status === "approved" && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          This expense is approved. Saving a change takes its amount back out of
          the account&apos;s ledger and sends it for approval again.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="expense-date" required>
            Date
          </Label>
          <Input
            id="expense-date"
            type="date"
            className="h-10"
            max={today}
            aria-required
            aria-invalid={errors.expenseDate != null}
            {...form.register("expenseDate")}
          />
          <FieldError message={errors.expenseDate?.message} />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="expense-category" required>
            Payment Category
          </Label>
          <Controller
            name="paymentCategoryId"
            control={form.control}
            render={({ field }) => (
              <PaymentCategoryPicker
                id="expense-category"
                value={field.value}
                onChange={field.onChange}
                invalid={errors.paymentCategoryId != null}
              />
            )}
          />
          <FieldError message={errors.paymentCategoryId?.message} />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="expense-payee">Paid to</Label>
          <Input
            id="expense-payee"
            className="h-10"
            autoComplete="off"
            placeholder="Who was paid, e.g. Tea stall"
            aria-invalid={errors.payeeName != null}
            {...form.register("payeeName")}
          />
          <FieldError message={errors.payeeName?.message} />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="expense-amount" required>
            Amount
          </Label>
          <MoneyInput
            id="expense-amount"
            className="h-10"
            aria-required
            aria-invalid={errors.amount != null}
            {...form.register("amount")}
          />
          <FieldError message={errors.amount?.message} />
        </div>
        <div className="min-w-0 space-y-1.5 sm:col-span-2">
          <span id="expense-mode" className="text-sm font-medium">
            Mode
            <RequiredIndicator />
          </span>
          <Controller
            name="mode"
            control={form.control}
            render={({ field }) => (
              <ToggleGroup
                aria-labelledby="expense-mode"
                value={[field.value]}
                onValueChange={(value: string[]) => {
                  const next = EXPENSE_MODES.find((item) => item === value[0]);
                  if (next != null) field.onChange(next);
                }}
                variant="outline"
                className="w-full"
              >
                {EXPENSE_MODES.map((item) => (
                  <ToggleGroupItem key={item} value={item} className="flex-1">
                    {MODE_LABELS[item]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="expense-account" required>
            Paid from
          </Label>
          <Controller
            name="accountId"
            control={form.control}
            render={({ field }) => (
              <AccountPicker
                id="expense-account"
                value={field.value}
                onChange={field.onChange}
                mode={mode}
                invalid={errors.accountId != null}
              />
            )}
          />
          <FieldError message={errors.accountId?.message} />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="expense-reference" required={mode !== "cash"}>
            {referenceLabel(mode)}
          </Label>
          <Input
            id="expense-reference"
            className="h-10"
            autoComplete="off"
            placeholder={
              mode === "cheque" ? "Cheque number" : "UTR or UPI reference"
            }
            aria-required={mode !== "cash"}
            aria-invalid={errors.reference != null}
            {...form.register("reference")}
          />
          <FieldError message={errors.reference?.message} />
        </div>
        <div className="min-w-0 space-y-1.5 sm:col-span-2">
          <Label htmlFor="expense-description">Description</Label>
          <Textarea
            id="expense-description"
            rows={3}
            aria-invalid={errors.description != null}
            {...form.register("description")}
          />
          <FieldError message={errors.description?.message} />
        </div>
        {expense == null && (
          <div className="min-w-0 sm:col-span-2">
            <Controller
              name="files"
              control={form.control}
              render={({ field }) => (
                <FinancePendingFilesField
                  documentType="other_expense"
                  value={field.value}
                  onChange={field.onChange}
                  disabled={busy}
                />
              )}
            />
          </div>
        )}
      </div>
      {uploads.uploading && (
        <p role="status" className="text-muted-foreground text-sm">
          Uploading files {uploads.done + 1} of {uploads.total}…
        </p>
      )}
      <FormAlert message={errors.root?.message} />
      <div className="flex flex-wrap gap-2">
        {saved == null ? (
          <>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
            {canApprove && (
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={(event) => {
                  void save(true)(event);
                }}
              >
                Save &amp; Approve
              </Button>
            )}
            <Link
              href={otherExpensesPath(
                projectId,
                expense == null ? "" : `/${expense.id}`,
              )}
              className={buttonVariants({ variant: "outline" })}
            >
              Cancel
            </Link>
          </>
        ) : (
          <Link
            href={otherExpensesPath(projectId, `/${saved.id}`)}
            className={buttonVariants()}
          >
            Open {saved.number}
          </Link>
        )}
      </div>
    </form>
  );
}
