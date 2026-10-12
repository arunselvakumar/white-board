"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Textarea } from "@repo/ui/components/textarea";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import {
  CounterpartyField,
  EMPTY_COUNTERPARTY,
  type CounterpartyValue,
} from "@/components/finance/counterparty-field";
import { FinancePendingFilesField } from "@/components/finance/documents/pending-files-field";
import { useUploadPendingFinanceFiles } from "@/components/finance/documents/use-upload-pending-files";
import { PaymentCategoryPicker } from "@/components/finance/payment-category-picker";
import {
  MoneyInput,
  isRupees,
  paiseToRupees,
  rupeesToPaise,
} from "@/components/money/money-input";
import { localToday } from "@/components/payments/payment-format";
import { VOUCHER_TYPES } from "@/src/finance/domain/petty-cash";
import { canInFinance, financeAccessQuery } from "@/src/queries/finance-access";
import { accountOptionsQuery } from "@/src/queries/finance-accounts";
import {
  pettyCashAccountsQuery,
  useCreateVoucher,
  useUpdateVoucher,
  type PettyCashVoucher,
  type VoucherType,
} from "@/src/queries/finance-petty-cash";
import { QueryHttpError } from "@/src/queries/http";

import { VOUCHER_TYPE_LABELS, pettyCashPath } from "./petty-cash-parts";

const THIS_PROJECT = "__this__";
const NO_PROJECT = "__none__";

const schema = z
  .object({
    voucherType: z.enum(VOUCHER_TYPES),
    accountId: z.string().min(1, "Choose the petty-cash account"),
    voucherDate: z.string().min(1, "Choose the date"),
    project: z.string(),
    counterparty: z.object({
      kind: z.string().nullable(),
      id: z.string().nullable(),
      name: z.string(),
    }),
    toAccountId: z.string(),
    paymentCategoryId: z.string(),
    amount: z
      .string()
      .min(1, "Enter the amount")
      .refine((value) => isRupees(value) && (rupeesToPaise(value) ?? 0) > 0, {
        message: "Enter an amount above zero, like 250 or 250.50",
      }),
    paidFor: z.string().max(500, "Use at most 500 characters"),
    reference: z.string().max(500, "Use at most 500 characters"),
    description: z.string().max(500, "Use at most 500 characters"),
    files: z.array(z.instanceof(File)),
  })
  .superRefine((values, context) => {
    if (values.voucherType === "transfer" && values.toAccountId === "")
      context.addIssue({
        code: "custom",
        path: ["toAccountId"],
        message: "Choose the account the money goes to",
      });
    if (values.voucherType !== "transfer" && values.paymentCategoryId === "")
      context.addIssue({
        code: "custom",
        path: ["paymentCategoryId"],
        message: "Choose a Payment Category",
      });
    if (
      values.counterparty.kind != null &&
      values.voucherType !== "transfer" &&
      values.counterparty.id == null
    )
      context.addIssue({
        code: "custom",
        path: ["counterparty"],
        message: "Choose the party, or type a name",
      });
  });

type Values = z.infer<typeof schema>;

/** Server codes that belong to a field (by `details.field` or by code). */
const FIELD_OF_CODE: Record<string, keyof Values> = {
  BACKDATED_CREATE_BLOCKED: "voucherDate",
  BACKDATED_EDIT_BLOCKED: "voucherDate",
  FINANCIAL_PERIOD_CLOSED: "voucherDate",
  ACCOUNT_NOT_YOURS: "accountId",
  ACCOUNT_NOT_PETTY_CASH: "accountId",
  TO_ACCOUNT_REQUIRED: "toAccountId",
  TO_ACCOUNT_SAME: "toAccountId",
  TO_ACCOUNT_NOT_FOUND: "toAccountId",
  PAYMENT_CATEGORY_REQUIRED: "paymentCategoryId",
  PAYMENT_CATEGORY_NOT_FOUND: "paymentCategoryId",
  PAYMENT_CATEGORY_DISABLED: "paymentCategoryId",
  COUNTERPARTY_NOT_FOUND: "counterparty",
  AMOUNT_INVALID: "amount",
  AMOUNT_TOO_LARGE: "amount",
  PROJECT_NOT_FOUND: "project",
};

function projectValue(
  projectId: string,
  voucher: PettyCashVoucher | undefined,
): string {
  if (voucher == null) return THIS_PROJECT;
  if (voucher.projectId == null) return NO_PROJECT;
  return voucher.projectId === projectId ? THIS_PROJECT : voucher.projectId;
}

function defaults(
  projectId: string,
  accountId: string,
  type: VoucherType,
  voucher: PettyCashVoucher | undefined,
): Values {
  return {
    voucherType: voucher?.voucherType ?? type,
    accountId: voucher?.accountId ?? accountId,
    voucherDate: voucher?.voucherDate ?? localToday(),
    project: projectValue(projectId, voucher),
    counterparty:
      voucher == null
        ? EMPTY_COUNTERPARTY
        : {
            kind: voucher.counterparty.kind,
            id: voucher.counterparty.id,
            name: voucher.counterparty.name ?? "",
          },
    toAccountId: voucher?.toAccountId ?? "",
    paymentCategoryId: voucher?.paymentCategoryId ?? "",
    amount: voucher == null ? "" : paiseToRupees(voucher.amount),
    paidFor: voucher?.paidFor ?? "",
    reference: voucher?.reference ?? "",
    description: voucher?.description ?? "",
    files: [],
  };
}

const orNull = (value: string) => (value.trim() === "" ? null : value.trim());

/**
 * A petty-cash voucher (CM-0017 §9): Payment (cash out), Receipt (cash in)
 * or Transfer (to another petty-cash or a company account). Date, the
 * Project (this one, none, or the one it already has), Paid To / Received
 * From, amount, Payment Category (Payment and Receipt), Paid For,
 * reference, description, and on a new voucher its photos and receipts,
 * uploaded once it is saved. **Save & Approve** shows with Petty Cash
 * Approve. Editing an approved voucher returns it to pending.
 */
export function VoucherForm({
  projectId,
  accountId = "",
  type = "payment",
  voucher,
}: {
  projectId: string;
  /** The account a new voucher starts on. */
  accountId?: string;
  type?: VoucherType;
  /** Edit this voucher. */
  voucher?: PettyCashVoucher;
}) {
  const router = useRouter();
  const { data: access } = useSuspenseQuery(financeAccessQuery(projectId));
  const { data: accounts } = useSuspenseQuery(pettyCashAccountsQuery());
  const allAccounts = useQuery(accountOptionsQuery()).data?.items ?? [];
  const create = useCreateVoucher();
  const update = useUpdateVoucher(voucher?.id ?? "");
  const uploads = useUploadPendingFinanceFiles("petty_cash_voucher");
  const [error, setError] = useState<string | null>(null);
  const firstAccount =
    accountId !== ""
      ? accountId
      : (accounts.items.find((account) => account.isOwn)?.id ??
        accounts.items[0]?.id ??
        "");
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: defaults(projectId, firstAccount, type, voucher),
  });
  const errors = form.formState.errors;
  const voucherType = useWatch({ control: form.control, name: "voucherType" });
  const chosenAccount = useWatch({ control: form.control, name: "accountId" });
  const project = useWatch({ control: form.control, name: "project" });
  const canApprove = canInFinance(access, "finance.petty_cash", "approve");
  const transfer = voucherType === "transfer";

  const accountItems = accounts.items.map((account) => ({
    value: account.id,
    label: account.isOwn ? `${account.name} (yours)` : account.name,
  }));
  const toItems = allAccounts
    .filter((account) => account.id !== chosenAccount)
    .map((account) => ({
      value: account.id,
      label:
        account.kind === "petty_cash"
          ? `Petty cash — ${account.holderName ?? account.name}`
          : account.name,
    }));
  const projectItems = [
    { value: THIS_PROJECT, label: "This Project" },
    { value: NO_PROJECT, label: "No Project" },
    ...(voucher?.projectId != null && voucher.projectId !== projectId
      ? [
          {
            value: voucher.projectId,
            label: voucher.projectName ?? "Another Project",
          },
        ]
      : []),
  ];
  const projectIdOf = (value: string) =>
    value === THIS_PROJECT ? projectId : value === NO_PROJECT ? null : value;

  const submit = async (input: Values, approve: boolean) => {
    setError(null);
    const counterparty: CounterpartyValue =
      input.counterparty as CounterpartyValue;
    const body = {
      voucherType: input.voucherType,
      voucherDate: input.voucherDate,
      projectId: projectIdOf(input.project),
      counterparty: transfer
        ? { kind: null, id: null, name: null }
        : {
            kind: counterparty.kind,
            id: counterparty.id,
            name: counterparty.kind == null ? orNull(counterparty.name) : null,
          },
      toAccountId: transfer ? input.toAccountId : null,
      paymentCategoryId: transfer ? null : input.paymentCategoryId,
      amount: rupeesToPaise(input.amount) ?? 0,
      paidFor: orNull(input.paidFor),
      reference: orNull(input.reference),
      description: orNull(input.description),
    };
    try {
      const saved =
        voucher == null
          ? await create.mutateAsync({
              ...body,
              accountId: input.accountId,
              approve,
            })
          : await update.mutateAsync({
              ...body,
              expectedUpdatedAt: voucher.updatedAt,
            });
      // A file that does not go up can be added again on the voucher.
      if (voucher == null) await uploads.uploadAll(saved.id, input.files);
      router.push(pettyCashPath(projectId, `/${saved.id}`));
    } catch (caught) {
      if (caught instanceof QueryHttpError) {
        const field = FIELD_OF_CODE[caught.code];
        if (field != null) {
          form.setError(field, { message: caught.message });
          return;
        }
        setError(caught.message);
        return;
      }
      setError("Something went wrong. Please try again.");
    }
  };

  // Stays busy once saved: the page opens the voucher next, and a second
  // press would save it twice.
  const busy =
    form.formState.isSubmitting ||
    create.isSuccess ||
    update.isSuccess ||
    uploads.uploading;

  return (
    <form
      noValidate
      aria-label={voucher == null ? "New voucher" : `Edit ${voucher.number}`}
      className="w-full max-w-4xl space-y-6"
      onSubmit={(event) => {
        void form.handleSubmit((values) => submit(values, false))(event);
      }}
    >
      {voucher?.approvalStatus === "approved" ? (
        <p className="bg-muted/50 rounded-lg border px-3 py-2 text-sm">
          This voucher is approved. Saving a change reverses its entries and
          sends it back for approval.
        </p>
      ) : null}
      {voucher?.approvalStatus === "rejected" ? (
        <p className="bg-muted/50 rounded-lg border px-3 py-2 text-sm">
          Rejected: {voucher.rejectReason}. Saving sends it back for approval.
        </p>
      ) : null}

      <Controller
        control={form.control}
        name="voucherType"
        render={({ field }) => (
          <ToggleGroup
            aria-label="Voucher type"
            value={[field.value]}
            onValueChange={(value: string[]) => {
              const next = value[0];
              if (next != null) field.onChange(next);
            }}
            variant="outline"
          >
            {VOUCHER_TYPES.map((item) => (
              <ToggleGroupItem key={item} value={item}>
                {VOUCHER_TYPE_LABELS[item]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="voucher-account">Petty-cash account</Label>
          <Controller
            control={form.control}
            name="accountId"
            render={({ field }) => (
              <Select
                items={accountItems}
                value={field.value === "" ? null : field.value}
                onValueChange={(next) => {
                  if (typeof next === "string") field.onChange(next);
                }}
                disabled={voucher != null}
              >
                <SelectTrigger
                  id="voucher-account"
                  size="lg"
                  className="w-full min-w-0"
                  aria-invalid={errors.accountId != null}
                >
                  <SelectValue placeholder="Choose an account" />
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  {accountItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError message={errors.accountId?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="voucher-date">Date</Label>
          <Input
            id="voucher-date"
            type="date"
            aria-invalid={errors.voucherDate != null}
            {...form.register("voucherDate")}
          />
          <FieldError message={errors.voucherDate?.message} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="voucher-amount">Amount</Label>
          <MoneyInput
            id="voucher-amount"
            placeholder="0"
            aria-invalid={errors.amount != null}
            {...form.register("amount")}
          />
          <FieldError message={errors.amount?.message} />
        </div>
        {transfer ? (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="voucher-to">To account</Label>
            <Controller
              control={form.control}
              name="toAccountId"
              render={({ field }) => (
                <Select
                  items={toItems}
                  value={field.value === "" ? null : field.value}
                  onValueChange={(next) => {
                    if (typeof next === "string") field.onChange(next);
                  }}
                >
                  <SelectTrigger
                    id="voucher-to"
                    size="lg"
                    className="w-full min-w-0"
                    aria-invalid={errors.toAccountId != null}
                  >
                    <SelectValue placeholder="Choose an account" />
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    {toItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError message={errors.toAccountId?.message} />
          </div>
        ) : (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="voucher-category">Payment Category</Label>
            <Controller
              control={form.control}
              name="paymentCategoryId"
              render={({ field }) => (
                <PaymentCategoryPicker
                  id="voucher-category"
                  value={field.value}
                  onChange={field.onChange}
                  invalid={errors.paymentCategoryId != null}
                />
              )}
            />
            <FieldError message={errors.paymentCategoryId?.message} />
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="voucher-project">Project</Label>
          <Controller
            control={form.control}
            name="project"
            render={({ field }) => (
              <Select
                items={projectItems}
                value={field.value}
                onValueChange={(next) => {
                  if (typeof next === "string") field.onChange(next);
                }}
              >
                <SelectTrigger
                  id="voucher-project"
                  size="lg"
                  className="w-full min-w-0"
                  aria-invalid={errors.project != null}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  {projectItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError message={errors.project?.message} />
        </div>
        {transfer ? null : (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="voucher-party">
              {voucherType === "receipt" ? "Received from" : "Paid to"}
            </Label>
            <Controller
              control={form.control}
              name="counterparty"
              render={({ field }) => (
                <CounterpartyField
                  id="voucher-party"
                  value={field.value as CounterpartyValue}
                  onChange={field.onChange}
                  projectId={projectIdOf(project)}
                  invalid={errors.counterparty != null}
                />
              )}
            />
            <FieldError message={errors.counterparty?.message} />
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="voucher-paid-for">
            {voucherType === "receipt" ? "Received for" : "Paid for"}
          </Label>
          <Input
            id="voucher-paid-for"
            autoComplete="off"
            placeholder="Diesel for the mixer"
            aria-invalid={errors.paidFor != null}
            {...form.register("paidFor")}
          />
          <FieldError message={errors.paidFor?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="voucher-reference">Reference</Label>
          <Input
            id="voucher-reference"
            autoComplete="off"
            placeholder="Bill number"
            aria-invalid={errors.reference != null}
            {...form.register("reference")}
          />
          <FieldError message={errors.reference?.message} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="voucher-description">Description</Label>
        <Textarea
          id="voucher-description"
          rows={3}
          aria-invalid={errors.description != null}
          {...form.register("description")}
        />
        <FieldError message={errors.description?.message} />
      </div>

      {voucher == null ? (
        <Controller
          control={form.control}
          name="files"
          render={({ field }) => (
            <FinancePendingFilesField
              documentType="petty_cash_voucher"
              value={field.value}
              onChange={field.onChange}
              disabled={busy}
            />
          )}
        />
      ) : null}

      <FormAlert message={error ?? undefined} />
      {uploads.uploading ? (
        <p role="status" className="text-muted-foreground text-sm">
          Uploading files {uploads.done + 1} of {uploads.total}…
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            router.push(
              voucher == null
                ? pettyCashPath(projectId)
                : pettyCashPath(projectId, `/${voucher.id}`),
            );
          }}
        >
          Cancel
        </Button>
        {voucher == null && canApprove ? (
          // Not a submit button: Enter in a field must Save, never approve.
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              void form.handleSubmit((values) => submit(values, true))();
            }}
          >
            Save &amp; Approve
          </Button>
        ) : null}
        <Button type="submit" disabled={busy}>
          {voucher == null ? "Save" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
