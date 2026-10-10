"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
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
import { Skeleton } from "@repo/ui/components/skeleton";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { LocationPicker } from "@/components/locations/location-picker";
import { MoneyInput } from "@/components/money/money-input";
import {
  formatDate,
  localToday,
  money,
} from "@/components/payments/payment-format";
import { quantityText } from "@/components/procurement/purchase-requests/purchase-request-format";
import { fieldForCode } from "@/lib/server-errors";
import { materialOptionsQuery } from "@/src/queries/material-options";
import {
  canIn,
  procurementAccessQuery,
} from "@/src/queries/procurement-access";
import { uploadDocumentFile } from "@/src/queries/procurement-documents";
import {
  purchaseOrderFormOptionsQuery,
  useCreatePurchaseOrder,
  useUpdatePurchaseOrder,
  type PurchaseOrderDetail,
  type PurchaseOrderFormOptions,
} from "@/src/queries/purchase-orders";
import { GST_STATES } from "@/src/shared-kernel/gst-states";

import {
  effectiveSupplyType,
  formDefaults,
  lineAmountsOf,
  lineFromMaterial,
  purchaseOrderFormSchema,
  toPurchaseOrderInput,
  totalsOf,
  type LineValue,
  type PurchaseOrderFormValues,
} from "./purchase-order-form-schema";
import { purchaseOrdersPath } from "./purchase-order-format";
import { PurchaseOrderLineSheet } from "./purchase-order-line-sheet";

const NONE = "__none";

const SERVER_FIELDS: Partial<
  Record<string, FieldPath<PurchaseOrderFormValues>>
> = {
  ORDER_DATE_INVALID: "orderDate",
  DATE_IN_FUTURE: "orderDate",
  BACKDATED_CREATE_BLOCKED: "orderDate",
  BACKDATED_EDIT_BLOCKED: "orderDate",
  FINANCIAL_PERIOD_CLOSED: "orderDate",
  EXPECTED_DELIVERY_BEFORE_ORDER_DATE: "expectedDeliveryDate",
  EXPECTED_DELIVERY_DATE_REQUIRED: "expectedDeliveryDate",
  SUPPLIER_NOT_FOUND: "supplierId",
  SUPPLIER_INACTIVE: "supplierId",
  SUPPLIER_NOT_ON_PROJECT: "supplierId",
  PURCHASE_REQUEST_NOT_FOUND: "purchaseRequestId",
  PURCHASE_REQUEST_NOT_ORDERABLE: "purchaseRequestId",
  BILLING_ADDRESS_REQUIRED: "billingAddressId",
  BILLING_ADDRESS_NOT_FOUND: "billingAddressId",
  DELIVERY_ADDRESS_REQUIRED: "deliveryAddress",
  MOBILE_INVALID: "sitePocMobile",
  DEDUCTION_TOO_LARGE: "deductionAmount",
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-4 rounded-lg border p-4">
      <h3 className="font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function SimpleSelect({
  id,
  value,
  items,
  invalid,
  disabled,
  onChange,
}: {
  id: string;
  value: string;
  items: { value: string; label: string }[];
  invalid?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Select
      items={items}
      value={value === "" ? NONE : value}
      disabled={disabled}
      onValueChange={(next) => {
        onChange(next == null || next === NONE ? "" : next);
      }}
    >
      <SelectTrigger
        id={id}
        size="lg"
        className="w-full min-w-0"
        aria-invalid={invalid}
      >
        <SelectValue />
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

export type PurchaseOrderFormProps = {
  projectId: string;
  today?: string;
  existing?: PurchaseOrderDetail;
  /** Generate PO: open with this Purchase Request's pending items. */
  initialPurchaseRequestId?: string;
};

/** The PO form (CM-504) once its options have loaded. */
export function PurchaseOrderForm(props: PurchaseOrderFormProps) {
  const { data } = useSuspenseQuery(
    purchaseOrderFormOptionsQuery(props.projectId),
  );
  return <PurchaseOrderFields {...props} options={data} />;
}

function PurchaseOrderFields({
  projectId,
  today = localToday(),
  existing,
  initialPurchaseRequestId,
  options,
}: PurchaseOrderFormProps & { options: PurchaseOrderFormOptions }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const access = useQuery(procurementAccessQuery(projectId)).data;
  const canApprove =
    access != null && canIn(access, "procurement.purchase_orders", "approve");
  const form = useForm<PurchaseOrderFormValues>({
    resolver: zodResolver(purchaseOrderFormSchema),
    defaultValues: formDefaults(today, options, existing),
    mode: "onTouched",
  });
  const { fields, append, update, remove, replace } = useFieldArray({
    control: form.control,
    name: "lines",
    keyName: "fieldKey",
  });
  const values = useWatch({ control: form.control });
  const lines = (values.lines ?? []) as LineValue[];
  const { supplyType, placeOfSupply } = effectiveSupplyType(
    {
      supplyType: values.supplyType ?? "auto",
      deliveryAddressDiffers: values.deliveryAddressDiffers ?? false,
      deliveryStateCode: values.deliveryStateCode ?? "",
      supplierId: values.supplierId ?? "",
    },
    options,
  );
  const totals = totalsOf(
    lines,
    supplyType,
    values.additionalCharges ?? "",
    values.deductionAmount ?? "",
  );
  const [sheet, setSheet] = useState<{
    open: boolean;
    index: number | null;
    /** A new key per opening, so the sheet starts from the line given. */
    version: number;
  }>({ open: false, index: null, version: 0 });
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [loadingPr, setLoadingPr] = useState(false);
  const create = useCreatePurchaseOrder();
  const updatePo = useUpdatePurchaseOrder(existing?.id ?? "");
  const busy = create.isPending || updatePo.isPending;
  const errors = form.formState.errors;

  /** Loads a PR's pending items as lines, rates from the Material master. */
  const loadPurchaseRequest = async (prId: string) => {
    form.setValue("purchaseRequestId", prId);
    if (prId === "") {
      // Back to no Purchase Request: keep the lines, without their links.
      replace(
        form
          .getValues("lines")
          .map((line) => ({ ...line, purchaseRequestItemId: null })),
      );
      return;
    }
    const pr = options.purchaseRequests.find((item) => item.id === prId);
    if (pr == null) return;
    setLoadingPr(true);
    try {
      const pending = pr.items.filter((item) => Number(item.pendingQty) > 0);
      const materials = await queryClient.query(
        materialOptionsQuery({ ids: pending.map((item) => item.materialId) }),
      );
      const byId = new Map(
        materials.map((material) => [material.id, material]),
      );
      replace(
        pending.flatMap((item) => {
          const material = byId.get(item.materialId);
          return material == null
            ? []
            : [
                lineFromMaterial(
                  material,
                  quantityText(item.pendingQty),
                  item.id,
                ),
              ];
        }),
      );
      if (
        form.getValues("expectedDeliveryDate") === "" &&
        pr.requiredDate != null
      )
        form.setValue("expectedDeliveryDate", pr.requiredDate);
    } finally {
      setLoadingPr(false);
    }
  };
  const generated = useRef(false);
  useEffect(() => {
    if (
      generated.current ||
      existing != null ||
      initialPurchaseRequestId == null
    )
      return;
    generated.current = true;
    void loadPurchaseRequest(initialPurchaseRequestId);
    // Runs once for Generate PO.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (approve: boolean) =>
    form.handleSubmit(async (formValues) => {
      setError(undefined);
      const input = toPurchaseOrderInput(formValues, approve);
      try {
        const saved =
          existing == null
            ? await create.mutateAsync({ projectId, ...input })
            : await updatePo.mutateAsync({
                ...input,
                expectedUpdatedAt: existing.updatedAt,
              });
        let failed = 0;
        for (const file of files) {
          try {
            await uploadDocumentFile("purchase_order", saved.id, file);
          } catch {
            failed += 1;
          }
        }
        const path = purchaseOrdersPath(projectId, `/${saved.id}`);
        router.push(
          failed > 0 ? `${path}?uploadFailed=${String(failed)}` : path,
        );
      } catch (failure) {
        const { field, message } = fieldForCode(failure, SERVER_FIELDS);
        if (field != null) form.setError(field, { message });
        else setError(message);
      }
    })();

  const supplierItems = [
    { value: NONE, label: "Choose a Supplier" },
    ...options.suppliers.map((item) => ({ value: item.id, label: item.name })),
  ];
  const prItems = [
    { value: NONE, label: "None" },
    ...options.purchaseRequests.map((item) => ({
      value: item.id,
      label: `${item.number} · ${formatDate(item.requestDate)}`,
    })),
  ];
  if (
    existing?.purchaseRequest != null &&
    !prItems.some((item) => item.value === existing.purchaseRequest?.id)
  )
    prItems.push({
      value: existing.purchaseRequest.id,
      label: existing.purchaseRequest.number ?? "Purchase Request",
    });
  const billingItems = [
    { value: NONE, label: "Choose a billing address" },
    ...options.billingAddresses.map((item) => ({
      value: item.id,
      label: `${item.name}${item.isDefault ? " (default)" : ""}`,
    })),
  ];
  const stateItems = [
    { value: NONE, label: "Choose a state" },
    ...GST_STATES.map((state) => ({ value: state.code, label: state.name })),
  ];
  const supplyItems = [
    {
      value: "auto",
      label: `As per the states (${supplyType === "intra_state" ? "CGST + SGST" : "IGST"})`,
    },
    { value: "intra_state", label: "Intra-state: CGST + SGST" },
    { value: "inter_state", label: "Inter-state: IGST" },
  ];
  const linesError = errors.lines?.message ?? errors.lines?.root?.message;

  return (
    <form
      noValidate
      className="w-full max-w-4xl space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <FormAlert message={error} />
      <Section title="Order">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="po-date">Purchase Order Date</Label>
            <Input
              id="po-date"
              type="date"
              max={today}
              aria-invalid={errors.orderDate != null}
              {...form.register("orderDate")}
            />
            <FieldError message={errors.orderDate?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-pr">Purchase Request Number</Label>
            <Controller
              name="purchaseRequestId"
              control={form.control}
              render={({ field }) => (
                <SimpleSelect
                  id="po-pr"
                  value={field.value}
                  items={prItems}
                  disabled={existing != null || loadingPr}
                  invalid={errors.purchaseRequestId != null}
                  onChange={(next) => {
                    void loadPurchaseRequest(next);
                  }}
                />
              )}
            />
            <FieldError message={errors.purchaseRequestId?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-supplier">Supplier</Label>
            <Controller
              name="supplierId"
              control={form.control}
              render={({ field }) => (
                <SimpleSelect
                  id="po-supplier"
                  value={field.value}
                  items={supplierItems}
                  invalid={errors.supplierId != null}
                  onChange={(next) => {
                    field.onChange(next);
                    const supplier = options.suppliers.find(
                      (item) => item.id === next,
                    );
                    if (
                      supplier != null &&
                      form.getValues("supplierPocName") === ""
                    ) {
                      form.setValue(
                        "supplierPocName",
                        supplier.contactPerson ?? "",
                      );
                      form.setValue("supplierPocMobile", supplier.mobile ?? "");
                    }
                  }}
                />
              )}
            />
            {options.suppliers.length === 0 && (
              <p className="text-muted-foreground text-xs">
                No active Supplier is assigned to this Project. Add one under
                Resources.
              </p>
            )}
            <FieldError message={errors.supplierId?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-expected">Expected Delivery Date</Label>
            <Input
              id="po-expected"
              type="date"
              aria-invalid={errors.expectedDeliveryDate != null}
              {...form.register("expectedDeliveryDate")}
            />
            <FieldError message={errors.expectedDeliveryDate?.message} />
          </div>
          <div className="sm:col-span-2">
            <Suspense fallback={<Skeleton className="h-10 w-full" />}>
              <Controller
                name="siteLocation"
                control={form.control}
                render={({ field }) => (
                  <LocationPicker
                    projectId={projectId}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </Suspense>
          </div>
        </div>
      </Section>

      <Section title="Materials">
        {fields.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {loadingPr
              ? "Loading the request's pending items…"
              : "No materials yet."}
          </p>
        ) : (
          <ul aria-label="Order lines" className="divide-y rounded-lg border">
            {fields.map((field, index) => {
              const line = lines[index] ?? field;
              const amounts = lineAmountsOf(line, supplyType);
              return (
                <li key={field.fieldKey} className="flex items-start gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{line.materialName}</p>
                    <p className="text-muted-foreground text-xs">
                      {quantityText(line.quantity)} {line.uomName} × ₹
                      {line.rate}
                      {line.hsnCode !== "" && ` · HSN ${line.hsnCode}`}
                      {line.gstRate !== "" && ` · GST ${line.gstRate}%`}
                    </p>
                  </div>
                  <p className="font-medium tabular-nums">
                    {money(amounts == null ? null : Number(amounts.total))}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${line.materialName}`}
                    onClick={() => {
                      setSheet((current) => ({
                        open: true,
                        index,
                        version: current.version + 1,
                      }));
                    }}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${line.materialName}`}
                    onClick={() => {
                      remove(index);
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <FieldError message={linesError} />
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setSheet((current) => ({
              open: true,
              index: null,
              version: current.version + 1,
            }));
          }}
        >
          <Plus aria-hidden="true" />
          Add Materials
        </Button>
      </Section>

      <Section title="Charges">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="po-charges">Additional Charges</Label>
            <MoneyInput
              id="po-charges"
              aria-invalid={errors.additionalCharges != null}
              {...form.register("additionalCharges")}
            />
            <FieldError message={errors.additionalCharges?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-deduction">Deduction Amount</Label>
            <MoneyInput
              id="po-deduction"
              aria-invalid={errors.deductionAmount != null}
              {...form.register("deductionAmount")}
            />
            <FieldError message={errors.deductionAmount?.message} />
          </div>
        </div>
        <dl
          aria-label="Totals"
          className="bg-muted/50 grid grid-cols-2 gap-1 rounded-lg p-3 text-sm sm:max-w-sm sm:justify-self-end"
        >
          <dt className="text-muted-foreground">Sub Total</dt>
          <dd className="text-right tabular-nums">
            {money(totals == null ? null : Number(totals.subTotal))}
          </dd>
          <dt className="text-muted-foreground">Discount</dt>
          <dd className="text-right tabular-nums">
            {money(totals == null ? null : Number(totals.discountTotal))}
          </dd>
          <dt className="text-muted-foreground">Taxable value</dt>
          <dd className="text-right tabular-nums">
            {money(totals == null ? null : Number(totals.taxableTotal))}
          </dd>
          {supplyType === "intra_state" ? (
            <>
              <dt className="text-muted-foreground">CGST</dt>
              <dd className="text-right tabular-nums">
                {money(totals == null ? null : Number(totals.cgstTotal))}
              </dd>
              <dt className="text-muted-foreground">SGST</dt>
              <dd className="text-right tabular-nums">
                {money(totals == null ? null : Number(totals.sgstTotal))}
              </dd>
            </>
          ) : (
            <>
              <dt className="text-muted-foreground">IGST</dt>
              <dd className="text-right tabular-nums">
                {money(totals == null ? null : Number(totals.igstTotal))}
              </dd>
            </>
          )}
          <dt className="font-semibold">Total</dt>
          <dd
            className="text-right font-semibold tabular-nums"
            data-testid="po-grand-total"
          >
            {money(totals == null ? null : Number(totals.grandTotal))}
          </dd>
        </dl>
      </Section>

      <Section title="Billing">
        <div className="space-y-1.5">
          <Label htmlFor="po-billing">Billing Address</Label>
          <Controller
            name="billingAddressId"
            control={form.control}
            render={({ field }) => (
              <SimpleSelect
                id="po-billing"
                value={field.value}
                items={billingItems}
                invalid={errors.billingAddressId != null}
                onChange={field.onChange}
              />
            )}
          />
          <FieldError message={errors.billingAddressId?.message} />
        </div>
      </Section>

      <Section title="Contact Details">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="po-supplier-poc">Supplier POC Name</Label>
            <Input id="po-supplier-poc" {...form.register("supplierPocName")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-supplier-poc-mobile">Supplier POC Number</Label>
            <Input
              id="po-supplier-poc-mobile"
              inputMode="tel"
              aria-invalid={errors.supplierPocMobile != null}
              {...form.register("supplierPocMobile")}
            />
            <FieldError message={errors.supplierPocMobile?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-site-poc">Site POC Name</Label>
            <Input id="po-site-poc" {...form.register("sitePocName")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-site-poc-mobile">Site POC Number</Label>
            <Input
              id="po-site-poc-mobile"
              inputMode="tel"
              aria-invalid={errors.sitePocMobile != null}
              {...form.register("sitePocMobile")}
            />
            <FieldError message={errors.sitePocMobile?.message} />
          </div>
        </div>
      </Section>

      <Section title="Terms & Conditions">
        <div className="space-y-1.5 sm:max-w-xs">
          <Label htmlFor="po-payment-terms">Payment Terms (Days)</Label>
          <Input
            id="po-payment-terms"
            inputMode="numeric"
            aria-invalid={errors.paymentTermsDays != null}
            {...form.register("paymentTermsDays")}
          />
          <FieldError message={errors.paymentTermsDays?.message} />
        </div>
        {options.terms.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No Terms & Conditions in Masters yet.
          </p>
        ) : (
          <Controller
            name="termsIds"
            control={form.control}
            render={({ field }) => (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">
                  Select Terms & Conditions
                </legend>
                {options.terms.map((term) => (
                  <label
                    key={term.id}
                    className="flex items-start gap-2 text-sm"
                  >
                    <Checkbox
                      checked={field.value.includes(term.id)}
                      onCheckedChange={(on) => {
                        field.onChange(
                          on
                            ? [...field.value, term.id]
                            : field.value.filter((id) => id !== term.id),
                        );
                      }}
                    />
                    <span>
                      <span className="font-medium">{term.title}</span>
                      <span className="text-muted-foreground block text-xs">
                        {term.body}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
          />
        )}
      </Section>

      <Section title="Additional">
        <Controller
          name="deliveryAddressDiffers"
          control={form.control}
          render={({ field }) => (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={field.value}
                onCheckedChange={field.onChange}
              />
              Delivery Address is other than Project Address
            </label>
          )}
        />
        {values.deliveryAddressDiffers === true && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="po-delivery-address">Delivery Address</Label>
              <Textarea
                id="po-delivery-address"
                aria-invalid={errors.deliveryAddress != null}
                {...form.register("deliveryAddress")}
              />
              <FieldError message={errors.deliveryAddress?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-delivery-state">Delivery State</Label>
              <Controller
                name="deliveryStateCode"
                control={form.control}
                render={({ field }) => (
                  <SimpleSelect
                    id="po-delivery-state"
                    value={field.value}
                    items={stateItems}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="po-supply-type">Supply type</Label>
          <Controller
            name="supplyType"
            control={form.control}
            render={({ field }) => (
              <SimpleSelect
                id="po-supply-type"
                value={field.value}
                items={supplyItems}
                onChange={(next) => {
                  field.onChange(next === "" ? "auto" : next);
                }}
              />
            )}
          />
          <p className="text-muted-foreground text-xs">
            Place of supply:{" "}
            {placeOfSupply == null
              ? "not known"
              : (GST_STATES.find((state) => state.code === placeOfSupply)
                  ?.name ?? placeOfSupply)}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="po-remark">Remark</Label>
          <Textarea
            id="po-remark"
            maxLength={500}
            {...form.register("remark")}
          />
          <FieldError message={errors.remark?.message} />
        </div>
        {existing == null && (
          <div className="space-y-1.5">
            <Label htmlFor="po-files">Attachment</Label>
            <Input
              id="po-files"
              type="file"
              multiple
              onChange={(event) => {
                setFiles([...(event.target.files ?? [])]);
              }}
            />
          </div>
        )}
      </Section>

      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            router.back();
          }}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant={canApprove ? "outline" : "default"}
          disabled={busy}
          onClick={() => {
            void submit(false);
          }}
        >
          Save
        </Button>
        {canApprove && (
          <Button
            type="button"
            disabled={busy}
            onClick={() => {
              void submit(true);
            }}
          >
            Save &amp; Approve
          </Button>
        )}
      </div>

      <PurchaseOrderLineSheet
        key={sheet.version}
        open={sheet.open}
        onOpenChange={(open) => {
          setSheet((current) => ({ ...current, open }));
        }}
        projectId={projectId}
        line={sheet.index == null ? null : (lines[sheet.index] ?? null)}
        usedMaterialIds={lines.map((line) => line.materialId)}
        supplyType={supplyType}
        onSave={(line) => {
          if (sheet.index == null) append(line);
          else update(sheet.index, line);
          form.clearErrors("lines");
        }}
      />
    </form>
  );
}
