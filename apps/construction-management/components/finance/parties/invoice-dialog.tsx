"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
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
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import {
  isRupees,
  MoneyInput,
  rupeesToPaise,
} from "@/components/money/money-input";
import { fieldForCode } from "@/lib/server-errors";
import {
  partyFormOptionsQuery,
  useCreateInvoice,
  useUpdateInvoice,
  type AwaitingGoodsReceipt,
  type Invoice,
  type PartyType,
} from "@/src/queries/finance-parties";
import { counterpartyOptionsQuery } from "@/src/queries/finance-lookups";

import {
  formatDate,
  localToday,
  money,
  paiseToRupees,
  PARTY_SCREENS,
} from "./party-money";

const NONE = "__none__";

const optionalRupees = z
  .string()
  .trim()
  .refine((value) => value === "" || isRupees(value), {
    message: "Enter an amount in rupees",
  });

const invoiceFormSchema = z
  .object({
    partyId: z.string().min(1, "Choose the party"),
    direction: z.enum(["payable", "receivable"]),
    invoiceNumber: z.string().trim().max(60, "Use at most 60 characters"),
    invoiceDate: z.iso.date({ message: "Choose the invoice date" }),
    dueDate: z.string(),
    departmentId: z.string(),
    taxableAmount: optionalRupees,
    gstAmount: optionalRupees,
    amount: z
      .string()
      .trim()
      .refine((value) => isRupees(value) && (rupeesToPaise(value) ?? 0) > 0, {
        message: "Enter the invoice amount",
      }),
    remarks: z.string().max(500, "Use at most 500 characters"),
  })
  .superRefine((values, ctx) => {
    if (values.direction === "payable" && values.invoiceNumber === "")
      ctx.addIssue({
        code: "custom",
        path: ["invoiceNumber"],
        message: "Enter the party's invoice number",
      });
    if (values.dueDate !== "" && values.dueDate < values.invoiceDate)
      ctx.addIssue({
        code: "custom",
        path: ["dueDate"],
        message: "The due date cannot be before the invoice date",
      });
    const split =
      (rupeesToPaise(values.taxableAmount) ?? 0) +
      (rupeesToPaise(values.gstAmount) ?? 0);
    if (split > (rupeesToPaise(values.amount) ?? 0))
      ctx.addIssue({
        code: "custom",
        path: ["gstAmount"],
        message: "Taxable value and GST cannot be more than the amount",
      });
  });

type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;

const ERROR_FIELDS = {
  INVOICE_NUMBER_TAKEN: "invoiceNumber",
  INVOICE_NUMBER_REQUIRED: "invoiceNumber",
  DUE_DATE_BEFORE_INVOICE: "dueDate",
  INVOICE_SPLIT_EXCEEDS_AMOUNT: "gstAmount",
  INVOICE_BELOW_ALLOCATED: "amount",
  AMOUNT_INVALID: "amount",
  AMOUNT_TOO_LARGE: "amount",
  DEPARTMENT_NOT_OF_CONTRACTOR: "departmentId",
  PARTY_NOT_ON_PROJECT: "partyId",
  PARTY_NOT_FOUND: "partyId",
  FINANCIAL_PERIOD_CLOSED: "invoiceDate",
  BACKDATED_CREATE_BLOCKED: "invoiceDate",
  BACKDATED_EDIT_BLOCKED: "invoiceDate",
} as const;

export type InvoiceDialogTarget =
  | { mode: "new"; partyId?: string; goodsReceipts?: AwaitingGoodsReceipt[] }
  | { mode: "edit"; invoice: Invoice };

/**
 * **New invoice** / edit an invoice (CM-705, CM-706, CM-708): the party
 * (fixed when opened from one), the party's invoice number (a sales
 * invoice is numbered on save), dates, a Contractor's Department, taxable
 * value and GST, amount and remarks. A Supplier's invoice may gather GRNs
 * awaiting an invoice; its amount starts at their total value.
 */
export function InvoiceDialog({
  projectId,
  partyType,
  target,
  onOpenChange,
  onSaved,
}: {
  projectId: string;
  partyType: PartyType;
  target: InvoiceDialogTarget | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: (invoice: Invoice) => void;
}) {
  const [shown, setShown] = useState(target);
  if (target != null && target !== shown) setShown(target);
  const current = target ?? shown;
  const screen = PARTY_SCREENS[partyType];
  return (
    <Dialog open={target != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {current?.mode === "edit"
              ? `Edit invoice ${current.invoice.invoiceNumber}`
              : `New ${screen.label} invoice`}
          </DialogTitle>
          <DialogDescription>
            The invoice adds to what the Company owes the party on this Project.
          </DialogDescription>
        </DialogHeader>
        {target != null && (
          <InvoiceForm
            key={target.mode === "edit" ? target.invoice.updatedAt : "new"}
            projectId={projectId}
            partyType={partyType}
            target={target}
            onCancel={() => {
              onOpenChange(false);
            }}
            onSaved={(invoice) => {
              onOpenChange(false);
              onSaved?.(invoice);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function defaults(
  target: InvoiceDialogTarget,
  today: string,
): InvoiceFormValues {
  if (target.mode === "edit") {
    const invoice = target.invoice;
    return {
      partyId: invoice.party.id,
      direction: invoice.direction,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate ?? "",
      departmentId: invoice.department?.id ?? "",
      taxableAmount: paiseToRupees(invoice.taxableAmount),
      gstAmount: paiseToRupees(invoice.gstAmount),
      amount: paiseToRupees(invoice.amount),
      remarks: invoice.remarks ?? "",
    };
  }
  const grns = target.goodsReceipts ?? [];
  const first = grns[0];
  return {
    partyId: target.partyId ?? first?.supplier.id ?? "",
    direction: "payable",
    invoiceNumber: grns.length === 1 ? (first?.invoiceNo ?? "") : "",
    invoiceDate: grns.length === 1 ? (first?.invoiceDate ?? today) : today,
    dueDate: "",
    departmentId: "",
    taxableAmount: "",
    gstAmount: "",
    amount:
      grns.length === 0
        ? ""
        : paiseToRupees(grns.reduce((sum, grn) => sum + grn.totalValue, 0)),
    remarks: "",
  };
}

function InvoiceForm({
  projectId,
  partyType,
  target,
  onCancel,
  onSaved,
}: {
  projectId: string;
  partyType: PartyType;
  target: InvoiceDialogTarget;
  onCancel: () => void;
  onSaved: (invoice: Invoice) => void;
}) {
  const editing = target.mode === "edit" ? target.invoice : null;
  const grns = target.mode === "new" ? (target.goodsReceipts ?? []) : [];
  const fixedParty =
    editing != null ||
    (target.mode === "new" && target.partyId != null) ||
    grns.length > 0;
  const fromGrn = editing?.origin === "goods_receipt";
  const create = useCreateInvoice();
  const update = useUpdateInvoice(editing?.id ?? "");
  const [problem, setProblem] = useState<string | undefined>();
  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: defaults(target, localToday()),
  });
  const { errors } = form.formState;
  const partyId = useWatch({ control: form.control, name: "partyId" });
  const direction = useWatch({ control: form.control, name: "direction" });
  const parties = useQuery({
    ...counterpartyOptionsQuery(partyType, projectId),
    enabled: !fixedParty,
  });
  const options = useQuery({
    ...partyFormOptionsQuery(projectId, partyType, partyId),
    enabled: partyType === "contractor" && partyId !== "",
  });
  const departments = options.data?.departments ?? [];
  const departmentItems = [
    { value: NONE, label: "No Department" },
    ...departments.map((item) => ({ value: item.id, label: item.name })),
  ];
  const partyItems = (parties.data?.items ?? []).map((item) => ({
    value: item.id,
    label: item.name,
  }));
  const saving = create.isPending || update.isPending;

  const submit = form.handleSubmit(async (values) => {
    setProblem(undefined);
    const body = {
      invoiceNumber:
        values.direction === "payable" ? values.invoiceNumber.trim() : null,
      invoiceDate: values.invoiceDate,
      dueDate: values.dueDate === "" ? null : values.dueDate,
      departmentId:
        partyType === "contractor" && values.departmentId !== ""
          ? values.departmentId
          : null,
      taxableAmount: rupeesToPaise(values.taxableAmount),
      gstAmount: rupeesToPaise(values.gstAmount),
      amount: rupeesToPaise(values.amount),
      remarks: values.remarks.trim() === "" ? null : values.remarks.trim(),
    };
    try {
      const saved =
        editing != null
          ? await update.mutateAsync({
              ...body,
              expectedUpdatedAt: editing.updatedAt,
            })
          : await create.mutateAsync({
              ...body,
              partyType,
              partyId: values.partyId,
              projectId,
              direction: values.direction,
              goodsReceiptIds:
                grns.length === 0 ? undefined : grns.map((grn) => grn.id),
            });
      onSaved(saved);
    } catch (error) {
      const { field, message } = fieldForCode(error, ERROR_FIELDS);
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
      {!fixedParty && (
        <div className="space-y-1.5">
          <Label htmlFor="invoice-party">
            {PARTY_SCREENS[partyType].label}
          </Label>
          <Controller
            name="partyId"
            control={form.control}
            render={({ field }) => (
              <Select
                items={partyItems}
                value={field.value === "" ? null : field.value}
                onValueChange={(next) => {
                  if (typeof next === "string") field.onChange(next);
                }}
              >
                <SelectTrigger
                  id="invoice-party"
                  size="lg"
                  className="w-full min-w-0"
                  aria-invalid={errors.partyId != null}
                >
                  <SelectValue
                    placeholder={`Choose a ${PARTY_SCREENS[partyType].label}`}
                  />
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
      {partyType === "other_party" && editing == null && (
        <div className="space-y-1.5">
          <span id="invoice-direction" className="text-sm font-medium">
            Invoice
          </span>
          <Controller
            name="direction"
            control={form.control}
            render={({ field }) => (
              <ToggleGroup
                aria-labelledby="invoice-direction"
                value={[field.value]}
                onValueChange={(value: string[]) => {
                  const next = value[0];
                  if (next === "payable" || next === "receivable")
                    field.onChange(next);
                }}
                variant="outline"
                className="w-full"
              >
                <ToggleGroupItem value="payable" className="flex-1">
                  Purchase (from party)
                </ToggleGroupItem>
                <ToggleGroupItem value="receivable" className="flex-1">
                  Sales (to party)
                </ToggleGroupItem>
              </ToggleGroup>
            )}
          />
        </div>
      )}
      {grns.length > 0 && (
        <div className="bg-muted/40 space-y-1 rounded-lg border p-3 text-sm">
          <p className="font-medium">
            {grns.length === 1
              ? "Goods Receipt"
              : `${String(grns.length)} Goods Receipts`}
          </p>
          <ul
            aria-label="Goods Receipts on this invoice"
            className="space-y-0.5"
          >
            {grns.map((grn) => (
              <li key={grn.id} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">
                  {grn.number} · {formatDate(grn.receiptDate)}
                </span>
                <span className="tabular-nums">{money(grn.totalValue)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {fromGrn && (
        <p className="text-muted-foreground text-sm">
          Number, date and amount come from the Goods Receipt. Edit the Goods
          Receipt to change them.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        {direction === "payable" ? (
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="invoice-number">Invoice number</Label>
            <Input
              id="invoice-number"
              className="h-10"
              autoComplete="off"
              disabled={fromGrn}
              aria-invalid={errors.invoiceNumber != null}
              {...form.register("invoiceNumber")}
            />
            <FieldError message={errors.invoiceNumber?.message} />
          </div>
        ) : (
          <div className="min-w-0 space-y-1.5">
            <span className="text-sm font-medium">Invoice number</span>
            <p className="text-muted-foreground flex h-10 items-center text-sm">
              {editing?.invoiceNumber ?? "Numbered on save (INV)"}
            </p>
          </div>
        )}
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="invoice-date">Invoice date</Label>
          <Input
            id="invoice-date"
            type="date"
            className="h-10"
            disabled={fromGrn}
            aria-invalid={errors.invoiceDate != null}
            {...form.register("invoiceDate")}
          />
          <FieldError message={errors.invoiceDate?.message} />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="invoice-due">Due date</Label>
          <Input
            id="invoice-due"
            type="date"
            className="h-10"
            aria-invalid={errors.dueDate != null}
            {...form.register("dueDate")}
          />
          <FieldError message={errors.dueDate?.message} />
        </div>
      </div>
      {partyType === "contractor" && (
        <div className="space-y-1.5">
          <Label htmlFor="invoice-department">Department</Label>
          <Controller
            name="departmentId"
            control={form.control}
            render={({ field }) => (
              <Select
                items={departmentItems}
                value={field.value === "" ? NONE : field.value}
                onValueChange={(next) => {
                  if (typeof next === "string")
                    field.onChange(next === NONE ? "" : next);
                }}
              >
                <SelectTrigger
                  id="invoice-department"
                  size="lg"
                  className="w-full min-w-0"
                  aria-invalid={errors.departmentId != null}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  {departmentItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError message={errors.departmentId?.message} />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="invoice-taxable">Taxable value</Label>
          <MoneyInput
            id="invoice-taxable"
            className="h-10"
            placeholder="Optional"
            aria-invalid={errors.taxableAmount != null}
            {...form.register("taxableAmount")}
          />
          <FieldError message={errors.taxableAmount?.message} />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="invoice-gst">GST</Label>
          <MoneyInput
            id="invoice-gst"
            className="h-10"
            placeholder="Optional"
            aria-invalid={errors.gstAmount != null}
            {...form.register("gstAmount")}
          />
          <FieldError message={errors.gstAmount?.message} />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="invoice-amount">Amount</Label>
          <MoneyInput
            id="invoice-amount"
            className="h-10"
            disabled={fromGrn}
            aria-invalid={errors.amount != null}
            {...form.register("amount")}
          />
          <FieldError message={errors.amount?.message} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="invoice-remarks">Remarks</Label>
        <Textarea
          id="invoice-remarks"
          rows={2}
          maxLength={500}
          aria-invalid={errors.remarks != null}
          {...form.register("remarks")}
        />
        <FieldError message={errors.remarks?.message} />
      </div>
      <FormAlert message={problem} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : editing == null ? "Save invoice" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}
