"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import { Input } from "@repo/ui/components/input";
import { Label, RequiredIndicator } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Textarea } from "@repo/ui/components/textarea";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";
import { SkeletonText } from "@repo/ui/components/skeleton-kit";

import { PageHeader } from "@/components/app-shell/page-header";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { AccountPicker } from "@/components/finance/account-picker";
import { FinancePendingFilesField } from "@/components/finance/documents/pending-files-field";
import { useUploadPendingFinanceFiles } from "@/components/finance/documents/use-upload-pending-files";
import { PaymentCategoryPicker } from "@/components/finance/payment-category-picker";
import {
  isRupees,
  MoneyInput,
  paiseToRupees,
  rupeesToPaise,
} from "@/components/money/money-input";
import { fieldForCode } from "@/lib/server-errors";
import { counterpartyOptionsQuery } from "@/src/queries/finance-lookups";
import {
  outstandingInvoicesQuery,
  tdsSuggestionQuery,
  useRecordPartyPayment,
  type PartyType,
  type TdsSuggestion,
} from "@/src/queries/finance-parties";
import { QueryHttpError } from "@/src/queries/http";

import {
  AllocationTable,
  allocatedTotal,
  allocationsOf,
  type AllocationValues,
} from "./allocation-table";
import {
  localToday,
  MODE_LABELS,
  money,
  PARTY_SCREENS,
  partyPaths,
} from "./party-money";
import { AllocationSkeleton } from "./parties-skeletons";

const MODES = ["cash", "cheque", "online", "upi"] as const;
type Mode = (typeof MODES)[number];
const ME = "__me__";

const rupees = (message: string) =>
  z
    .string()
    .trim()
    .refine((value) => isRupees(value) && (rupeesToPaise(value) ?? 0) > 0, {
      message,
    });

const paymentFormSchema = z
  .object({
    partyId: z.string().min(1, "Choose the party"),
    direction: z.enum(["out", "in"]),
    paymentDate: z.iso.date({ message: "Choose the payment date" }),
    mode: z.enum(MODES),
    accountId: z.string().min(1, "Choose the account"),
    chequeNumber: z.string().trim().max(60, "Use at most 60 characters"),
    reference: z.string().trim().max(60, "Use at most 60 characters"),
    modeDate: z.string(),
    /** Paid; for a Contractor, settled (paid + TDS). */
    amount: rupees("Enter the amount"),
    tdsOverride: z.boolean(),
    tdsAmount: z.string().trim(),
    tdsRate: z.string().trim(),
    tdsReason: z.string().trim().max(500, "Use at most 500 characters"),
    paymentCategoryId: z.string(),
    paidByMemberId: z.string(),
    remarks: z.string().max(500, "Use at most 500 characters"),
  })
  .superRefine((values, ctx) => {
    if (values.mode === "cheque" && values.chequeNumber === "")
      ctx.addIssue({
        code: "custom",
        path: ["chequeNumber"],
        message: "Enter the cheque number",
      });
    if (
      (values.mode === "online" || values.mode === "upi") &&
      values.reference === ""
    )
      ctx.addIssue({
        code: "custom",
        path: ["reference"],
        message: "Enter the transaction reference",
      });
    if (values.tdsOverride) {
      if (values.tdsAmount !== "" && !isRupees(values.tdsAmount))
        ctx.addIssue({
          code: "custom",
          path: ["tdsAmount"],
          message: "Enter the TDS in rupees",
        });
      if (
        values.tdsRate !== "" &&
        !(
          /^\d{1,3}(\.\d{1,2})?$/.test(values.tdsRate) &&
          Number(values.tdsRate) <= 100
        )
      )
        ctx.addIssue({
          code: "custom",
          path: ["tdsRate"],
          message: "Enter a percent from 0 to 100",
        });
      if (values.tdsReason === "")
        ctx.addIssue({
          code: "custom",
          path: ["tdsReason"],
          message: "Say why the TDS differs from the suggestion",
        });
    }
  });

type PaymentFormValues = z.infer<typeof paymentFormSchema>;

const ERROR_FIELDS = {
  AMOUNT_INVALID: "amount",
  AMOUNT_TOO_LARGE: "amount",
  ACCOUNT_NOT_FOUND: "accountId",
  ACCOUNT_NOT_YOURS: "accountId",
  ACCOUNT_MODE_MISMATCH: "accountId",
  CHEQUE_NUMBER_REQUIRED: "chequeNumber",
  REFERENCE_REQUIRED: "reference",
  TDS_OVERRIDE_REASON_REQUIRED: "tdsReason",
  TDS_RATE_INVALID: "tdsRate",
  PAYMENT_DATE_INVALID: "paymentDate",
  FINANCIAL_PERIOD_CLOSED: "paymentDate",
  BACKDATED_CREATE_BLOCKED: "paymentDate",
  PARTY_NOT_ON_PROJECT: "partyId",
  PARTY_NOT_FOUND: "partyId",
  PAID_BY_NOT_FOUND: "paidByMemberId",
  PAYMENT_CATEGORY_NOT_FOUND: "paymentCategoryId",
} as const;

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);
  return debounced;
}

const REASON_LABELS: Record<TdsSuggestion["reason"], string> = {
  not_applicable: "TDS does not apply to this Contractor",
  below_threshold: "Below ₹30,000 and the year is under ₹1,00,000",
  single: "This payment is above ₹30,000",
  aggregate: "The year's payments are above ₹1,00,000",
  aggregate_crossed: "This payment takes the year above ₹1,00,000",
};

/**
 * **Record payment** (CM-705, CM-706; CM-708 for Other Parties): the party,
 * date, mode with the account it was paid from (or received into), cheque
 * number or reference, the amount, the open invoices it settles (oldest
 * due first, with Fill) and the advance left; for a Contractor the TDS
 * 194C suggestion, which an override with a reason can change.
 */
export function PartyPaymentScreen({
  projectId,
  partyType,
  partyId,
  direction = "out",
  today,
}: {
  projectId: string;
  partyType: PartyType;
  partyId?: string | null;
  direction?: "out" | "in";
  today?: string;
}) {
  const screen = PARTY_SCREENS[partyType];
  const paths = partyPaths(projectId, partyType);
  return (
    <div className="w-full">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{
            label: screen.plural,
            href: partyId == null ? paths.tab : paths.party(partyId),
          }}
          title={
            direction === "in"
              ? "Receive payment"
              : `Pay ${screen.label.toLowerCase()}`
          }
        />
        <PaymentForm
          projectId={projectId}
          partyType={partyType}
          fixedPartyId={partyId ?? null}
          initialDirection={partyType === "other_party" ? direction : "out"}
          today={today ?? localToday()}
        />
      </div>
    </div>
  );
}

function PaymentForm({
  projectId,
  partyType,
  fixedPartyId,
  initialDirection,
  today,
}: {
  projectId: string;
  partyType: PartyType;
  fixedPartyId: string | null;
  initialDirection: "out" | "in";
  today: string;
}) {
  const router = useRouter();
  const screen = PARTY_SCREENS[partyType];
  const paths = partyPaths(projectId, partyType);
  const record = useRecordPartyPayment();
  const uploads = useUploadPendingFinanceFiles("party_payment");
  const [files, setFiles] = useState<File[]>([]);
  const [allocations, setAllocations] = useState<AllocationValues>({});
  const [problem, setProblem] = useState<string | undefined>();
  const [duplicateWarning, setDuplicateWarning] = useState<{
    message: string;
    key: string;
  } | null>(null);
  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      partyId: fixedPartyId ?? "",
      direction: initialDirection,
      paymentDate: today,
      mode: "cash",
      accountId: "",
      chequeNumber: "",
      reference: "",
      modeDate: "",
      amount: "",
      tdsOverride: false,
      tdsAmount: "",
      tdsRate: "",
      tdsReason: "",
      paymentCategoryId: "",
      paidByMemberId: "",
      remarks: "",
    },
  });
  const { errors } = form.formState;
  const values = useWatch({ control: form.control });
  const partyId = values.partyId ?? "";
  const mode = values.mode ?? "cash";
  const flow = values.direction ?? "out";
  // "Save anyway" confirms the reference the warning was about; change the
  // reference, account, mode or amount and the check runs again.
  const duplicateKey = `${values.reference ?? ""}|${values.chequeNumber ?? ""}|${values.accountId ?? ""}|${mode}|${values.amount ?? ""}`;
  const duplicate =
    duplicateWarning?.key === duplicateKey ? duplicateWarning.message : null;
  const contractor = partyType === "contractor";
  const amountText = values.amount ?? "";
  const entered = isRupees(amountText) ? (rupeesToPaise(amountText) ?? 0) : 0;

  // Also read when the party is fixed, to name it on the form.
  const parties = useQuery(counterpartyOptionsQuery(partyType, projectId));
  const fixedPartyName =
    fixedPartyId == null
      ? null
      : (parties.data?.items.find((item) => item.id === fixedPartyId)?.name ??
        null);
  const members = useQuery(counterpartyOptionsQuery("team_member", null));
  const outstanding = useQuery({
    ...outstandingInvoicesQuery(
      projectId,
      partyType,
      partyId,
      flow === "in" ? "receivable" : "payable",
    ),
    enabled: partyId !== "",
  });

  const allocationRows = allocationsOf(allocations);
  const allocated = allocatedTotal(allocations);
  const suggestionInput = useDebounced({
    contractorId: partyId,
    projectId,
    paymentDate: values.paymentDate ?? today,
    settled: entered,
    allocations: allocationRows,
  });
  const suggestion = useQuery({
    ...tdsSuggestionQuery(suggestionInput),
    enabled:
      contractor &&
      suggestionInput.contractorId !== "" &&
      suggestionInput.settled > 0,
  });
  const suggested = suggestion.data;
  const override = values.tdsOverride === true;
  const tds = !contractor
    ? 0
    : override
      ? (rupeesToPaise(values.tdsAmount ?? "") ?? 0)
      : (suggested?.amount ?? 0);
  const settled = entered;
  const paid = contractor ? settled - tds : entered;
  const advance = settled - allocated;
  // The suggestion must match what is saved, or the server asks for a reason.
  const tdsStale =
    contractor &&
    !override &&
    settled > 0 &&
    (suggestion.isFetching ||
      suggestionInput.settled !== entered ||
      suggestionInput.contractorId !== partyId ||
      suggestionInput.paymentDate !== (values.paymentDate ?? today) ||
      JSON.stringify(suggestionInput.allocations) !==
        JSON.stringify(allocationRows));

  const submit = form.handleSubmit(async (input) => {
    setProblem(undefined);
    if (advance < 0) {
      setProblem(
        `The allocations come to ${money(allocated)}, more than the ${money(settled)} this payment settles.`,
      );
      return;
    }
    if (contractor && paid <= 0) {
      form.setError("amount", { message: "The TDS leaves nothing to pay" });
      return;
    }
    const confirm = duplicate != null;
    try {
      const payment = await record.mutateAsync({
        partyType,
        partyId: input.partyId,
        projectId,
        direction: input.direction,
        paymentDate: input.paymentDate,
        accountId: input.accountId,
        mode: input.mode,
        chequeNumber: input.mode === "cheque" ? input.chequeNumber : null,
        // Only what the chosen mode shows: Cheque hides the reference and
        // Cash the date, and a value typed under another mode stays behind.
        reference:
          input.mode === "cheque" || input.reference === ""
            ? null
            : input.reference,
        modeDate:
          input.mode === "cash" || input.modeDate === ""
            ? null
            : input.modeDate,
        amount: paid,
        ...(contractor
          ? {
              tdsAmount: tds,
              tdsRate: override && input.tdsRate !== "" ? input.tdsRate : null,
              tdsOverrideReason: override ? input.tdsReason : null,
            }
          : {}),
        paymentCategoryId:
          input.paymentCategoryId === "" ? null : input.paymentCategoryId,
        paidByMemberId:
          input.paidByMemberId === "" ? null : input.paidByMemberId,
        remarks: input.remarks.trim() === "" ? null : input.remarks,
        allocations: allocationRows,
        confirmDuplicateReference: confirm,
      });
      const { failed } = await uploads.uploadAll(payment.id, files);
      if (failed.length > 0)
        // The payment stands; its page lets the member add them again.
        console.warn(`Files not uploaded: ${failed.join(", ")}`);
      router.push(paths.payment(payment.id));
    } catch (error) {
      if (
        error instanceof QueryHttpError &&
        error.code === "DUPLICATE_REFERENCE"
      ) {
        setDuplicateWarning({ message: error.message, key: duplicateKey });
        return;
      }
      const { field, message } = fieldForCode(error, ERROR_FIELDS);
      if (field == null) setProblem(message);
      else form.setError(field, { message });
    }
  });

  const partyItems = (parties.data?.items ?? []).map((item) => ({
    value: item.id,
    label: item.name,
  }));
  const memberItems = [
    { value: ME, label: "Me" },
    ...(members.data?.items ?? []).map((item) => ({
      value: item.id,
      label: item.name,
    })),
  ];

  return (
    <form
      noValidate
      className="space-y-8"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <section aria-labelledby="payment-details" className="space-y-4">
        <h2 id="payment-details" className="font-semibold">
          Payment
        </h2>
        {fixedPartyId != null && (
          <div className="min-w-0 space-y-1">
            <p className="text-muted-foreground text-sm">{screen.label}</p>
            {fixedPartyName == null && parties.isPending ? (
              <SkeletonText size="base" width="10rem" />
            ) : (
              <p className="truncate font-medium">
                {fixedPartyName ?? "Not on this Project"}
              </p>
            )}
            <FieldError message={errors.partyId?.message} />
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {fixedPartyId == null && (
            <div className="min-w-0 space-y-1.5 sm:col-span-2">
              <Label htmlFor="payment-party" required>
                {screen.label}
              </Label>
              <Controller
                name="partyId"
                control={form.control}
                render={({ field }) => (
                  <Select
                    items={partyItems}
                    value={field.value === "" ? null : field.value}
                    onValueChange={(next) => {
                      if (typeof next === "string") {
                        field.onChange(next);
                        setAllocations({});
                      }
                    }}
                  >
                    <SelectTrigger
                      id="payment-party"
                      size="lg"
                      className="w-full min-w-0"
                      aria-required
                      aria-invalid={errors.partyId != null}
                    >
                      <SelectValue placeholder={`Choose a ${screen.label}`} />
                    </SelectTrigger>
                    <SelectContent align="start" alignItemWithTrigger={false}>
                      {partyItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError message={errors.partyId?.message} />
            </div>
          )}
          {partyType === "other_party" && (
            <div className="min-w-0 space-y-1.5 sm:col-span-2">
              <span id="payment-direction" className="text-sm font-medium">
                Direction
                <RequiredIndicator />
              </span>
              <Controller
                name="direction"
                control={form.control}
                render={({ field }) => (
                  <ToggleGroup
                    aria-labelledby="payment-direction"
                    value={[field.value]}
                    onValueChange={(value: string[]) => {
                      const next = value[0];
                      if (next === "out" || next === "in") {
                        field.onChange(next);
                        setAllocations({});
                      }
                    }}
                    variant="outline"
                    className="w-full"
                  >
                    <ToggleGroupItem value="out" className="flex-1">
                      Payment Out
                    </ToggleGroupItem>
                    <ToggleGroupItem value="in" className="flex-1">
                      Payment In
                    </ToggleGroupItem>
                  </ToggleGroup>
                )}
              />
            </div>
          )}
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="payment-date" required>
              Payment date
            </Label>
            <Input
              id="payment-date"
              type="date"
              className="h-10"
              aria-required
              aria-invalid={errors.paymentDate != null}
              {...form.register("paymentDate")}
            />
            <FieldError message={errors.paymentDate?.message} />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="payment-amount" required>
              {contractor ? "Amount settled (paid + TDS)" : "Amount"}
            </Label>
            <MoneyInput
              id="payment-amount"
              className="h-10"
              aria-required
              aria-invalid={errors.amount != null}
              {...form.register("amount")}
            />
            <FieldError message={errors.amount?.message} />
          </div>
          <div className="min-w-0 space-y-1.5 sm:col-span-2">
            <span id="payment-mode" className="text-sm font-medium">
              Mode
              <RequiredIndicator />
            </span>
            <Controller
              name="mode"
              control={form.control}
              render={({ field }) => (
                <ToggleGroup
                  aria-labelledby="payment-mode"
                  value={[field.value]}
                  onValueChange={(value: string[]) => {
                    const next = value[0] as Mode | undefined;
                    if (next != null && MODES.includes(next))
                      field.onChange(next);
                  }}
                  variant="outline"
                  className="w-full"
                >
                  {MODES.map((item) => (
                    <ToggleGroupItem key={item} value={item} className="flex-1">
                      {MODE_LABELS[item]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}
            />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="payment-account" required>
              {flow === "in" ? "Received into" : "Paid from"}
            </Label>
            <Controller
              name="accountId"
              control={form.control}
              render={({ field }) => (
                <AccountPicker
                  id="payment-account"
                  mode={mode}
                  value={field.value}
                  onChange={field.onChange}
                  invalid={errors.accountId != null}
                />
              )}
            />
            <FieldError message={errors.accountId?.message} />
          </div>
          {mode === "cheque" ? (
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="payment-cheque" required>
                Cheque number
              </Label>
              <Input
                id="payment-cheque"
                className="h-10"
                autoComplete="off"
                aria-required
                aria-invalid={errors.chequeNumber != null}
                {...form.register("chequeNumber")}
              />
              <FieldError message={errors.chequeNumber?.message} />
            </div>
          ) : (
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="payment-reference" required={mode !== "cash"}>
                {mode === "cash" ? "Reference (optional)" : "Reference"}
              </Label>
              <Input
                id="payment-reference"
                className="h-10"
                autoComplete="off"
                placeholder={mode === "cash" ? "" : "UTR or UPI reference"}
                aria-required={mode !== "cash"}
                aria-invalid={errors.reference != null}
                {...form.register("reference")}
              />
              <FieldError message={errors.reference?.message} />
            </div>
          )}
          {mode !== "cash" && (
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="payment-mode-date">
                {mode === "cheque" ? "Cheque date" : "Transfer date"}
              </Label>
              <Input
                id="payment-mode-date"
                type="date"
                className="h-10"
                {...form.register("modeDate")}
              />
            </div>
          )}
        </div>
      </section>

      {contractor && (
        <TdsBlock
          suggestion={suggested ?? null}
          loading={suggestion.isFetching}
          settled={settled}
          tds={tds}
          paid={paid}
          override={override}
          form={form}
        />
      )}

      <section aria-labelledby="payment-allocation" className="space-y-3">
        <div className="space-y-1">
          <h2 id="payment-allocation" className="font-semibold">
            Invoices it settles
          </h2>
          <p className="text-muted-foreground text-sm">
            Allocated {money(allocated)} of {money(settled)} · advance{" "}
            <span className={advance < 0 ? "text-destructive" : undefined}>
              {money(advance)}
            </span>
          </p>
        </div>
        {partyId === "" ? (
          <p className="text-muted-foreground text-sm">
            Choose the {screen.label} to see their open invoices.
          </p>
        ) : outstanding.data == null ? (
          <AllocationSkeleton />
        ) : (
          <AllocationTable
            invoices={outstanding.data.items}
            values={allocations}
            onChange={setAllocations}
            available={settled}
          />
        )}
      </section>

      <section aria-labelledby="payment-more" className="space-y-4">
        <h2 id="payment-more" className="font-semibold">
          More
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="payment-category">Payment Category</Label>
            <Controller
              name="paymentCategoryId"
              control={form.control}
              render={({ field }) => (
                <PaymentCategoryPicker
                  id="payment-category"
                  optional
                  value={field.value}
                  onChange={field.onChange}
                  invalid={errors.paymentCategoryId != null}
                />
              )}
            />
            <FieldError message={errors.paymentCategoryId?.message} />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="payment-paid-by">
              {flow === "in" ? "Received by" : "Paid by"}
            </Label>
            <Controller
              name="paidByMemberId"
              control={form.control}
              render={({ field }) => (
                <Select
                  items={memberItems}
                  value={field.value === "" ? ME : field.value}
                  onValueChange={(next) => {
                    if (typeof next === "string")
                      field.onChange(next === ME ? "" : next);
                  }}
                >
                  <SelectTrigger
                    id="payment-paid-by"
                    size="lg"
                    className="w-full min-w-0"
                    aria-invalid={errors.paidByMemberId != null}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    {memberItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError message={errors.paidByMemberId?.message} />
          </div>
          <div className="min-w-0 space-y-1.5 sm:col-span-2">
            <Label htmlFor="payment-remarks">Remarks</Label>
            <Textarea
              id="payment-remarks"
              rows={2}
              maxLength={500}
              {...form.register("remarks")}
            />
            <FieldError message={errors.remarks?.message} />
          </div>
          <div className="min-w-0 sm:col-span-2">
            <FinancePendingFilesField
              documentType="party_payment"
              value={files}
              onChange={setFiles}
              disabled={
                record.isPending || record.isSuccess || uploads.uploading
              }
            />
          </div>
        </div>
      </section>
      {uploads.uploading && (
        <p role="status" className="text-muted-foreground text-sm">
          Uploading files {uploads.done + 1} of {uploads.total}…
        </p>
      )}

      {duplicate != null && (
        <div
          role="alert"
          className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
        >
          <p>{duplicate}</p>
          <p>Press Save anyway to record it with the same reference.</p>
        </div>
      )}
      <FormAlert message={problem} />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          // Stays off once saved: the form refreshes before the payment's
          // page opens, and a second press would record it twice.
          disabled={
            record.isPending ||
            record.isSuccess ||
            uploads.uploading ||
            tdsStale
          }
        >
          {record.isPending
            ? "Saving…"
            : record.isSuccess
              ? "Opening the payment…"
              : duplicate != null
                ? "Save anyway"
                : `Record ${money(paid > 0 ? paid : 0)}`}
        </Button>
        <p className="text-muted-foreground text-sm">
          {flow === "in" ? "Received into" : "Paid from"} the account:{" "}
          {money(paid > 0 ? paid : 0)}
        </p>
      </div>
    </form>
  );
}

function TdsBlock({
  suggestion,
  loading,
  settled,
  tds,
  paid,
  override,
  form,
}: {
  suggestion: TdsSuggestion | null;
  loading: boolean;
  settled: number;
  tds: number;
  paid: number;
  override: boolean;
  form: ReturnType<typeof useForm<PaymentFormValues>>;
}) {
  const { errors } = form.formState;
  return (
    <section aria-labelledby="payment-tds" className="space-y-4">
      <div className="space-y-1">
        <h2 id="payment-tds" className="font-semibold">
          TDS {suggestion?.label ?? "194C"}
        </h2>
        <p className="text-muted-foreground text-sm" aria-live="polite">
          {settled <= 0
            ? "Enter the amount settled to see the suggestion."
            : suggestion == null
              ? loading
                ? "Working out the TDS…"
                : "No suggestion yet."
              : `${REASON_LABELS[suggestion.reason]}. Suggested ${money(suggestion.amount)} at ${suggestion.rate}% on ${money(suggestion.base)}${suggestion.catchUpBase > 0 ? `, including ${money(suggestion.catchUpBase)} caught up` : ""}.`}
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-3 rounded-lg border p-3 text-sm">
        <div className="min-w-0">
          <dt className="text-muted-foreground text-xs">Settled</dt>
          <dd className="tabular-nums">{money(settled)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground text-xs">TDS</dt>
          <dd className="tabular-nums">{money(tds)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground text-xs">Paid</dt>
          <dd className="font-semibold tabular-nums">{money(paid)}</dd>
        </div>
      </dl>
      {/* eslint-disable-next-line jsx-a11y/label-has-associated-control -- The Checkbox is nested through Controller's render prop. */}
      <Label className="flex items-center gap-2 font-normal">
        <Controller
          name="tdsOverride"
          control={form.control}
          render={({ field }) => (
            <Checkbox
              checked={field.value}
              onCheckedChange={(next) => {
                field.onChange(next);
                if (next && suggestion != null) {
                  form.setValue("tdsAmount", paiseToRupees(suggestion.amount));
                  form.setValue("tdsRate", suggestion.rate);
                }
              }}
            />
          )}
        />
        Change the TDS
      </Label>
      {override && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="payment-tds-amount">TDS amount</Label>
            <MoneyInput
              id="payment-tds-amount"
              className="h-10"
              aria-invalid={errors.tdsAmount != null}
              {...form.register("tdsAmount")}
            />
            <FieldError message={errors.tdsAmount?.message} />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="payment-tds-rate">Rate %</Label>
            <Input
              id="payment-tds-rate"
              className="h-10"
              inputMode="decimal"
              aria-invalid={errors.tdsRate != null}
              {...form.register("tdsRate")}
            />
            <FieldError message={errors.tdsRate?.message} />
          </div>
          <div className="min-w-0 space-y-1.5 sm:col-span-3">
            <Label htmlFor="payment-tds-reason" required>
              Reason for the change
            </Label>
            <Textarea
              id="payment-tds-reason"
              rows={2}
              maxLength={500}
              aria-required
              aria-invalid={errors.tdsReason != null}
              {...form.register("tdsReason")}
            />
            <FieldError message={errors.tdsReason?.message} />
          </div>
        </div>
      )}
    </section>
  );
}
