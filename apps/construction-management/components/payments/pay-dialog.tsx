"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
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
import { Textarea } from "@repo/ui/components/textarea";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { MoneyInput } from "@/components/money/money-input";
import { fieldForCode } from "@/lib/server-errors";
import type { PaymentPartyType } from "@/src/queries/balances";
import {
  paymentPayersQuery,
  useRecordPayment,
  type WagePayment,
} from "@/src/queries/payments";
import { DOCUMENT_CONTENT_TYPES } from "@/src/shared-kernel/files/document-file";

import { localToday, money } from "./payment-format";
import {
  payFormDefaults,
  payFormSchema,
  toRecordInput,
  type PayFormValues,
} from "./pay-form-schema";

export type PayTarget = {
  id: string;
  name: string;
  /** Paise owed at the period's end; null without Financial. */
  finalAmount: number | null;
};

const NO_PAYER = "none";

const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Pay a labourer or a vendor (CM-216): date (today), Payment or Advance,
 * Cash or Bank with a reference, the amount (the Final Amount when
 * something is owed), who paid, remarks and an optional receipt.
 */
export function PayDialog({
  projectId,
  partyType,
  party,
  onOpenChange,
  onPaid,
  today,
}: {
  projectId: string;
  partyType: PaymentPartyType;
  /** The party to pay; null closes the dialog. */
  party: PayTarget | null;
  onOpenChange: (open: boolean) => void;
  onPaid?: (payment: WagePayment) => void;
  /** Defaults to today on this device. */
  today?: string;
}) {
  // Kept after closing so the title stays while the dialog animates out.
  const [shown, setShown] = useState<PayTarget | null>(party);
  if (party != null && party !== shown) setShown(party);
  const target = party ?? shown;
  return (
    <Dialog open={party != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {target == null ? "Pay" : `Pay ${target.name}`}
          </DialogTitle>
          <DialogDescription>
            {target?.finalAmount == null
              ? "Record money paid against wages, or an advance."
              : `Final Amount for the period: ${money(target.finalAmount)}.`}
          </DialogDescription>
        </DialogHeader>
        {party != null && (
          <Suspense
            fallback={
              <div className="space-y-3" aria-busy="true">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            }
          >
            <PayForm
              key={party.id}
              projectId={projectId}
              partyType={partyType}
              party={party}
              today={today ?? localToday()}
              onCancel={() => {
                onOpenChange(false);
              }}
              onPaid={(payment) => {
                onOpenChange(false);
                onPaid?.(payment);
              }}
            />
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PayForm({
  projectId,
  partyType,
  party,
  today,
  onCancel,
  onPaid,
}: {
  projectId: string;
  partyType: PaymentPartyType;
  party: PayTarget;
  today: string;
  onCancel: () => void;
  onPaid: (payment: WagePayment) => void;
}) {
  const { data: payers } = useSuspenseQuery(
    paymentPayersQuery(projectId, partyType),
  );
  const record = useRecordPayment();
  const [receipt, setReceipt] = useState<File | null>(null);
  const [receiptProblem, setReceiptProblem] = useState<string | undefined>();
  const [problem, setProblem] = useState<string | undefined>();
  /** The payment was recorded but its receipt upload failed. */
  const [recorded, setRecorded] = useState(false);
  const form = useForm<PayFormValues>({
    resolver: zodResolver(payFormSchema),
    defaultValues: payFormDefaults({
      today,
      finalAmount: party.finalAmount,
      currentMemberId: payers.currentMemberId,
    }),
  });
  const { errors } = form.formState;
  const mode = useWatch({ control: form.control, name: "mode" });
  const payerItems = [
    { value: NO_PAYER, label: "Not recorded" },
    ...payers.items.map((item) => ({ value: item.id, label: item.name })),
  ];

  const submit = form.handleSubmit(async (values) => {
    setProblem(undefined);
    try {
      const { payment, receiptError } = await record.mutateAsync({
        input: toRecordInput(values, {
          projectId,
          partyType,
          partyId: party.id,
        }),
        receipt,
      });
      if (receiptError != null) {
        // The payment stands; only the receipt failed.
        setRecorded(true);
        setProblem(
          `The payment was recorded, but the receipt was not saved: ${fieldForCode(receiptError, {}).message}`,
        );
        return;
      }
      onPaid(payment);
    } catch (error) {
      const { field, message } = fieldForCode(error, {
        PAYMENT_AMOUNT_INVALID: "amount",
        PAYMENT_DATE_IN_FUTURE: "paymentDate",
        PAYMENT_DATE_INVALID: "paymentDate",
        BACKDATED_CREATE_BLOCKED: "paymentDate",
        FINANCIAL_PERIOD_CLOSED: "paymentDate",
        PAYMENT_REFERENCE_TOO_LONG: "reference",
        PAYMENT_REMARKS_TOO_LONG: "remarks",
        TEAM_MEMBER_NOT_FOUND: "paidByMemberId",
      } as const);
      if (field == null) setProblem(message);
      else form.setError(field, { message });
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
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pay-date">Payment date</Label>
          <Input
            id="pay-date"
            type="date"
            className="h-10"
            max={today}
            aria-invalid={errors.paymentDate != null}
            {...form.register("paymentDate")}
          />
          <FieldError message={errors.paymentDate?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pay-amount">Amount</Label>
          <MoneyInput
            id="pay-amount"
            className="h-10"
            aria-invalid={errors.amount != null}
            {...form.register("amount")}
          />
          <FieldError message={errors.amount?.message} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <span id="pay-kind" className="text-sm font-medium">
            Type
          </span>
          <Controller
            name="kind"
            control={form.control}
            render={({ field }) => (
              <ToggleGroup
                aria-labelledby="pay-kind"
                value={[field.value]}
                onValueChange={(value: string[]) => {
                  const next = value[0];
                  if (next === "payment" || next === "advance")
                    field.onChange(next);
                }}
                variant="outline"
                className="w-full"
              >
                <ToggleGroupItem value="payment" className="flex-1">
                  Payment
                </ToggleGroupItem>
                <ToggleGroupItem value="advance" className="flex-1">
                  Advance
                </ToggleGroupItem>
              </ToggleGroup>
            )}
          />
        </div>
        <div className="space-y-1.5">
          <span id="pay-mode" className="text-sm font-medium">
            Mode
          </span>
          <Controller
            name="mode"
            control={form.control}
            render={({ field }) => (
              <ToggleGroup
                aria-labelledby="pay-mode"
                value={[field.value]}
                onValueChange={(value: string[]) => {
                  const next = value[0];
                  if (next === "cash" || next === "bank") field.onChange(next);
                }}
                variant="outline"
                className="w-full"
              >
                <ToggleGroupItem value="cash" className="flex-1">
                  Cash
                </ToggleGroupItem>
                <ToggleGroupItem value="bank" className="flex-1">
                  Bank
                </ToggleGroupItem>
              </ToggleGroup>
            )}
          />
        </div>
      </div>
      {mode === "bank" && (
        <div className="space-y-1.5">
          <Label htmlFor="pay-reference">Reference</Label>
          <Input
            id="pay-reference"
            className="h-10"
            placeholder="Cheque or UTR number"
            aria-invalid={errors.reference != null}
            {...form.register("reference")}
          />
          <FieldError message={errors.reference?.message} />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="pay-paid-by">Paid by</Label>
        <Controller
          name="paidByMemberId"
          control={form.control}
          render={({ field }) => (
            <Select
              items={payerItems}
              value={field.value === "" ? NO_PAYER : field.value}
              onValueChange={(value) => {
                field.onChange(
                  value == null || value === NO_PAYER ? "" : value,
                );
              }}
            >
              <SelectTrigger
                id="pay-paid-by"
                size="lg"
                className="w-full min-w-0"
                aria-invalid={errors.paidByMemberId != null}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                {payerItems.map((item) => (
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
      <div className="space-y-1.5">
        <Label htmlFor="pay-remarks">Remarks</Label>
        <Textarea
          id="pay-remarks"
          rows={2}
          maxLength={500}
          aria-invalid={errors.remarks != null}
          {...form.register("remarks")}
        />
        <FieldError message={errors.remarks?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pay-receipt">Receipt (optional)</Label>
        <Input
          id="pay-receipt"
          type="file"
          className="h-10"
          accept={DOCUMENT_CONTENT_TYPES.join(",")}
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            if (file != null && file.size > RECEIPT_MAX_BYTES) {
              setReceiptProblem("Choose a file of at most 10 MB");
              setReceipt(null);
              event.target.value = "";
              return;
            }
            setReceiptProblem(undefined);
            setReceipt(file);
          }}
        />
        <p className="text-muted-foreground text-xs">
          PDF or photo, up to 10 MB.
        </p>
        <FieldError message={receiptProblem} />
      </div>
      <FormAlert message={problem} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {recorded ? "Close" : "Cancel"}
        </Button>
        <Button type="submit" disabled={record.isPending || recorded}>
          {record.isPending ? "Saving…" : "Record payment"}
        </Button>
      </DialogFooter>
    </form>
  );
}
