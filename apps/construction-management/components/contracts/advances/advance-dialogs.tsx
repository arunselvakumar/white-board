"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState, type ReactNode } from "react";
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
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { AccountPicker } from "@/components/finance/account-picker";
import {
  formatPaise,
  isRupees,
  MoneyInput,
  paiseToRupees,
  rupeesToPaise,
} from "@/components/money/money-input";
import {
  ADVANCE_KIND_LABELS,
  ADVANCE_KINDS,
  GUARANTEE_PURPOSE_LABELS,
  GUARANTEE_PURPOSES,
  RECOVERY_MODE_LABELS,
  RECOVERY_MODES,
  RETENTION_STAGE_LABELS,
  RETENTION_STAGES,
} from "@/src/contracts/domain/contract-terms";
import type {
  AdvanceInput,
  AdvanceUpdate,
  AdvancesRetention,
  ContractAdvance,
  ContractGuarantee,
  GuaranteeInput,
  ReleaseInput,
} from "@/src/queries/contracts-advances";

const MODES = ["cash", "cheque", "online", "upi"] as const;
const MODE_LABELS: Record<(typeof MODES)[number], string> = {
  cash: "Cash",
  cheque: "Cheque",
  online: "Online",
  upi: "UPI",
};

const options = <T extends string>(
  values: readonly T[],
  labels: Record<T, string>,
) => values.map((value) => ({ value, label: labels[value] }));

const money = (paise: number | null | undefined) =>
  paise == null ? "—" : formatPaise(paise);

const amountField = (message: string) =>
  z
    .string()
    .refine((value) => isRupees(value) && (rupeesToPaise(value) ?? 0) > 0, {
      message,
    });

const percentField = z
  .string()
  .refine(
    (value) =>
      value.trim() === "" ||
      (/^\d{1,3}(\.\d{1,2})?$/.test(value.trim()) &&
        Number(value) > 0 &&
        Number(value) <= 100),
    { message: "A percentage of more than 0 up to 100, two decimals." },
  );

/** A dialog's frame: title, description, the form body, an error and two buttons. */
function FormDialog({
  title,
  description,
  confirm,
  busyLabel,
  pending,
  error,
  onSubmit,
  onClose,
  children,
  destructive = false,
}: {
  title: string;
  description: ReactNode;
  confirm: string;
  busyLabel: string;
  pending: boolean;
  error: string | undefined;
  onSubmit: () => void;
  onClose: () => void;
  children: ReactNode;
  destructive?: boolean;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] grid-cols-1 overflow-y-auto sm:max-w-lg">
        <form
          noValidate
          className="flex min-w-0 flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle className="break-words">{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {children}
          <FormAlert message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Back
            </Button>
            <Button
              type="submit"
              variant={destructive ? "destructive" : "default"}
              disabled={pending}
            >
              {pending ? busyLabel : confirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-w-0 space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      <FieldError message={error} />
    </div>
  );
}

function PlainSelect<T extends string>({
  id,
  items,
  value,
  onChange,
  invalid,
  placeholder,
}: {
  id: string;
  items: readonly { value: T; label: string }[];
  value: string;
  onChange: (value: T) => void;
  invalid?: boolean;
  placeholder?: string;
}) {
  return (
    <Select
      items={items}
      value={value === "" ? null : value}
      onValueChange={(next) => {
        if (next == null) return;
        onChange(next as T);
      }}
    >
      <SelectTrigger
        id={id}
        size="lg"
        className="w-full min-w-0"
        aria-invalid={invalid}
      >
        <SelectValue placeholder={placeholder ?? "Choose…"} />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------------------
// Record an advance
// ---------------------------------------------------------------------------

const RecoverySchema = z
  .object({
    recoveryMode: z.enum(RECOVERY_MODES),
    recoveryPercent: percentField,
    recoveryAmount: z.string(),
  })
  .refine(
    (values) =>
      values.recoveryMode !== "fixed" ||
      (isRupees(values.recoveryAmount) &&
        (rupeesToPaise(values.recoveryAmount) ?? 0) > 0),
    {
      message: "Enter the amount each bill recovers.",
      path: ["recoveryAmount"],
    },
  );

const AdvanceSchema = z
  .object({
    kind: z.enum(ADVANCE_KINDS),
    amount: amountField("Enter the advance: more than ₹0."),
    advanceOn: z.string().min(1, "Pick the date."),
    recoveryMode: z.enum(RECOVERY_MODES),
    recoveryPercent: percentField,
    recoveryAmount: z.string(),
    mode: z.enum(MODES),
    accountId: z.string().min(1, "Choose the account."),
    chequeNumber: z.string(),
    reference: z.string(),
    modeDate: z.string(),
    remarks: z.string().max(500, "Use at most 500 characters."),
  })
  .refine(
    (values) =>
      values.recoveryMode !== "fixed" ||
      (isRupees(values.recoveryAmount) &&
        (rupeesToPaise(values.recoveryAmount) ?? 0) > 0),
    {
      message: "Enter the amount each bill recovers.",
      path: ["recoveryAmount"],
    },
  )
  .refine(
    (values) => values.mode !== "cheque" || values.chequeNumber.trim() !== "",
    { message: "Enter the cheque number.", path: ["chequeNumber"] },
  )
  .refine(
    (values) =>
      (values.mode !== "online" && values.mode !== "upi") ||
      values.reference.trim() !== "",
    { message: "Enter the UTR or UPI reference.", path: ["reference"] },
  );

type AdvanceValues = z.infer<typeof AdvanceSchema>;

/**
 * Record an advance (CM-1108): given to the Work Order's Contractor or
 * received from the Client, with how later bills recover it, and the
 * account and mode it moved by, like a party payment. It is saved as an
 * on-account payment in Payments.
 */
export function RecordAdvanceDialog({
  view,
  today,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  view: AdvancesRetention;
  today: string;
  pending: boolean;
  error: string | undefined;
  onConfirm: (input: Omit<AdvanceInput, "projectId" | "workOrderId">) => void;
  onClose: () => void;
}) {
  const id = useId();
  const given = view.side === "contractor";
  const form = useForm<AdvanceValues>({
    resolver: zodResolver(AdvanceSchema),
    defaultValues: {
      kind: "mobilisation",
      amount: "",
      advanceOn: today,
      recoveryMode: "percent",
      recoveryPercent: (view.defaultRecoveryPercent ?? "").replace(
        /\.?0+$/,
        "",
      ),
      recoveryAmount: "",
      mode: "online",
      accountId: "",
      chequeNumber: "",
      reference: "",
      modeDate: "",
      remarks: "",
    },
  });
  const { control, register, formState } = form;
  const { errors } = formState;
  const mode = useWatch({ control, name: "mode" });
  const recoveryMode = useWatch({ control, name: "recoveryMode" });
  return (
    <FormDialog
      title={given ? "Record an advance given" : "Record an advance received"}
      description={
        given
          ? `Paid to ${view.party?.name ?? "the Contractor"} on account. Later bills on this Work Order recover it.`
          : `Received from ${view.party?.name ?? "the Client"} on account. Later Client Bills recover it.`
      }
      confirm="Record advance"
      busyLabel="Recording…"
      pending={pending}
      error={error}
      onClose={onClose}
      onSubmit={() => {
        void form.handleSubmit((values) => {
          onConfirm({
            kind: values.kind,
            amount: rupeesToPaise(values.amount) ?? 0,
            advanceOn: values.advanceOn,
            recoveryMode: values.recoveryMode,
            recoveryValue:
              values.recoveryMode === "percent"
                ? values.recoveryPercent.trim() === ""
                  ? null
                  : values.recoveryPercent.trim()
                : (rupeesToPaise(values.recoveryAmount) ?? 0),
            remarks: values.remarks.trim() === "" ? null : values.remarks,
            accountId: values.accountId,
            mode: values.mode,
            chequeNumber:
              values.mode === "cheque" ? values.chequeNumber.trim() : null,
            reference:
              values.mode === "cheque" || values.reference.trim() === ""
                ? null
                : values.reference.trim(),
            modeDate:
              values.mode === "cash" || values.modeDate === ""
                ? null
                : values.modeDate,
          });
        })();
      }}
    >
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <Field id={`${id}-kind`} label="Kind" error={errors.kind?.message}>
          <Controller
            name="kind"
            control={control}
            render={({ field }) => (
              <PlainSelect
                id={`${id}-kind`}
                items={options(ADVANCE_KINDS, ADVANCE_KIND_LABELS)}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </Field>
        <Field
          id={`${id}-amount`}
          label="Amount"
          error={errors.amount?.message}
        >
          <MoneyInput
            id={`${id}-amount`}
            className="h-10"
            aria-invalid={errors.amount != null}
            {...register("amount")}
          />
        </Field>
        <Field
          id={`${id}-date`}
          label={given ? "Paid on" : "Received on"}
          error={errors.advanceOn?.message}
        >
          <Input
            id={`${id}-date`}
            type="date"
            className="h-10"
            max={today}
            {...register("advanceOn")}
          />
        </Field>
        <Field id={`${id}-recovery-mode`} label="Recovered as">
          <Controller
            name="recoveryMode"
            control={control}
            render={({ field }) => (
              <PlainSelect
                id={`${id}-recovery-mode`}
                items={options(RECOVERY_MODES, RECOVERY_MODE_LABELS)}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </Field>
        {recoveryMode === "percent" ? (
          <Field
            id={`${id}-recovery-percent`}
            label="Recovery % of each bill's gross"
            error={errors.recoveryPercent?.message}
          >
            <Input
              id={`${id}-recovery-percent`}
              inputMode="decimal"
              className="h-10"
              aria-invalid={errors.recoveryPercent != null}
              {...register("recoveryPercent")}
            />
          </Field>
        ) : (
          <Field
            id={`${id}-recovery-amount`}
            label="Recovered per bill"
            error={errors.recoveryAmount?.message}
          >
            <MoneyInput
              id={`${id}-recovery-amount`}
              className="h-10"
              aria-invalid={errors.recoveryAmount != null}
              {...register("recoveryAmount")}
            />
          </Field>
        )}
        <Field id={`${id}-mode`} label="Mode">
          <Controller
            name="mode"
            control={control}
            render={({ field }) => (
              <PlainSelect
                id={`${id}-mode`}
                items={options(MODES, MODE_LABELS)}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </Field>
        <Field
          id={`${id}-account`}
          label={given ? "Paid from" : "Received into"}
          error={errors.accountId?.message}
        >
          <Controller
            name="accountId"
            control={control}
            render={({ field }) => (
              <AccountPicker
                id={`${id}-account`}
                mode={mode}
                value={field.value}
                onChange={field.onChange}
                invalid={errors.accountId != null}
              />
            )}
          />
        </Field>
        {mode === "cheque" ? (
          <Field
            id={`${id}-cheque`}
            label="Cheque number"
            error={errors.chequeNumber?.message}
          >
            <Input
              id={`${id}-cheque`}
              className="h-10"
              autoComplete="off"
              {...register("chequeNumber")}
            />
          </Field>
        ) : (
          <Field
            id={`${id}-reference`}
            label={mode === "cash" ? "Reference (optional)" : "Reference"}
            error={errors.reference?.message}
          >
            <Input
              id={`${id}-reference`}
              className="h-10"
              autoComplete="off"
              placeholder={mode === "cash" ? "" : "UTR or UPI reference"}
              {...register("reference")}
            />
          </Field>
        )}
        {mode !== "cash" ? (
          <Field
            id={`${id}-mode-date`}
            label={mode === "cheque" ? "Cheque date" : "Transfer date"}
          >
            <Input
              id={`${id}-mode-date`}
              type="date"
              className="h-10"
              {...register("modeDate")}
            />
          </Field>
        ) : null}
        <Field
          id={`${id}-remarks`}
          label="Remarks"
          error={errors.remarks?.message}
          className="sm:col-span-2"
        >
          <Textarea id={`${id}-remarks`} rows={2} {...register("remarks")} />
        </Field>
      </div>
      {view.agreedMobilisation != null ? (
        <p className="text-muted-foreground text-xs">
          The Work Order agrees a mobilisation advance of{" "}
          {money(view.agreedMobilisation)}; {money(view.advanceTotals.amount)}{" "}
          is given so far.
        </p>
      ) : null}
    </FormDialog>
  );
}

// ---------------------------------------------------------------------------
// Change how an advance is recovered
// ---------------------------------------------------------------------------

type RecoveryValues = z.infer<typeof RecoverySchema>;

export function EditRecoveryDialog({
  advance,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  advance: ContractAdvance;
  pending: boolean;
  error: string | undefined;
  onConfirm: (input: AdvanceUpdate) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [remarks, setRemarks] = useState(advance.remarks ?? "");
  const form = useForm<RecoveryValues>({
    resolver: zodResolver(RecoverySchema),
    defaultValues: {
      recoveryMode: advance.recoveryMode,
      recoveryPercent: (advance.recoveryPercent ?? "").replace(/\.?0+$/, ""),
      recoveryAmount: paiseToRupees(advance.recoveryAmount),
    },
  });
  const { control, register, formState } = form;
  const { errors } = formState;
  const recoveryMode = useWatch({ control, name: "recoveryMode" });
  return (
    <FormDialog
      title="Change the recovery"
      description={`${ADVANCE_KIND_LABELS[advance.kind]} of ${money(advance.amount)}: how each later bill recovers it. The amount and payment stay; delete the advance to change them.`}
      confirm="Save"
      busyLabel="Saving…"
      pending={pending}
      error={error}
      onClose={onClose}
      onSubmit={() => {
        void form.handleSubmit((values) => {
          onConfirm({
            expectedUpdatedAt: advance.updatedAt,
            recoveryMode: values.recoveryMode,
            recoveryValue:
              values.recoveryMode === "percent"
                ? values.recoveryPercent.trim() === ""
                  ? null
                  : values.recoveryPercent.trim()
                : (rupeesToPaise(values.recoveryAmount) ?? 0),
            remarks: remarks.trim() === "" ? null : remarks,
          });
        })();
      }}
    >
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <Field id={`${id}-mode`} label="Recovered as">
          <Controller
            name="recoveryMode"
            control={control}
            render={({ field }) => (
              <PlainSelect
                id={`${id}-mode`}
                items={options(RECOVERY_MODES, RECOVERY_MODE_LABELS)}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </Field>
        {recoveryMode === "percent" ? (
          <Field
            id={`${id}-percent`}
            label="Recovery % of each bill's gross"
            error={errors.recoveryPercent?.message}
          >
            <Input
              id={`${id}-percent`}
              inputMode="decimal"
              className="h-10"
              {...register("recoveryPercent")}
            />
          </Field>
        ) : (
          <Field
            id={`${id}-amount`}
            label="Recovered per bill"
            error={errors.recoveryAmount?.message}
          >
            <MoneyInput
              id={`${id}-amount`}
              className="h-10"
              {...register("recoveryAmount")}
            />
          </Field>
        )}
        <Field id={`${id}-remarks`} label="Remarks" className="sm:col-span-2">
          <Textarea
            id={`${id}-remarks`}
            rows={2}
            value={remarks}
            onChange={(event) => {
              setRemarks(event.target.value);
            }}
          />
        </Field>
      </div>
    </FormDialog>
  );
}

// ---------------------------------------------------------------------------
// Bank guarantees
// ---------------------------------------------------------------------------

const GuaranteeSchema = z
  .object({
    purpose: z.enum(GUARANTEE_PURPOSES),
    number: z
      .string()
      .trim()
      .min(1, "Enter the guarantee number.")
      .max(60, "Use at most 60 characters."),
    bank: z
      .string()
      .trim()
      .min(1, "Enter the bank.")
      .max(120, "Use at most 120 characters."),
    amount: amountField("Enter the guarantee's amount: more than ₹0."),
    issuedOn: z.string().min(1, "Pick the issue date."),
    expiresOn: z.string().min(1, "Pick the expiry date."),
    advanceId: z.string(),
    remarks: z.string().max(500, "Use at most 500 characters."),
  })
  .refine((values) => values.expiresOn >= values.issuedOn, {
    message: "It expires on or after its issue date.",
    path: ["expiresOn"],
  })
  .refine((values) => values.purpose !== "advance" || values.advanceId !== "", {
    message: "Pick the advance it secures.",
    path: ["advanceId"],
  });

type GuaranteeValues = z.infer<typeof GuaranteeSchema>;

/** Add or edit a bank guarantee: number, bank, amount, dates, what it secures. */
export function GuaranteeDialog({
  view,
  guarantee,
  today,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  view: AdvancesRetention;
  /** Null to add one. */
  guarantee: ContractGuarantee | null;
  today: string;
  pending: boolean;
  error: string | undefined;
  onConfirm: (input: Omit<GuaranteeInput, "projectId" | "workOrderId">) => void;
  onClose: () => void;
}) {
  const id = useId();
  const form = useForm<GuaranteeValues>({
    resolver: zodResolver(GuaranteeSchema),
    defaultValues: {
      purpose: guarantee?.purpose ?? "retention",
      number: guarantee?.number ?? "",
      bank: guarantee?.bank ?? "",
      amount: paiseToRupees(guarantee?.amount ?? null),
      issuedOn: guarantee?.issuedOn ?? today,
      expiresOn: guarantee?.expiresOn ?? "",
      advanceId: guarantee?.advanceId ?? "",
      remarks: guarantee?.remarks ?? "",
    },
  });
  const { control, register, formState } = form;
  const { errors } = formState;
  const purpose = useWatch({ control, name: "purpose" });
  const advances = view.advances.map((advance) => ({
    value: advance.id,
    label: `${ADVANCE_KIND_LABELS[advance.kind]} of ${advance.advanceOn} (${money(advance.amount)})`,
  }));
  return (
    <FormDialog
      title={guarantee == null ? "Add a bank guarantee" : "Edit bank guarantee"}
      description="A guarantee for an advance, for retention (retention can then be released early against it), or for performance. The daily notice warns 30 days before it expires."
      confirm={guarantee == null ? "Add guarantee" : "Save"}
      busyLabel="Saving…"
      pending={pending}
      error={error}
      onClose={onClose}
      onSubmit={() => {
        void form.handleSubmit((values) => {
          onConfirm({
            purpose: values.purpose,
            number: values.number,
            bank: values.bank,
            amount: rupeesToPaise(values.amount) ?? 0,
            issuedOn: values.issuedOn,
            expiresOn: values.expiresOn,
            advanceId: values.purpose === "advance" ? values.advanceId : null,
            remarks: values.remarks.trim() === "" ? null : values.remarks,
          });
        })();
      }}
    >
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <Field id={`${id}-purpose`} label="Secures">
          <Controller
            name="purpose"
            control={control}
            render={({ field }) => (
              <PlainSelect
                id={`${id}-purpose`}
                items={options(GUARANTEE_PURPOSES, GUARANTEE_PURPOSE_LABELS)}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </Field>
        {purpose === "advance" ? (
          <Field
            id={`${id}-advance`}
            label="Advance"
            error={errors.advanceId?.message}
          >
            <Controller
              name="advanceId"
              control={control}
              render={({ field }) => (
                <PlainSelect
                  id={`${id}-advance`}
                  items={advances}
                  value={field.value}
                  onChange={field.onChange}
                  invalid={errors.advanceId != null}
                  placeholder={
                    advances.length === 0
                      ? "No advance yet"
                      : "Pick the advance"
                  }
                />
              )}
            />
          </Field>
        ) : null}
        <Field
          id={`${id}-number`}
          label="Guarantee number"
          error={errors.number?.message}
        >
          <Input
            id={`${id}-number`}
            className="h-10"
            autoComplete="off"
            {...register("number")}
          />
        </Field>
        <Field id={`${id}-bank`} label="Bank" error={errors.bank?.message}>
          <Input
            id={`${id}-bank`}
            className="h-10"
            autoComplete="off"
            {...register("bank")}
          />
        </Field>
        <Field
          id={`${id}-amount`}
          label="Amount"
          error={errors.amount?.message}
        >
          <MoneyInput
            id={`${id}-amount`}
            className="h-10"
            {...register("amount")}
          />
        </Field>
        <Field
          id={`${id}-issued`}
          label="Issued on"
          error={errors.issuedOn?.message}
        >
          <Input
            id={`${id}-issued`}
            type="date"
            className="h-10"
            max={today}
            {...register("issuedOn")}
          />
        </Field>
        <Field
          id={`${id}-expires`}
          label="Expires on"
          error={errors.expiresOn?.message}
        >
          <Input
            id={`${id}-expires`}
            type="date"
            className="h-10"
            {...register("expiresOn")}
          />
        </Field>
        <Field id={`${id}-remarks`} label="Remarks" className="sm:col-span-2">
          <Textarea id={`${id}-remarks`} rows={2} {...register("remarks")} />
        </Field>
      </div>
    </FormDialog>
  );
}

/** A date, for marking a guarantee released or recording a completion date. */
export function DateDialog({
  title,
  description,
  label,
  initial,
  min,
  max,
  confirm,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  description: ReactNode;
  label: string;
  initial: string;
  min?: string;
  max: string;
  confirm: string;
  pending: boolean;
  error: string | undefined;
  onConfirm: (date: string) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [date, setDate] = useState(initial);
  const [problem, setProblem] = useState<string | undefined>();
  return (
    <FormDialog
      title={title}
      description={description}
      confirm={confirm}
      busyLabel="Saving…"
      pending={pending}
      error={error}
      onClose={onClose}
      onSubmit={() => {
        if (date === "" || date > max || (min != null && date < min)) {
          setProblem(
            min == null
              ? "Pick a date up to today."
              : "Pick a date from the start date up to today.",
          );
          return;
        }
        setProblem(undefined);
        onConfirm(date);
      }}
    >
      <Field id={`${id}-date`} label={label} error={problem}>
        <Input
          id={`${id}-date`}
          type="date"
          className="h-10"
          min={min}
          max={max}
          value={date}
          aria-invalid={problem != null}
          onChange={(event) => {
            setDate(event.target.value);
          }}
        />
      </Field>
    </FormDialog>
  );
}

// ---------------------------------------------------------------------------
// Release retention
// ---------------------------------------------------------------------------

type ReleaseProblems = Partial<
  Record<"amount" | "releasedOn" | "guarantee" | "reason", string>
>;

/**
 * Release retention (CM-1108): the stage, its suggested amount (completion
 * % on completion, the rest at the DLP end), the date, a live retention
 * guarantee when released against one, and a reason for "other" or a DLP
 * end before the DLP ends (Approve only).
 */
export function ReleaseRetentionDialog({
  view,
  today,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  view: AdvancesRetention;
  today: string;
  pending: boolean;
  error: string | undefined;
  onConfirm: (input: Omit<ReleaseInput, "projectId" | "workOrderId">) => void;
  onClose: () => void;
}) {
  const id = useId();
  const suggestionOf = (stage: (typeof RETENTION_STAGES)[number]) =>
    stage === "completion"
      ? view.retention.completionSuggestion
      : view.retention.dlpEndSuggestion;
  // The completion stage comes first while it still has something to
  // release, even when the DLP has already ended (no DLP months, or a late
  // release); only then does the DLP-end stage take the rest.
  const [stage, setStage] = useState<(typeof RETENTION_STAGES)[number]>(
    (view.retention.completionSuggestion ?? 0) > 0 || !view.dlp.ended
      ? "completion"
      : "dlp_end",
  );
  const [amount, setAmount] = useState(paiseToRupees(suggestionOf(stage)));
  const [releasedOn, setReleasedOn] = useState(today);
  const [guaranteeId, setGuaranteeId] = useState("");
  const [reason, setReason] = useState("");
  const [problems, setProblems] = useState<ReleaseProblems>({});
  const guarantees = view.guarantees
    .filter((row) => row.purpose === "retention" && row.status === "live")
    .map((row) => ({ value: row.id, label: `${row.number} · ${row.bank}` }));
  const early =
    stage === "dlp_end" &&
    view.dlp.endsOn != null &&
    releasedOn < view.dlp.endsOn;
  const needsReason = stage === "other" || early;
  const holder = view.side === "contractor" ? "held" : "receivable";
  return (
    <FormDialog
      title="Release retention"
      description={`${money(view.retention.releasable)} of retention is ${holder}. The release becomes ${view.side === "contractor" ? "a payable invoice to the Contractor" : "a receivable invoice to the Client"} in Payments.`}
      confirm="Release"
      busyLabel="Releasing…"
      pending={pending}
      error={error}
      onClose={onClose}
      onSubmit={() => {
        const found: ReleaseProblems = {};
        const paise = rupeesToPaise(amount) ?? 0;
        if (!isRupees(amount) || paise <= 0)
          found.amount = "Enter an amount of more than ₹0.";
        else if (paise > (view.retention.releasable ?? 0))
          found.amount = `At most ${money(view.retention.releasable)} is left to release.`;
        if (releasedOn === "" || releasedOn > today)
          found.releasedOn = "Pick a date up to today.";
        if (stage === "bank_guarantee" && guaranteeId === "")
          found.guarantee = "Pick the retention guarantee.";
        if (needsReason && reason.trim() === "")
          found.reason = early
            ? "Say why it is released before the DLP ends."
            : "Say why it is released.";
        setProblems(found);
        if (Object.keys(found).length > 0) return;
        onConfirm({
          stage,
          amount: paise,
          releasedOn,
          reason: reason.trim() === "" ? null : reason.trim(),
          bankGuaranteeId: stage === "bank_guarantee" ? guaranteeId : null,
        });
      }}
    >
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <Field id={`${id}-stage`} label="Stage">
          <PlainSelect
            id={`${id}-stage`}
            items={options(RETENTION_STAGES, RETENTION_STAGE_LABELS)}
            value={stage}
            onChange={(next) => {
              setStage(next);
              setAmount(paiseToRupees(suggestionOf(next)));
            }}
          />
        </Field>
        <Field id={`${id}-amount`} label="Amount" error={problems.amount}>
          <MoneyInput
            id={`${id}-amount`}
            className="h-10"
            value={amount}
            aria-invalid={problems.amount != null}
            onChange={(event) => {
              setAmount(event.target.value);
            }}
          />
        </Field>
        <Field
          id={`${id}-date`}
          label="Released on"
          error={problems.releasedOn}
        >
          <Input
            id={`${id}-date`}
            type="date"
            className="h-10"
            max={today}
            value={releasedOn}
            onChange={(event) => {
              setReleasedOn(event.target.value);
            }}
          />
        </Field>
        {stage === "bank_guarantee" ? (
          <Field
            id={`${id}-guarantee`}
            label="Against bank guarantee"
            error={problems.guarantee}
          >
            <PlainSelect
              id={`${id}-guarantee`}
              items={guarantees}
              value={guaranteeId}
              onChange={setGuaranteeId}
              invalid={problems.guarantee != null}
              placeholder={
                guarantees.length === 0
                  ? "No live retention guarantee"
                  : "Pick the guarantee"
              }
            />
          </Field>
        ) : null}
        <Field
          id={`${id}-reason`}
          label={needsReason ? "Reason" : "Reason (optional)"}
          error={problems.reason}
          className="sm:col-span-2"
        >
          <Textarea
            id={`${id}-reason`}
            rows={2}
            value={reason}
            aria-invalid={problems.reason != null}
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
        </Field>
      </div>
      <p className="text-muted-foreground text-xs">
        Suggested: on completion {money(view.retention.completionSuggestion)} (
        {view.retention.completionPercent.replace(/\.?0+$/, "")}% of the
        retention), at the end of the DLP{" "}
        {money(view.retention.dlpEndSuggestion)}.
        {early
          ? view.allowed.releaseEarly
            ? ` The DLP ends on ${view.dlp.endsOn ?? ""}: releasing earlier needs a reason.`
            : ` The DLP ends on ${view.dlp.endsOn ?? ""}: only someone who can approve may release it earlier.`
          : ""}
      </p>
    </FormDialog>
  );
}
