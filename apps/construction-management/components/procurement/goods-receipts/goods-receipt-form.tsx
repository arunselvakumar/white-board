"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type Control,
  type UseFormReturn,
} from "react-hook-form";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { Textarea } from "@repo/ui/components/textarea";

import { PageHeader } from "@/components/app-shell/page-header";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { MoneyInput, rupeesToPaise } from "@/components/money/money-input";
import { MaterialPicker } from "@/components/procurement/material-picker";
import {
  goodsReceiptFormOptionsQuery,
  goodsReceiptQuery,
  usePostGoodsReceipt,
  useUpdateGoodsReceipt,
  type GoodsReceipt,
  type GoodsReceiptFormOptions,
} from "@/src/queries/goods-receipts";
import { QueryHttpError } from "@/src/queries/http";
import {
  canIn,
  procurementAccessQuery,
} from "@/src/queries/procurement-access";
import { documentTotals, type LineAmounts } from "@/src/shared-kernel/gst-line";

import {
  errorLine,
  StockShortfallAlert,
  stockShortfalls,
} from "./goods-receipt-errors";
import {
  excessNow,
  goodsReceiptFormDefaults,
  goodsReceiptFormSchema,
  goodsReceiptPayload,
  liveAmounts,
  orderLineValues,
  pendingOf,
  supplyTypeFor,
  type GoodsReceiptFormValues,
} from "./goods-receipt-form-schema";
import {
  ChoiceSelect,
  DELIVERY_FIELDS,
  formatDate,
  GoodsReceiptNoAccess,
  goodsReceivedPath,
  GRN_FIELD_LABELS,
  localToday,
  money,
  qty,
  SUPPLIER_FIELDS,
  SUPPLY_TYPE_LABELS,
  type GrnField,
} from "./goods-receipt-parts";

type FieldName = keyof GoodsReceiptFormValues;

/** Server codes shown under the field they are about. */
const FIELD_FOR_CODE: Partial<Record<string, FieldName>> = {
  SUPPLIER_NOT_FOUND: "supplierId",
  SUPPLIER_INACTIVE: "supplierId",
  SUPPLIER_NOT_ON_LOCATION: "supplierId",
  PURCHASE_ORDER_NOT_FOUND: "purchaseOrderId",
  PURCHASE_ORDER_OTHER_SUPPLIER: "purchaseOrderId",
  PURCHASE_ORDER_OTHER_LOCATION: "purchaseOrderId",
  PURCHASE_ORDER_NOT_APPROVED: "purchaseOrderId",
  PURCHASE_ORDER_CLOSED: "purchaseOrderId",
  PURCHASE_ORDER_RECEIVED: "purchaseOrderId",
  GOODS_RECEIPT_DATE_IN_FUTURE: "receiptDate",
  BACKDATED_CREATE_BLOCKED: "receiptDate",
  BACKDATED_EDIT_BLOCKED: "receiptDate",
  FINANCIAL_PERIOD_CLOSED: "receiptDate",
  INVENTORY_DATE_IN_FUTURE: "inventoryDate",
  INVENTORY_DATE_BEFORE_RECEIPT: "inventoryDate",
  DRIVER_MOBILE_INVALID: "driverMobile",
  EWAY_BILL_NO_INVALID: "ewayBillNo",
  INVOICE_AMOUNT_INVALID: "invoiceAmount",
};

const WITHOUT_PO = "none";

type FormProps = {
  projectId: string;
  options: GoodsReceiptFormOptions;
  receipt: GoodsReceipt | null;
  today: string;
  onSave: (
    body: ReturnType<typeof goodsReceiptPayload>,
  ) => Promise<GoodsReceipt>;
  saving: boolean;
};

function TextField({
  form,
  name,
  label,
  type = "text",
  inputMode,
  className,
}: {
  form: UseFormReturn<GoodsReceiptFormValues>;
  name: GrnField & FieldName;
  label: string;
  type?: "text" | "date" | "tel";
  inputMode?: "numeric" | "tel";
  className?: string;
}) {
  const id = `grn-${name}`;
  const error = form.formState.errors[name]?.message;
  return (
    <div className={className ?? "space-y-1.5"}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        inputMode={inputMode}
        className="h-10"
        autoComplete="off"
        aria-invalid={error != null}
        {...form.register(name)}
      />
      <FieldError message={error} />
    </div>
  );
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <div className="space-y-1">
        <h2 id={id} className="font-semibold">
          {title}
        </h2>
        {description == null ? null : (
          <p className="text-muted-foreground text-sm">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function OrderLines({
  form,
  financial,
}: {
  form: UseFormReturn<GoodsReceiptFormValues>;
  financial: boolean;
}) {
  const { fields } = useFieldArray({
    control: form.control,
    name: "orderLines",
  });
  const lines = useWatch({ control: form.control, name: "orderLines" });
  const supplyType = useWatch({ control: form.control, name: "supplyType" });
  const errors = form.formState.errors.orderLines;
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Material</TableHead>
              <TableHead className="text-right">Ordered</TableHead>
              <TableHead className="text-right">Already received</TableHead>
              <TableHead className="text-right">Pending</TableHead>
              <TableHead className="min-w-28">Received now</TableHead>
              {financial && <TableHead className="min-w-32">Rate</TableHead>}
              {financial && <TableHead className="min-w-20">GST %</TableHead>}
              {financial && (
                <TableHead className="text-right">Amount</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((field, index) => {
              const line = lines[index] ?? field;
              const excess = excessNow(line);
              const amounts = financial ? liveAmounts(line, supplyType) : null;
              const lineErrors = errors?.[index];
              return (
                <TableRow key={field.id}>
                  <TableCell className="min-w-44">
                    <span className="font-medium">{field.materialName}</span>
                    <span className="text-muted-foreground block text-xs">
                      {field.uomName}
                    </span>
                    {excess != null && (
                      <Badge variant="secondary" className="mt-1">
                        Excess received {qty(String(excess))}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {qty(field.orderedQty)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {qty(field.receivedQty)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {qty(pendingOf(line))}
                  </TableCell>
                  <TableCell>
                    <Input
                      aria-label={`Received now, ${field.materialName}`}
                      inputMode="decimal"
                      className="h-9"
                      aria-invalid={lineErrors?.quantity != null}
                      {...form.register(`orderLines.${index}.quantity`)}
                    />
                    <FieldError message={lineErrors?.quantity?.message} />
                  </TableCell>
                  {financial && (
                    <TableCell>
                      <MoneyInput
                        aria-label={`Rate, ${field.materialName}`}
                        className="h-9"
                        aria-invalid={lineErrors?.rate != null}
                        {...form.register(`orderLines.${index}.rate`)}
                      />
                    </TableCell>
                  )}
                  {financial && (
                    <TableCell>
                      <Input
                        aria-label={`GST %, ${field.materialName}`}
                        inputMode="decimal"
                        className="h-9"
                        aria-invalid={lineErrors?.gstRate != null}
                        {...form.register(`orderLines.${index}.gstRate`)}
                      />
                    </TableCell>
                  )}
                  {financial && (
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {amounts == null ? "—" : money(Number(amounts.total))}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="text-muted-foreground text-xs">
        Leave a line empty when nothing of it arrived. More than pending is
        allowed and shows as excess received.
      </p>
      <FieldError message={errors?.root?.message ?? errors?.message} />
    </div>
  );
}

function ManualLines({
  form,
  financial,
}: {
  form: UseFormReturn<GoodsReceiptFormValues>;
  financial: boolean;
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "manualLines",
  });
  const lines = useWatch({ control: form.control, name: "manualLines" });
  const supplyType = useWatch({ control: form.control, name: "supplyType" });
  const errors = form.formState.errors.manualLines;
  const chosen = lines.map((line) => line.materialId).filter(Boolean);
  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {fields.map((field, index) => {
          const line = lines[index] ?? field;
          const lineErrors = errors?.[index];
          const amounts = financial ? liveAmounts(line, supplyType) : null;
          const n = String(index + 1);
          return (
            <li
              key={field.id}
              className="grid gap-3 rounded-lg border p-3 sm:grid-cols-12 sm:items-start"
            >
              <div className="space-y-1.5 sm:col-span-4">
                <Label htmlFor={`grn-line-${n}-material`}>Material</Label>
                <Controller
                  name={`manualLines.${index}.materialId`}
                  control={form.control}
                  render={({ field: picker }) => (
                    <MaterialPicker
                      id={`grn-line-${n}-material`}
                      aria-label={`Material, line ${n}`}
                      value={picker.value === "" ? null : picker.value}
                      excludeIds={chosen.filter((id) => id !== picker.value)}
                      invalid={lineErrors?.materialId != null}
                      onChange={(material) => {
                        picker.onChange(material?.id ?? "");
                        form.setValue(
                          `manualLines.${index}.uomName`,
                          material?.uomName ?? "",
                        );
                        if (material == null) return;
                        form.setValue(
                          `manualLines.${index}.rate`,
                          material.unitRate == null
                            ? ""
                            : String(material.unitRate / 100),
                        );
                        form.setValue(
                          `manualLines.${index}.gstRate`,
                          material.gstRate == null
                            ? ""
                            : String(Number(material.gstRate)),
                        );
                        form.setValue(
                          `manualLines.${index}.hsnCode`,
                          material.hsnCode ?? "",
                        );
                      }}
                    />
                  )}
                />
                <FieldError message={lineErrors?.materialId?.message} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor={`grn-line-${n}-qty`}>
                  Quantity{line.uomName === "" ? "" : ` (${line.uomName})`}
                </Label>
                <Input
                  id={`grn-line-${n}-qty`}
                  inputMode="decimal"
                  className="h-10"
                  aria-invalid={lineErrors?.quantity != null}
                  {...form.register(`manualLines.${index}.quantity`)}
                />
                <FieldError message={lineErrors?.quantity?.message} />
              </div>
              {financial && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor={`grn-line-${n}-rate`}>Rate</Label>
                  <MoneyInput
                    id={`grn-line-${n}-rate`}
                    className="h-10"
                    aria-invalid={lineErrors?.rate != null}
                    {...form.register(`manualLines.${index}.rate`)}
                  />
                  <FieldError message={lineErrors?.rate?.message} />
                </div>
              )}
              {financial && (
                <div className="space-y-1.5 sm:col-span-1">
                  <Label htmlFor={`grn-line-${n}-gst`}>GST %</Label>
                  <Input
                    id={`grn-line-${n}-gst`}
                    inputMode="decimal"
                    className="h-10"
                    aria-invalid={lineErrors?.gstRate != null}
                    {...form.register(`manualLines.${index}.gstRate`)}
                  />
                  <FieldError message={lineErrors?.gstRate?.message} />
                </div>
              )}
              <div
                className={
                  financial
                    ? "space-y-1.5 sm:col-span-2"
                    : "space-y-1.5 sm:col-span-5"
                }
              >
                <Label htmlFor={`grn-line-${n}-hsn`}>HSN</Label>
                <Input
                  id={`grn-line-${n}-hsn`}
                  inputMode="numeric"
                  className="h-10"
                  aria-invalid={lineErrors?.hsnCode != null}
                  {...form.register(`manualLines.${index}.hsnCode`)}
                />
                <FieldError message={lineErrors?.hsnCode?.message} />
              </div>
              <div className="flex items-center justify-between gap-2 sm:col-span-1 sm:flex-col sm:items-end sm:pt-6">
                {financial && (
                  <span className="text-sm tabular-nums sm:hidden">
                    {amounts == null ? "—" : money(Number(amounts.total))}
                  </span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove line ${n}`}
                  onClick={() => {
                    remove(index);
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          append({
            id: "",
            materialId: "",
            uomName: "",
            quantity: "",
            rate: "",
            gstRate: "",
            hsnCode: "",
          });
        }}
      >
        <Plus aria-hidden="true" />
        Add material
      </Button>
      <FieldError message={errors?.root?.message ?? errors?.message} />
    </div>
  );
}

function Totals({
  control,
  invoiceShown,
}: {
  control: Control<GoodsReceiptFormValues>;
  invoiceShown: boolean;
}) {
  const values = useWatch({ control });
  const supplyType = values.supplyType ?? "intra_state";
  const source =
    (values.purchaseOrderId ?? "") === ""
      ? (values.manualLines ?? [])
      : (values.orderLines ?? []);
  const amounts = source
    .map((line) =>
      liveAmounts(
        {
          quantity: line.quantity ?? "",
          rate: line.rate ?? "",
          gstRate: line.gstRate ?? "",
        },
        supplyType,
      ),
    )
    .filter((line): line is LineAmounts => line != null);
  const totals = documentTotals(amounts);
  const invoice = rupeesToPaise(values.invoiceAmount ?? "");
  const differs =
    invoiceShown &&
    invoice != null &&
    !Number.isNaN(invoice) &&
    invoice !== Number(totals.itemsTotal);
  return (
    <div className="bg-muted/40 ml-auto w-full max-w-sm space-y-1.5 rounded-lg border p-4 text-sm">
      <dl className="space-y-1.5">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Taxable value</dt>
          <dd className="tabular-nums">{money(Number(totals.taxableTotal))}</dd>
        </div>
        {supplyType === "intra_state" ? (
          <>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">CGST</dt>
              <dd className="tabular-nums">
                {money(Number(totals.cgstTotal))}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">SGST</dt>
              <dd className="tabular-nums">
                {money(Number(totals.sgstTotal))}
              </dd>
            </div>
          </>
        ) : (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">IGST</dt>
            <dd className="tabular-nums">{money(Number(totals.igstTotal))}</dd>
          </div>
        )}
        <div className="flex justify-between gap-4 border-t pt-1.5 font-semibold">
          <dt>GRN value</dt>
          <dd className="tabular-nums">{money(Number(totals.itemsTotal))}</dd>
        </div>
      </dl>
      {differs && (
        <p className="text-xs text-amber-700 dark:text-amber-400" role="status">
          The invoice amount is {money(invoice)}, not the GRN value. You can
          still save.
        </p>
      )}
    </div>
  );
}

function GoodsReceiptForm({
  projectId,
  options,
  receipt,
  today,
  onSave,
  saving,
}: FormProps) {
  const router = useRouter();
  const financial = options.financial;
  const hidden = new Set<string>(options.hiddenFields);
  const form = useForm<GoodsReceiptFormValues>({
    resolver: zodResolver(goodsReceiptFormSchema),
    defaultValues: goodsReceiptFormDefaults(options, receipt, today),
  });
  const [failure, setFailure] = useState<unknown>(null);
  const errors = form.formState.errors;
  const supplierId = useWatch({ control: form.control, name: "supplierId" });
  const purchaseOrderId = useWatch({
    control: form.control,
    name: "purchaseOrderId",
  });
  const orders = options.purchaseOrders.filter(
    (order) => supplierId === "" || order.supplierId === supplierId,
  );
  const supplierFields = SUPPLIER_FIELDS.filter(
    (field) => !hidden.has(field) && (field !== "invoiceAmount" || financial),
  );
  const deliveryFields = DELIVERY_FIELDS.filter((field) => !hidden.has(field));
  const back =
    receipt == null
      ? goodsReceivedPath(projectId)
      : goodsReceivedPath(projectId, `/${receipt.id}`);

  const choosePurchaseOrder = (value: string) => {
    const order =
      value === WITHOUT_PO
        ? null
        : (options.purchaseOrders.find((item) => item.id === value) ?? null);
    form.setValue("purchaseOrderId", order?.id ?? "");
    form.setValue(
      "orderLines",
      order == null
        ? []
        : orderLineValues(
            order,
            receipt?.purchaseOrder?.id === order.id ? receipt : null,
          ),
    );
    if (order != null) {
      form.setValue("supplierId", order.supplierId, { shouldValidate: true });
      form.setValue("manualLines", []);
    }
    form.setValue(
      "supplyType",
      supplyTypeFor(
        options,
        order?.supplierId ?? form.getValues("supplierId"),
        order,
      ),
    );
  };

  const submit = form.handleSubmit(async (values) => {
    setFailure(null);
    try {
      const saved = await onSave(
        goodsReceiptPayload(values, { financial, hidden }),
      );
      router.push(goodsReceivedPath(projectId, `/${saved.id}`));
    } catch (error) {
      setFailure(error);
      const code = error instanceof QueryHttpError ? error.code : "";
      const field = FIELD_FOR_CODE[code];
      const line = errorLine(error);
      const message =
        error instanceof QueryHttpError
          ? line == null
            ? error.message
            : `Line ${String(line)}: ${error.message}`
          : "Something went wrong. Please try again.";
      if (stockShortfalls(error) != null) return;
      form.setError(field ?? "root", { message });
    }
  });

  const shortfalls = stockShortfalls(failure);

  return (
    <form
      noValidate
      className="space-y-8"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <Section id="grn-details" title="Details">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextFieldDate
            form={form}
            name="receiptDate"
            label="GR Date"
            max={today}
          />
          <TextFieldDate
            form={form}
            name="inventoryDate"
            label="Inventory Date"
            max={today}
            hint="The date the stock is added."
          />
          <div className="space-y-1.5">
            <Label htmlFor="grn-supplier">Supplier</Label>
            {options.suppliers.length === 0 ? (
              <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-sm">
                No Suppliers on this Project. Add one under the Project&apos;s
                Resources first.
              </p>
            ) : (
              <Controller
                name="supplierId"
                control={form.control}
                render={({ field }) => (
                  <ChoiceSelect
                    id="grn-supplier"
                    label="Supplier"
                    value={field.value === "" ? "" : field.value}
                    invalid={errors.supplierId != null}
                    items={[
                      ...(field.value === ""
                        ? [{ value: "", label: "Choose a Supplier" }]
                        : []),
                      ...options.suppliers.map((supplier) => ({
                        value: supplier.id,
                        label: supplier.name,
                      })),
                    ]}
                    onChange={(value) => {
                      field.onChange(value);
                      const order = options.purchaseOrders.find(
                        (item) => item.id === form.getValues("purchaseOrderId"),
                      );
                      if (order != null && order.supplierId !== value) {
                        form.setValue("purchaseOrderId", "");
                        form.setValue("orderLines", []);
                      }
                      form.setValue(
                        "supplyType",
                        supplyTypeFor(
                          options,
                          value,
                          order?.supplierId === value ? order : null,
                        ),
                      );
                    }}
                  />
                )}
              />
            )}
            <FieldError message={errors.supplierId?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="grn-purchase-order">Purchase Order</Label>
            <ChoiceSelect
              id="grn-purchase-order"
              label="Purchase Order"
              value={purchaseOrderId === "" ? WITHOUT_PO : purchaseOrderId}
              invalid={errors.purchaseOrderId != null}
              items={[
                { value: WITHOUT_PO, label: "Without PO" },
                ...orders.map((order) => ({
                  value: order.id,
                  label: `${order.number} · ${formatDate(order.orderDate)}`,
                })),
              ]}
              onChange={choosePurchaseOrder}
            />
            <FieldError message={errors.purchaseOrderId?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="grn-supply-type">GST</Label>
            <Controller
              name="supplyType"
              control={form.control}
              render={({ field }) => (
                <ChoiceSelect
                  id="grn-supply-type"
                  label="GST"
                  value={field.value}
                  items={[
                    {
                      value: "intra_state",
                      label: SUPPLY_TYPE_LABELS.intra_state,
                    },
                    {
                      value: "inter_state",
                      label: SUPPLY_TYPE_LABELS.inter_state,
                    },
                  ]}
                  onChange={field.onChange}
                />
              )}
            />
          </div>
        </div>
      </Section>

      <Section
        id="grn-lines"
        title="Materials received"
        description={
          purchaseOrderId === ""
            ? "Each material arrived, with its quantity."
            : "The Purchase Order's lines: ordered, already received, and what arrived now."
        }
      >
        {purchaseOrderId === "" ? (
          <ManualLines form={form} financial={financial} />
        ) : (
          <OrderLines key={purchaseOrderId} form={form} financial={financial} />
        )}
        {financial && (
          <Totals
            control={form.control}
            invoiceShown={supplierFields.includes("invoiceAmount")}
          />
        )}
      </Section>

      {supplierFields.length > 0 && (
        <Section id="grn-supplier-details" title="Supplier details">
          <div className="grid gap-4 sm:grid-cols-3">
            {supplierFields.map((field) =>
              field === "invoiceAmount" ? (
                <div key={field} className="space-y-1.5">
                  <Label htmlFor="grn-invoiceAmount">
                    {GRN_FIELD_LABELS.invoiceAmount}
                  </Label>
                  <MoneyInput
                    id="grn-invoiceAmount"
                    className="h-10"
                    aria-invalid={errors.invoiceAmount != null}
                    {...form.register("invoiceAmount")}
                  />
                  <FieldError message={errors.invoiceAmount?.message} />
                </div>
              ) : (
                <TextField
                  key={field}
                  form={form}
                  name={field}
                  label={GRN_FIELD_LABELS[field]}
                  type={field === "invoiceDate" ? "date" : "text"}
                />
              ),
            )}
          </div>
        </Section>
      )}

      {deliveryFields.length > 0 && (
        <Section id="grn-delivery-details" title="Delivery details">
          <div className="grid gap-4 sm:grid-cols-3">
            {deliveryFields.map((field) => (
              <TextField
                key={field}
                form={form}
                name={field}
                label={GRN_FIELD_LABELS[field]}
                type={field === "driverMobile" ? "tel" : "text"}
                inputMode={
                  field === "driverMobile"
                    ? "tel"
                    : field === "ewayBillNo"
                      ? "numeric"
                      : undefined
                }
              />
            ))}
          </div>
        </Section>
      )}

      {!hidden.has("remark") && (
        <div className="space-y-1.5">
          <Label htmlFor="grn-remark">Remark</Label>
          <Textarea
            id="grn-remark"
            rows={2}
            aria-invalid={errors.remark != null}
            {...form.register("remark")}
          />
          <FieldError message={errors.remark?.message} />
        </div>
      )}

      {shortfalls != null && (
        <StockShortfallAlert shortfalls={shortfalls} action="edit" />
      )}
      <FormAlert message={errors.root?.message} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>
          {saving
            ? "Saving…"
            : receipt == null
              ? "Save Goods Receipt"
              : "Save changes"}
        </Button>
        <Link href={back} className={buttonVariants({ variant: "outline" })}>
          Cancel
        </Link>
      </div>
    </form>
  );
}

function TextFieldDate({
  form,
  name,
  label,
  max,
  hint,
}: {
  form: UseFormReturn<GoodsReceiptFormValues>;
  name: "receiptDate" | "inventoryDate";
  label: string;
  max: string;
  hint?: string;
}) {
  const id = `grn-${name}`;
  const error = form.formState.errors[name]?.message;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="date"
        max={max}
        className="h-10"
        aria-invalid={error != null}
        {...form.register(name)}
      />
      {hint != null && error == null && (
        <p className="text-muted-foreground text-xs">{hint}</p>
      )}
      <FieldError message={error} />
    </div>
  );
}

function FormPage({
  projectId,
  title,
  backTo,
  children,
}: {
  projectId: string;
  title: string;
  backTo?: { label: string; href: string };
  children: ReactNode;
}) {
  return (
    <div className="w-full max-w-4xl space-y-6">
      <PageHeader
        back={
          backTo ?? {
            label: "Goods Received",
            href: goodsReceivedPath(projectId),
          }
        }
        title={title}
      />
      {children}
    </div>
  );
}

function useCanWrite(projectId: string, flag: "create" | "update") {
  const access = useQuery(procurementAccessQuery(projectId)).data;
  return access == null || canIn(access, "procurement.material_received", flag);
}

/** Record Goods Receipt on a Project (CM-505). */
export function NewGoodsReceiptScreen({
  projectId,
  today,
}: {
  projectId: string;
  /** Defaults to today on this device. */
  today?: string;
}) {
  const allowed = useCanWrite(projectId, "create");
  const { data: options } = useSuspenseQuery(
    goodsReceiptFormOptionsQuery({ kind: "project", id: projectId }),
  );
  const post = usePostGoodsReceipt();
  if (!allowed) return <GoodsReceiptNoAccess what="recording Goods Receipts" />;
  return (
    <FormPage projectId={projectId} title="Record Goods Receipt">
      <GoodsReceiptForm
        projectId={projectId}
        options={options}
        receipt={null}
        today={today ?? localToday()}
        saving={post.isPending}
        onSave={(body) =>
          post.mutateAsync({
            ...body,
            locationKind: "project",
            locationId: projectId,
          })
        }
      />
    </FormPage>
  );
}

/** Edit Goods Receipt; 409 when someone saved it since. */
export function EditGoodsReceiptScreen({
  projectId,
  id,
  today,
}: {
  projectId: string;
  id: string;
  today?: string;
}) {
  const allowed = useCanWrite(projectId, "update");
  const { data: receipt } = useSuspenseQuery(goodsReceiptQuery(id));
  const { data: options } = useSuspenseQuery(
    goodsReceiptFormOptionsQuery({ kind: "project", id: projectId }, id),
  );
  const update = useUpdateGoodsReceipt(id);
  if (!allowed) return <GoodsReceiptNoAccess what="editing Goods Receipts" />;
  return (
    <FormPage
      projectId={projectId}
      title={`Edit ${receipt.number}`}
      backTo={{
        label: receipt.number,
        href: goodsReceivedPath(projectId, `/${receipt.id}`),
      }}
    >
      {receipt.paid ? (
        <p className="text-muted-foreground rounded-lg border p-4 text-sm">
          A supplier payment points at this Goods Receipt, so it cannot be
          changed.
        </p>
      ) : (
        <GoodsReceiptForm
          key={receipt.updatedAt}
          projectId={projectId}
          options={options}
          receipt={receipt}
          today={today ?? localToday()}
          saving={update.isPending}
          onSave={(body) =>
            update.mutateAsync({
              ...body,
              expectedUpdatedAt: receipt.updatedAt,
            })
          }
        />
      )}
    </FormPage>
  );
}
