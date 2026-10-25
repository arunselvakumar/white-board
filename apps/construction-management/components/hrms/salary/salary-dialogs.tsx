"use client";

import { zodResolver } from "@hookform/resolvers/zod";
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
import { FieldTitle } from "@repo/ui/components/field";
import { Label, RequiredIndicator } from "@repo/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@repo/ui/components/radio-group";
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
  isRupees,
  MoneyInput,
  rupeesToPaise,
} from "@/components/money/money-input";
import { fieldForCode } from "@/lib/server-errors";
import {
  useSalaryCommand,
  type SalarySlipModel,
} from "@/src/queries/hrms-salary";

import { money } from "./salary-format";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Server refusals about the account, shown under "Paid from" (CM-707). */
const ACCOUNT_CODES = {
  ACCOUNT_REQUIRED: "accountId",
  ACCOUNT_NOT_FOUND: "accountId",
  ACCOUNT_NOT_YOURS: "accountId",
  ACCOUNT_MODE_MISMATCH: "accountId",
} as const;

/** "Paid from": Cash → a Cash or petty-cash account, Bank → a Bank account. */
function PaidFromField({
  id,
  mode,
  value,
  onChange,
  error,
}: {
  id: string;
  mode: "cash" | "bank";
  value: string;
  onChange: (accountId: string) => void;
  error: string | undefined;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} required>
        Paid from
      </Label>
      <AccountPicker
        required
        id={id}
        value={value}
        onChange={onChange}
        mode={mode}
        invalid={error != null}
      />
      <FieldError message={error} />
    </div>
  );
}

function ModeRadios({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: "cash" | "bank";
  onChange: (value: "cash" | "bank") => void;
}) {
  return (
    <RadioGroup
      aria-label="Paid by"
      aria-required
      value={value}
      onValueChange={(next) => {
        onChange(next as "cash" | "bank");
      }}
      className="grid grid-cols-2 gap-2"
    >
      {(["cash", "bank"] as const).map((mode) => (
        <div
          key={mode}
          className="bg-card flex items-center gap-3 rounded-lg border p-3"
        >
          <RadioGroupItem id={`${idPrefix}-${mode}`} value={mode} />
          <Label htmlFor={`${idPrefix}-${mode}`}>
            {mode === "cash" ? "Cash" : "Bank"}
          </Label>
        </div>
      ))}
    </RadioGroup>
  );
}

// ---------------------------------------------------------------------------
// Mark Paid
// ---------------------------------------------------------------------------

const markPaidSchema = z.object({
  mode: z.enum(["cash", "bank"]),
  accountId: z.string().min(1, "Choose the account it was paid from"),
  paymentDate: z.string().regex(DATE_RE, "Enter the date it was paid"),
  reference: z.string().trim().max(100, "Keep it to 100 characters"),
});

type MarkPaidValues = z.infer<typeof markPaidSchema>;

/**
 * Mark Salaries as Paid (CM-317): Approved slips, with mode, the account it
 * was paid from (CM-707), date and reference. Each slip's net payable
 * leaves that account.
 */
export function MarkPaidDialog({
  open,
  slips,
  today,
  onClose,
  onDone,
}: {
  open: boolean;
  slips: readonly SalarySlipModel[];
  today: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const total = slips.every((slip) => slip.amounts != null)
    ? slips.reduce((sum, slip) => sum + (slip.amounts?.netPayable ?? 0), 0)
    : null;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark Salaries as Paid</DialogTitle>
          <DialogDescription>
            {slips.length === 1
              ? "1 salary"
              : `${String(slips.length)} salaries`}
            {total == null ? "" : ` · ${money(total)} net`}. Each salary&apos;s
            net payable is paid out of the account you choose.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <MarkPaidForm slips={slips} today={today} onDone={onDone} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function MarkPaidForm({
  slips,
  today,
  onDone,
}: {
  slips: readonly SalarySlipModel[];
  today: string;
  onDone: (message: string) => void;
}) {
  const command = useSalaryCommand();
  const form = useForm<MarkPaidValues>({
    resolver: zodResolver(markPaidSchema),
    defaultValues: {
      mode: "bank",
      // The account picker fills in the default for the mode.
      accountId: "",
      paymentDate: today,
      reference: "",
    },
  });
  const { errors } = form.formState;
  const mode = useWatch({ control: form.control, name: "mode" });
  const submit = form.handleSubmit(async (values) => {
    try {
      await command.mutateAsync({
        kind: "mark-paid",
        slips,
        mode: values.mode,
        accountId: values.accountId,
        paymentDate: values.paymentDate,
        reference: values.reference === "" ? null : values.reference,
      });
      onDone(
        slips.length === 1
          ? "Marked 1 salary as paid."
          : `Marked ${String(slips.length)} salaries as paid.`,
      );
    } catch (error) {
      const { field, message } = fieldForCode(error, {
        PAYMENT_DATE_INVALID: "paymentDate",
        PAYMENT_DATE_IN_FUTURE: "paymentDate",
        PAYMENT_REFERENCE_TOO_LONG: "reference",
        PAYMENT_MODE_INVALID: "mode",
        ...ACCOUNT_CODES,
      } as const);
      form.setError(field ?? "root", { message });
    }
  });
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <div className="space-y-1.5">
        <FieldTitle className="leading-none">
          Paid by
          <RequiredIndicator className="-ms-1" />
        </FieldTitle>
        <Controller
          name="mode"
          control={form.control}
          render={({ field }) => (
            <ModeRadios
              idPrefix="salary-paid-mode"
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </div>
      <Controller
        name="accountId"
        control={form.control}
        render={({ field }) => (
          <PaidFromField
            id="salary-paid-account"
            mode={mode}
            value={field.value}
            onChange={field.onChange}
            error={errors.accountId?.message}
          />
        )}
      />
      <div className="space-y-1.5">
        <Label htmlFor="salary-paid-date" required>
          Paid on
        </Label>
        <Input
          id="salary-paid-date"
          aria-required
          type="date"
          max={today}
          aria-invalid={errors.paymentDate != null}
          {...form.register("paymentDate")}
        />
        <FieldError message={errors.paymentDate?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="salary-paid-reference">Reference (optional)</Label>
        <Input
          id="salary-paid-reference"
          placeholder="UTR, cheque or voucher number"
          aria-invalid={errors.reference != null}
          {...form.register("reference")}
        />
        <FieldError message={errors.reference?.message} />
      </div>
      <FormAlert message={errors.root?.message} />
      <DialogFooter>
        <Button type="submit" disabled={command.isPending}>
          {command.isPending ? "Saving…" : "Mark as Paid"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Pay Advance
// ---------------------------------------------------------------------------

export type AdvanceMember = {
  memberId: string;
  name: string;
  designationName: string | null;
};

const advanceSchema = z.object({
  memberId: z.string().min(1, "Choose a Team Member"),
  amount: z
    .string()
    .refine((value) => isRupees(value) && (rupeesToPaise(value) ?? 0) > 0, {
      message: "Enter an amount above ₹0",
    }),
  instalments: z
    .string()
    .regex(/^\d{1,2}$/, "Enter 1 to 24")
    .refine((value) => Number(value) >= 1 && Number(value) <= 24, {
      message: "Enter 1 to 24",
    }),
  advanceDate: z.string().regex(DATE_RE, "Enter the date it was paid"),
  mode: z.enum(["cash", "bank"]),
  accountId: z.string().min(1, "Choose the account it was paid from"),
  reference: z.string().trim().max(100, "Keep it to 100 characters"),
  reason: z.string().trim().max(500, "Keep it to 500 characters"),
});

type AdvanceValues = z.infer<typeof advanceSchema>;

/**
 * Pay Advance Salary (CM-317, ADR CM-0012 §15): paid now, recovered in
 * instalments from the following regular salaries.
 */
export function PayAdvanceDialog({
  open,
  members,
  today,
  onClose,
  onDone,
}: {
  open: boolean;
  members: readonly AdvanceMember[];
  today: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pay Advance Salary</DialogTitle>
          <DialogDescription>
            Each later salary takes off one instalment until the advance is
            recovered. The slip shows it as Advance Recovered.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <AdvanceForm members={members} today={today} onDone={onDone} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AdvanceForm({
  members,
  today,
  onDone,
}: {
  members: readonly AdvanceMember[];
  today: string;
  onDone: (message: string) => void;
}) {
  const command = useSalaryCommand();
  const form = useForm<AdvanceValues>({
    resolver: zodResolver(advanceSchema),
    defaultValues: {
      memberId: "",
      amount: "",
      instalments: "1",
      advanceDate: today,
      mode: "cash",
      accountId: "",
      reference: "",
      reason: "",
    },
  });
  const { errors } = form.formState;
  const mode = useWatch({ control: form.control, name: "mode" });
  const items = members.map((member) => ({
    value: member.memberId,
    label:
      member.designationName == null
        ? member.name
        : `${member.name} · ${member.designationName}`,
  }));
  const submit = form.handleSubmit(async (values) => {
    try {
      await command.mutateAsync({
        kind: "advance",
        memberId: values.memberId,
        amount: rupeesToPaise(values.amount) ?? 0,
        instalments: Number(values.instalments),
        advanceDate: values.advanceDate,
        mode: values.mode,
        accountId: values.accountId,
        reference: values.reference === "" ? null : values.reference,
        reason: values.reason === "" ? null : values.reason,
      });
      const name =
        members.find((member) => member.memberId === values.memberId)?.name ??
        "the member";
      onDone(`Advance of ₹${values.amount} paid to ${name}.`);
    } catch (error) {
      const { field, message } = fieldForCode(error, {
        TEAM_MEMBER_NOT_FOUND: "memberId",
        SALARY_NOT_CONFIGURED: "memberId",
        SALARY_OWN_ADVANCE: "memberId",
        ADVANCE_AMOUNT_INVALID: "amount",
        AMOUNT_TOO_LARGE: "amount",
        ADVANCE_INSTALMENTS_INVALID: "instalments",
        PAYMENT_DATE_INVALID: "advanceDate",
        PAYMENT_DATE_IN_FUTURE: "advanceDate",
        PAYMENT_REFERENCE_TOO_LONG: "reference",
        ADVANCE_REASON_TOO_LONG: "reason",
        ...ACCOUNT_CODES,
      } as const);
      form.setError(field ?? "root", { message });
    }
  });
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="salary-advance-member" required>
          Team Member
        </Label>
        <Controller
          name="memberId"
          control={form.control}
          render={({ field }) => (
            <Select
              items={items}
              value={field.value === "" ? null : field.value}
              onValueChange={(next) => {
                if (next != null) field.onChange(next);
              }}
            >
              <SelectTrigger
                id="salary-advance-member"
                size="lg"
                className="w-full min-w-0"
                aria-required
                aria-invalid={errors.memberId != null}
              >
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent
                align="start"
                alignItemWithTrigger={false}
                aria-label="Team Members"
              >
                {items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FieldError message={errors.memberId?.message} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="salary-advance-amount" required>
            Amount
          </Label>
          <MoneyInput
            id="salary-advance-amount"
            aria-required
            aria-invalid={errors.amount != null}
            {...form.register("amount")}
          />
          <FieldError message={errors.amount?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="salary-advance-instalments" required>
            Instalments
          </Label>
          <Input
            id="salary-advance-instalments"
            aria-required
            inputMode="numeric"
            aria-invalid={errors.instalments != null}
            {...form.register("instalments")}
          />
          <FieldError message={errors.instalments?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="salary-advance-date" required>
            Paid on
          </Label>
          <Input
            id="salary-advance-date"
            aria-required
            type="date"
            max={today}
            aria-invalid={errors.advanceDate != null}
            {...form.register("advanceDate")}
          />
          <FieldError message={errors.advanceDate?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="salary-advance-reference">Reference (optional)</Label>
          <Input
            id="salary-advance-reference"
            placeholder="UTR or voucher number"
            aria-invalid={errors.reference != null}
            {...form.register("reference")}
          />
          <FieldError message={errors.reference?.message} />
        </div>
      </div>
      <div className="space-y-1.5">
        <FieldTitle className="leading-none">
          Paid by
          <RequiredIndicator className="-ms-1" />
        </FieldTitle>
        <Controller
          name="mode"
          control={form.control}
          render={({ field }) => (
            <ModeRadios
              idPrefix="salary-advance-mode"
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </div>
      <Controller
        name="accountId"
        control={form.control}
        render={({ field }) => (
          <PaidFromField
            id="salary-advance-account"
            mode={mode}
            value={field.value}
            onChange={field.onChange}
            error={errors.accountId?.message}
          />
        )}
      />
      <div className="space-y-1.5">
        <Label htmlFor="salary-advance-reason">Reason (optional)</Label>
        <Textarea
          id="salary-advance-reason"
          rows={2}
          aria-invalid={errors.reason != null}
          {...form.register("reason")}
        />
        <FieldError message={errors.reason?.message} />
      </div>
      <FormAlert message={errors.root?.message} />
      <DialogFooter>
        <Button type="submit" disabled={command.isPending}>
          {command.isPending ? "Paying…" : "Pay Advance"}
        </Button>
      </DialogFooter>
    </form>
  );
}
