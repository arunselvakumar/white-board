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
import { reconciliationHref } from "@/components/contracts/contractor-bills/reconciliation-link";
import { MoneyInput, paiseToRupees } from "@/components/money/money-input";
import { fieldForCode } from "@/lib/server-errors";
import {
  useContractorBillCommand,
  type ContractorBill,
} from "@/src/queries/contracts-contractor-bills";
import { QueryHttpError } from "@/src/queries/http";

import {
  ContractorBillEditorSchema,
  DEDUCTION_OPTIONS,
  deductionsPaise,
  editorValuesOf,
  toUpdate,
  type ContractorBillEditorValues,
} from "./contractor-bill-form-schema";
import {
  isMaterialKind,
  MaterialRecoverySuggestions,
  MaterialSelect,
  type BillMaterial,
} from "./bill-material-recoveries";
import { moneyOrDash, percentText } from "./contractor-bill-format";

const FIELD_CODES = {
  BILL_DATE_IN_FUTURE: "billDate",
  BILL_DATE_BEFORE_ORDER_DATE: "billDate",
  BILL_DATE_INVALID: "billDate",
  MEASURED_UP_TO_AFTER_BILL_DATE: "measuredUpTo",
  MEASURED_UP_TO_INVALID: "measuredUpTo",
  BILL_NO_MEASUREMENTS: "measuredUpTo",
  BILL_REMARKS_TOO_LONG: "remarks",
  BILL_RETENTION_OVER_CAP: "deductions",
  BILL_DEDUCTIONS_TOO_LARGE: "deductions",
} as const;

/** `deductions.2.amount` and the like, as the API names them. */
function pathOf(error: unknown): FieldPath<ContractorBillEditorValues> | null {
  if (!(error instanceof QueryHttpError)) return null;
  const details = error.details as { field?: unknown } | null | undefined;
  const field = typeof details?.field === "string" ? details.field : null;
  if (
    field != null &&
    /^deductions\.\d+\.(amount|description|kind|advanceId|materialId)$/.test(
      field,
    )
  )
    return field as FieldPath<ContractorBillEditorValues>;
  return null;
}

/**
 * A draft bill's details and deductions (CM-1106): the bill date, the date
 * measured up to (a new one takes the rows again), Final, remarks, and —
 * with Financial — the deductions, with the suggested retention and the
 * net as you type.
 */
export function ContractorBillEditor({ bill }: { bill: ContractorBill }) {
  const command = useContractorBillCommand(bill.id);
  const form = useForm<ContractorBillEditorValues>({
    resolver: zodResolver(ContractorBillEditorSchema),
    values: editorValuesOf(bill),
  });
  const { control, register, handleSubmit, formState, setError, setValue } =
    form;
  const { errors } = formState;
  const deductions = useFieldArray({ control, name: "deductions" });
  const typed = useWatch({ control, name: "deductions" });
  const financial = bill.financial;
  const suggested = bill.retention.suggested ?? 0;
  const net =
    (bill.gross ?? 0) + (bill.payableGst ?? 0) - deductionsPaise(typed);

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
          materialId: "",
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
        materialId: "",
      });
      return;
    }
    setValue(`deductions.${index}.amount`, amount, { shouldDirty: true });
  };

  const applyMaterial = (
    kind: "material_reconciliation" | "material_at_cost",
    material: BillMaterial,
  ) => {
    const amount = paiseToRupees(
      (kind === "material_reconciliation"
        ? material.recoverySuggested
        : material.atCostSuggested) ?? 0,
    );
    const index = typed.findIndex(
      (row) => row.kind === kind && row.materialId === material.materialId,
    );
    if (index === -1) {
      deductions.append({
        kind,
        amount,
        description: "",
        advanceId: "",
        escalationBillId: "",
        materialId: material.materialId,
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
        materialId: "",
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
          { kind: "update", input: toUpdate(values, bill) },
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
          <Label htmlFor="bill-date" required>
            Bill date
          </Label>
          <Input
            id="bill-date"
            type="date"
            aria-required
            aria-invalid={errors.billDate != null}
            {...register("billDate")}
          />
          <FieldError message={errors.billDate?.message} />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="bill-up-to" required>
            Measured up to
          </Label>
          <Input
            id="bill-up-to"
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
              id="bill-final"
              checked={field.value}
              onCheckedChange={(checked) => {
                field.onChange(checked);
              }}
            />
          )}
        />
        <div className="min-w-0 space-y-0.5">
          <Label htmlFor="bill-final">Final bill</Label>
          <p className="text-muted-foreground text-xs">
            Approving a Final bill closes the Work Order on the bill date.
          </p>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="bill-remarks">Remarks</Label>
        <Textarea
          id="bill-remarks"
          rows={2}
          aria-invalid={errors.remarks != null}
          {...register("remarks")}
        />
        <FieldError message={errors.remarks?.message} />
      </div>

      {financial ? (
        <section aria-labelledby="bill-deductions-title" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 id="bill-deductions-title" className="text-sm font-semibold">
              Deductions
            </h4>
            <p className="text-muted-foreground text-xs">
              Retention {percentText(bill.retention.percent)} of the gross
              {bill.retention.capPercent == null
                ? ""
                : `, up to ${percentText(bill.retention.capPercent)} of the Work Order`}
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
                          items={DEDUCTION_OPTIONS}
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
                            {DEDUCTION_OPTIONS.map((option) => (
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
                    ) : isMaterialKind(typed[index]?.kind ?? "") ? (
                      <div className="min-w-0 space-y-1">
                        <Controller
                          name={`deductions.${index}.materialId`}
                          control={control}
                          render={({ field }) => (
                            <MaterialSelect
                              materials={bill.materials}
                              kind={typed[index]?.kind ?? ""}
                              value={field.value}
                              onChange={field.onChange}
                              label={`Deduction ${n} material`}
                              invalid={rowErrors?.materialId != null}
                            />
                          )}
                        />
                        <FieldError message={rowErrors?.materialId?.message} />
                        <Input
                          aria-label={`Deduction ${n} reason`}
                          placeholder="Reason (needed above the suggestion)"
                          aria-invalid={rowErrors?.description != null}
                          {...register(`deductions.${index}.description`)}
                        />
                        <FieldError message={rowErrors?.description?.message} />
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
          <MaterialRecoverySuggestions
            materials={bill.materials}
            typed={typed}
            onUse={applyMaterial}
            reconciliationHref={reconciliationHref(bill)}
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
                  materialId: "",
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
            An advance recovery names its advance: it applies the advance paid
            on account to this bill. A material recovery names its material;
            more than the reconciliation suggests needs a reason and Approve.
            TDS is not a deduction here: it is taken when the bill is paid.
          </p>
          <p className="text-sm font-semibold tabular-nums">
            Net as typed {moneyOrDash(net)}
          </p>
        </section>
      ) : (
        <p className="text-muted-foreground text-xs">
          Deductions and amounts need the Contractor Bill&apos;s Financial
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
