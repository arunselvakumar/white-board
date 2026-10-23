"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type FieldPath,
} from "react-hook-form";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
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
import {
  AdvanceSelect,
  isRecoveryKind,
  RecoverySuggestions,
  type BillAdvance,
} from "@/components/contracts/advances/bill-recoveries";
import {
  EscalationRecoverySuggestions,
  type BillEscalationRecovery,
} from "@/components/contracts/escalation/escalation-recoveries";
import { FormAlert } from "@/components/auth/form-alert";
import { MoneyInput, paiseToRupees } from "@/components/money/money-input";
import { fieldForCode } from "@/lib/server-errors";
import {
  useClientBillCommand,
  type ClientBill,
} from "@/src/queries/contracts-client-bills";
import { QueryHttpError } from "@/src/queries/http";

import {
  CLIENT_DEDUCTION_OPTIONS,
  ClientBillEditorSchema,
  clientEditorValuesOf,
  deductionsPaise,
  toClientUpdate,
  type ClientBillEditorValues,
} from "./client-bill-form-schema";
import { moneyOrDash, percentText } from "./client-bill-format";

const FIELD_CODES = {
  BILL_DATE_IN_FUTURE: "billDate",
  BILL_DATE_INVALID: "billDate",
  MEASURED_UP_TO_AFTER_BILL_DATE: "measuredUpTo",
  MEASURED_UP_TO_INVALID: "measuredUpTo",
  BILL_NO_MEASUREMENTS: "measuredUpTo",
  BILL_REMARKS_TOO_LONG: "remarks",
  BILL_RETENTION_OVER_CAP: "deductions",
  BILL_DEDUCTIONS_TOO_LARGE: "deductions",
} as const;

/** `deductions.2.amount` and the like, as the API names them. */
function pathOf(error: unknown): FieldPath<ClientBillEditorValues> | null {
  if (!(error instanceof QueryHttpError)) return null;
  const details = error.details as { field?: unknown } | null | undefined;
  const field = typeof details?.field === "string" ? details.field : null;
  if (
    field != null &&
    /^deductions\.\d+\.(amount|description|kind|advanceId)$/.test(field)
  )
    return field as FieldPath<ClientBillEditorValues>;
  return null;
}

/**
 * A draft Client Bill's details and deductions (CM-1107): the bill date,
 * the date measured up to (a new one takes the rows again), Final,
 * remarks, and — with Financial — what the Client holds back, with the
 * suggested retention and the net receivable as you type.
 */
export function ClientBillEditor({ bill }: { bill: ClientBill }) {
  const command = useClientBillCommand(bill.id);
  const form = useForm<ClientBillEditorValues>({
    resolver: zodResolver(ClientBillEditorSchema),
    values: clientEditorValuesOf(bill),
  });
  const { control, register, handleSubmit, formState, setError, setValue } =
    form;
  const { errors } = formState;
  const deductions = useFieldArray({ control, name: "deductions" });
  const typed = useWatch({ control, name: "deductions" });
  const financial = bill.financial;
  const suggested = bill.retention.suggested ?? 0;
  const gst = (bill.cgst ?? 0) + (bill.sgst ?? 0) + (bill.igst ?? 0);
  const net = (bill.gross ?? 0) + gst - deductionsPaise(typed);

  const applySuggestion = () => {
    const index = typed.findIndex((row) => row.kind === "retention");
    const amount = paiseToRupees(suggested);
    if (index === -1) {
      if (suggested > 0)
        deductions.append({
          kind: "retention",
          amount,
          description: "",
          advanceId: "",
          escalationBillId: "",
        });
      return;
    }
    setValue(`deductions.${index}.amount`, amount, { shouldDirty: true });
  };

  const applyEscalationRecovery = (recovery: BillEscalationRecovery) => {
    const amount = paiseToRupees(recovery.balance ?? 0);
    const index = typed.findIndex(
      (row) =>
        row.kind === "other" &&
        row.escalationBillId === recovery.escalationBillId,
    );
    if (index === -1) {
      deductions.append({
        kind: "other",
        amount,
        description: recovery.reason,
        advanceId: "",
        escalationBillId: recovery.escalationBillId,
      });
      return;
    }
    setValue(`deductions.${index}.amount`, amount, { shouldDirty: true });
  };

  const applyRecovery = (advance: BillAdvance) => {
    const amount = paiseToRupees(advance.suggested ?? 0);
    const index = typed.findIndex(
      (row) => isRecoveryKind(row.kind) && row.advanceId === advance.id,
    );
    if (index === -1) {
      deductions.append({
        kind: advance.recoveryKind as (typeof typed)[number]["kind"],
        amount,
        description: "",
        advanceId: advance.id,
        escalationBillId: "",
      });
      return;
    }
    setValue(`deductions.${index}.amount`, amount, { shouldDirty: true });
  };

  return (
    <form
      noValidate
      aria-label="Bill details"
      className="min-w-0 space-y-4 rounded-xl border p-4"
      onSubmit={handleSubmit((values) => {
        command.mutate(
          { kind: "update", input: toClientUpdate(values, bill) },
          {
            onError: (failure) => {
              const path = pathOf(failure);
              const found = fieldForCode(failure, FIELD_CODES);
              setError(path ?? found.field ?? "root", {
                message: found.message,
              });
            },
          },
        );
      })}
    >
      <h3 className="font-semibold">Bill details</h3>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="client-bill-date" required>
            Bill date
          </Label>
          <Input
            id="client-bill-date"
            type="date"
            aria-required
            aria-invalid={errors.billDate != null}
            {...register("billDate")}
          />
          <FieldError message={errors.billDate?.message} />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="client-bill-up-to" required>
            Measured up to
          </Label>
          <Input
            id="client-bill-up-to"
            type="date"
            aria-required
            aria-invalid={errors.measuredUpTo != null}
            {...register("measuredUpTo")}
          />
          <FieldError message={errors.measuredUpTo?.message} />
        </div>
      </div>
      <div className="flex items-start gap-2">
        <Controller
          name="isFinal"
          control={control}
          render={({ field }) => (
            <Checkbox
              id="client-bill-final"
              checked={field.value}
              onCheckedChange={(checked) => {
                field.onChange(checked);
              }}
            />
          )}
        />
        <div className="min-w-0 space-y-0.5">
          <Label htmlFor="client-bill-final">Final bill</Label>
          <p className="text-muted-foreground text-xs">
            Marks the contract&apos;s final bill on the tax invoice. Nothing
            closes on the client side.
          </p>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="client-bill-remarks">Remarks</Label>
        <Textarea
          id="client-bill-remarks"
          rows={2}
          aria-invalid={errors.remarks != null}
          {...register("remarks")}
        />
        <FieldError message={errors.remarks?.message} />
      </div>

      {financial ? (
        <section
          aria-labelledby="client-bill-deductions-title"
          className="space-y-3"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4
              id="client-bill-deductions-title"
              className="text-sm font-semibold"
            >
              Deductions
            </h4>
            <p className="text-muted-foreground text-xs">
              Retention {percentText(bill.retention.percent)} of the gross
              {bill.retention.capPercent == null
                ? ""
                : `, up to ${percentText(bill.retention.capPercent)} of the BOQ`}
              : at most {moneyOrDash(suggested)} on this bill.
            </p>
          </div>
          {deductions.fields.length === 0 ? (
            <p className="text-muted-foreground text-sm">No deductions.</p>
          ) : (
            <ul className="space-y-3">
              {deductions.fields.map((row, index) => {
                const rowErrors = errors.deductions?.[index];
                const n = String(index + 1);
                return (
                  <li
                    key={row.id}
                    className="grid min-w-0 gap-2 rounded-lg border p-3 sm:grid-cols-[12rem_10rem_1fr_auto] sm:items-start"
                  >
                    <Controller
                      name={`deductions.${index}.kind`}
                      control={control}
                      render={({ field }) => (
                        <Select
                          items={CLIENT_DEDUCTION_OPTIONS}
                          value={field.value}
                          onValueChange={(value) => {
                            if (value == null) return;
                            field.onChange(value);
                          }}
                        >
                          <SelectTrigger
                            aria-label={`Deduction ${n} kind`}
                            className="w-full min-w-0"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent
                            align="start"
                            alignItemWithTrigger={false}
                          >
                            {CLIENT_DEDUCTION_OPTIONS.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    <div className="min-w-0 space-y-1">
                      <MoneyInput
                        aria-label={`Deduction ${n} amount`}
                        aria-invalid={rowErrors?.amount != null}
                        {...register(`deductions.${index}.amount`)}
                      />
                      <FieldError message={rowErrors?.amount?.message} />
                    </div>
                    {isRecoveryKind(typed[index]?.kind ?? "") ? (
                      <div className="min-w-0 space-y-1">
                        <Controller
                          name={`deductions.${index}.advanceId`}
                          control={control}
                          render={({ field }) => (
                            <AdvanceSelect
                              advances={bill.advances}
                              kind={typed[index]?.kind ?? ""}
                              value={field.value}
                              onChange={field.onChange}
                              label={`Deduction ${n} advance`}
                              invalid={rowErrors?.advanceId != null}
                            />
                          )}
                        />
                        <FieldError message={rowErrors?.advanceId?.message} />
                      </div>
                    ) : (
                      <div className="min-w-0 space-y-1">
                        <Input
                          aria-label={`Deduction ${n} description`}
                          placeholder={
                            typed[index]?.kind === "other"
                              ? "What it is for"
                              : "Note (optional)"
                          }
                          aria-invalid={rowErrors?.description != null}
                          {...register(`deductions.${index}.description`)}
                        />
                        <FieldError message={rowErrors?.description?.message} />
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove deduction ${n}`}
                      onClick={() => {
                        deductions.remove(index);
                      }}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          <FieldError message={errors.deductions?.message} />
          <RecoverySuggestions
            advances={bill.advances}
            typed={typed}
            onUse={applyRecovery}
          />
          <EscalationRecoverySuggestions
            recoveries={bill.escalationRecoveries}
            typed={typed}
            onUse={applyEscalationRecovery}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                deductions.append({
                  kind: "other",
                  amount: "",
                  description: "",
                  advanceId: "",
                  escalationBillId: "",
                });
              }}
            >
              <Plus aria-hidden="true" />
              Add deduction
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={suggested <= 0}
              onClick={applySuggestion}
            >
              Use suggested retention {moneyOrDash(suggested)}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            What the Client holds back: an advance recovery names the advance it
            paid, which it applies to this bill; material it issued at cost is
            typed by hand. TDS and GST-TDS the Client deducts are recorded on
            its receipt in Payments.
          </p>
          <p className="text-sm font-semibold tabular-nums">
            Net receivable as typed {moneyOrDash(net)}
          </p>
        </section>
      ) : (
        <p className="text-muted-foreground text-xs">
          Deductions and amounts need the Client Bill&apos;s Financial
          permission.
        </p>
      )}
      <FormAlert message={errors.root?.message} />
      <div className="flex justify-end">
        <Button
          type="submit"
          size="sm"
          disabled={command.isPending || !formState.isDirty}
        >
          {command.isPending ? "Saving…" : "Save draft"}
        </Button>
      </div>
    </form>
  );
}
