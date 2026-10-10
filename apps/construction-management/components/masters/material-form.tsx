"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button, buttonVariants } from "@repo/ui/components/button";
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
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";

import { PageHeader } from "@/components/app-shell/page-header";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import {
  MoneyInput,
  isRupees,
  paiseToRupees,
  rupeesToPaise,
} from "@/components/money/money-input";
import { fieldForCode } from "@/lib/server-errors";
import {
  categoryOptionsQuery,
  categoryPath,
  materialMasterListQuery,
  materialMasterQuery,
  unitOptionsQuery,
  useCreateMaterial,
  useUpdateMaterial,
  type MaterialInput,
  type MaterialItem,
} from "@/src/queries/material-masters";

import { ITEM_TYPE_LABELS } from "./material-master-lists";

export const MATERIALS_PATH = "/app/masters/materials";

const NO_CATEGORY = "none";
const PERCENT_RE = /^\d{1,3}(\.\d{1,2})?$/;
const QUANTITY_RE = /^\d{1,11}(\.\d{1,3})?$/;

function percentOk(value: string): boolean {
  const text = value.trim();
  return text === "" || (PERCENT_RE.test(text) && Number(text) <= 100);
}

export const materialFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Enter the Material name")
      .max(120, "Use at most 120 characters"),
    specification: z.string().trim().max(500, "Use at most 500 characters"),
    uomId: z.string().min(1, "Choose the Measurement Unit"),
    categoryId: z.string(),
    itemType: z.enum(["consumable", "non_consumable", "asset"]),
    hasMinStock: z.boolean(),
    minStockQty: z.string().trim(),
    hasRate: z.boolean(),
    unitRate: z.string(),
    discountType: z.enum(["amount", "percent"]),
    discountValue: z.string(),
    gstRate: z.string().trim(),
    hsnCode: z.string().trim(),
  })
  .superRefine((values, context) => {
    if (values.hasMinStock && !QUANTITY_RE.test(values.minStockQty))
      context.addIssue({
        code: "custom",
        path: ["minStockQty"],
        message: "Enter a quantity, up to 3 decimals",
      });
    if (!values.hasRate) return;
    if (values.unitRate.trim() !== "" && !isRupees(values.unitRate))
      context.addIssue({
        code: "custom",
        path: ["unitRate"],
        message: "Enter the rate in rupees",
      });
    if (values.discountValue.trim() !== "") {
      const ok =
        values.discountType === "amount"
          ? isRupees(values.discountValue)
          : percentOk(values.discountValue);
      if (!ok)
        context.addIssue({
          code: "custom",
          path: ["discountValue"],
          message:
            values.discountType === "amount"
              ? "Enter the discount in rupees"
              : "Enter a percent between 0 and 100",
        });
    }
    if (!percentOk(values.gstRate))
      context.addIssue({
        code: "custom",
        path: ["gstRate"],
        message: "Enter a percent between 0 and 100",
      });
    if (values.hsnCode !== "" && !/^\d{4,8}$/.test(values.hsnCode))
      context.addIssue({
        code: "custom",
        path: ["hsnCode"],
        message: "Enter 4 to 8 digits",
      });
  });

export type MaterialFormValues = z.infer<typeof materialFormSchema>;

export function materialFormDefaults(
  material: MaterialItem | null,
): MaterialFormValues {
  const hasRate =
    material != null &&
    (material.unitRate != null ||
      material.discount != null ||
      material.gstRate != null ||
      material.hsnCode != null);
  return {
    name: material?.name ?? "",
    specification: material?.specification ?? "",
    uomId: material?.uomId ?? "",
    categoryId: material?.categoryId ?? NO_CATEGORY,
    itemType: material?.itemType ?? "consumable",
    hasMinStock: material?.minStockQty != null,
    minStockQty:
      material?.minStockQty == null ? "" : String(Number(material.minStockQty)),
    hasRate,
    unitRate: paiseToRupees(material?.unitRate),
    discountType: material?.discount?.type ?? "percent",
    discountValue:
      material?.discount == null
        ? ""
        : material.discount.type === "amount"
          ? paiseToRupees(material.discount.paise)
          : String(Number(material.discount.percent)),
    gstRate: material?.gstRate == null ? "" : String(Number(material.gstRate)),
    hsnCode: material?.hsnCode ?? "",
  };
}

/**
 * The request for the form. Rate Details and Minimum Stock are only sent
 * when their checkbox is on (`modules/02`); without Financial the rate
 * fields are left out, and the server keeps what it has.
 */
export function materialPayload(
  values: MaterialFormValues,
  financial: boolean,
): MaterialInput {
  const blank = (text: string) => (text.trim() === "" ? null : text.trim());
  const payload: MaterialInput = {
    name: values.name,
    specification: blank(values.specification),
    uomId: values.uomId,
    categoryId: values.categoryId === NO_CATEGORY ? null : values.categoryId,
    itemType: values.itemType,
    minStockQty: values.hasMinStock ? values.minStockQty : null,
  };
  if (!financial) return payload;
  if (!values.hasRate)
    return {
      ...payload,
      unitRate: null,
      discount: null,
      gstRate: null,
      hsnCode: null,
    };
  const discountText = blank(values.discountValue);
  return {
    ...payload,
    unitRate: rupeesToPaise(values.unitRate),
    discount:
      discountText == null
        ? null
        : values.discountType === "amount"
          ? { type: "amount", paise: rupeesToPaise(discountText) ?? 0 }
          : { type: "percent", percent: discountText },
    gstRate: blank(values.gstRate),
    hsnCode: blank(values.hsnCode),
  };
}

const SERVER_FIELDS: Partial<Record<string, keyof MaterialFormValues>> = {
  MATERIAL_NAME_REQUIRED: "name",
  MATERIAL_NAME_TOO_LONG: "name",
  MATERIAL_NAME_IN_USE: "name",
  SPECIFICATION_TOO_LONG: "specification",
  MEASUREMENT_UNIT_REQUIRED: "uomId",
  MEASUREMENT_UNIT_NOT_FOUND: "uomId",
  MEASUREMENT_UNIT_DISABLED: "uomId",
  MATERIAL_CATEGORY_NOT_FOUND: "categoryId",
  MATERIAL_CATEGORY_DISABLED: "categoryId",
  ITEM_TYPE_INVALID: "itemType",
  MIN_STOCK_QTY_INVALID: "minStockQty",
  UNIT_RATE_INVALID: "unitRate",
  DISCOUNT_INVALID: "discountValue",
  GST_RATE_INVALID: "gstRate",
  HSN_CODE_INVALID: "hsnCode",
};

function Field({
  id,
  label,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  error: string | undefined;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      <FieldError message={error} />
    </div>
  );
}

function PickerSelect({
  id,
  items,
  value,
  onChange,
  invalid,
  label,
}: {
  id: string;
  items: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  label: string;
}) {
  return (
    <Select
      items={items}
      value={value === "" ? null : value}
      onValueChange={(next) => {
        if (next != null) onChange(next);
      }}
    >
      <SelectTrigger
        id={id}
        size="lg"
        className="w-full min-w-0"
        aria-invalid={invalid}
      >
        <SelectValue placeholder="Choose…" />
      </SelectTrigger>
      <SelectContent
        align="start"
        alignItemWithTrigger={false}
        aria-label={label}
      >
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** The Material form (CM-501): details, Minimum Stock, Rate Details. */
export function MaterialForm({
  material,
  financial,
  saving,
  onSave,
}: {
  material: MaterialItem | null;
  /** Materials Financial: Rate Details show and are sent. */
  financial: boolean;
  saving: boolean;
  onSave: (payload: MaterialInput) => Promise<unknown>;
}) {
  const router = useRouter();
  const { data: units = [] } = useQuery(unitOptionsQuery);
  const { data: categories = [] } = useQuery(categoryOptionsQuery());
  const form = useForm<MaterialFormValues>({
    resolver: zodResolver(materialFormSchema),
    defaultValues: materialFormDefaults(material),
  });
  const errors = form.formState.errors;
  const [hasMinStock, hasRate, discountType] = useWatch({
    control: form.control,
    name: ["hasMinStock", "hasRate", "discountType"],
  });

  // A unit or category disabled since stays on the Material that has it.
  const unitItems = units.map((unit) => ({ value: unit.id, label: unit.name }));
  if (material != null && !units.some((unit) => unit.id === material.uomId))
    unitItems.push({ value: material.uomId, label: material.uomName });
  const categoryItems = [
    { value: NO_CATEGORY, label: "No category" },
    ...categories.map((category) => ({
      value: category.id,
      label: categoryPath(category),
    })),
  ];
  if (
    material?.categoryId != null &&
    !categories.some((category) => category.id === material.categoryId)
  )
    categoryItems.push({
      value: material.categoryId,
      label: material.categoryName ?? "Current category",
    });
  const typeItems = Object.entries(ITEM_TYPE_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSave(materialPayload(values, financial));
      router.push(MATERIALS_PATH);
    } catch (error) {
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
      form.setError(field ?? "root", { message });
    }
  });

  return (
    <form
      noValidate
      className="space-y-8"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <section aria-labelledby="material-details" className="space-y-4">
        <h2 id="material-details" className="font-semibold">
          Details
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="material-name"
            label="Material name"
            error={errors.name?.message}
          >
            <Input
              id="material-name"
              className="h-10"
              autoComplete="off"
              placeholder="Cement OPC 53"
              aria-invalid={errors.name != null}
              {...form.register("name")}
            />
          </Field>
          <Field
            id="material-item-type"
            label="Item Type"
            error={errors.itemType?.message}
          >
            <Controller
              name="itemType"
              control={form.control}
              render={({ field }) => (
                <PickerSelect
                  id="material-item-type"
                  label="Item Types"
                  items={typeItems}
                  value={field.value}
                  onChange={field.onChange}
                  invalid={errors.itemType != null}
                />
              )}
            />
          </Field>
          <Field
            id="material-unit"
            label="Measurement Unit"
            error={errors.uomId?.message}
          >
            <Controller
              name="uomId"
              control={form.control}
              render={({ field }) => (
                <PickerSelect
                  id="material-unit"
                  label="Measurement Units"
                  items={unitItems}
                  value={field.value}
                  onChange={field.onChange}
                  invalid={errors.uomId != null}
                />
              )}
            />
          </Field>
          <Field
            id="material-category"
            label="Material Category"
            error={errors.categoryId?.message}
          >
            <Controller
              name="categoryId"
              control={form.control}
              render={({ field }) => (
                <PickerSelect
                  id="material-category"
                  label="Material Categories"
                  items={categoryItems}
                  value={field.value}
                  onChange={field.onChange}
                  invalid={errors.categoryId != null}
                />
              )}
            />
          </Field>
          <Field
            id="material-specification"
            label="Specification"
            error={errors.specification?.message}
            className="sm:col-span-2"
          >
            <Textarea
              id="material-specification"
              rows={2}
              placeholder="UltraTech, 50 kg bag"
              aria-invalid={errors.specification != null}
              {...form.register("specification")}
            />
          </Field>
        </div>
      </section>

      <section aria-labelledby="material-min-stock" className="space-y-4">
        <Controller
          name="hasMinStock"
          control={form.control}
          render={({ field }) => (
            <Label className="flex items-center gap-3 font-semibold">
              <Checkbox
                checked={field.value}
                onCheckedChange={(next) => {
                  field.onChange(next);
                }}
              />
              <span id="material-min-stock">Minimum Stock</span>
            </Label>
          )}
        />
        {hasMinStock ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="material-min-qty"
              label="Minimum quantity at each location"
              error={errors.minStockQty?.message}
            >
              <Input
                id="material-min-qty"
                className="h-10"
                inputMode="decimal"
                autoComplete="off"
                placeholder="50"
                aria-invalid={errors.minStockQty != null}
                {...form.register("minStockQty")}
              />
            </Field>
          </div>
        ) : null}
      </section>

      {financial ? (
        <section aria-labelledby="material-rate" className="space-y-4">
          <Controller
            name="hasRate"
            control={form.control}
            render={({ field }) => (
              <Label className="flex items-center gap-3 font-semibold">
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(next) => {
                    field.onChange(next);
                  }}
                />
                <span id="material-rate">Rate Details</span>
              </Label>
            )}
          />
          {hasRate ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="material-unit-rate"
                label="Unit rate"
                error={errors.unitRate?.message}
              >
                <MoneyInput
                  id="material-unit-rate"
                  className="h-10"
                  placeholder="385"
                  aria-invalid={errors.unitRate != null}
                  {...form.register("unitRate")}
                />
              </Field>
              <div className="space-y-1.5">
                <Label htmlFor="material-discount">Discount</Label>
                <div className="flex gap-2">
                  <Controller
                    name="discountType"
                    control={form.control}
                    render={({ field }) => (
                      <ToggleGroup
                        aria-label="Discount type"
                        value={[field.value]}
                        onValueChange={(value: string[]) => {
                          const next = value[0];
                          if (next === "amount" || next === "percent")
                            field.onChange(next);
                        }}
                        variant="outline"
                      >
                        <ToggleGroupItem value="amount">₹</ToggleGroupItem>
                        <ToggleGroupItem value="percent">%</ToggleGroupItem>
                      </ToggleGroup>
                    )}
                  />
                  <Input
                    id="material-discount"
                    className="h-10 min-w-0 flex-1"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={discountType === "amount" ? "10" : "2.5"}
                    aria-invalid={errors.discountValue != null}
                    {...form.register("discountValue")}
                  />
                </div>
                <FieldError message={errors.discountValue?.message} />
              </div>
              <Field
                id="material-gst"
                label="GST rate (%)"
                error={errors.gstRate?.message}
              >
                <Input
                  id="material-gst"
                  className="h-10"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="18"
                  aria-invalid={errors.gstRate != null}
                  {...form.register("gstRate")}
                />
              </Field>
              <Field
                id="material-hsn"
                label="HSN code"
                error={errors.hsnCode?.message}
              >
                <Input
                  id="material-hsn"
                  className="h-10"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={8}
                  placeholder="2523"
                  aria-invalid={errors.hsnCode != null}
                  {...form.register("hsnCode")}
                />
              </Field>
            </div>
          ) : null}
        </section>
      ) : null}

      <FormAlert message={errors.root?.message} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Link
          href={MATERIALS_PATH}
          className={buttonVariants({ variant: "outline" })}
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

function FormPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Materials", href: MATERIALS_PATH }}
          title={title}
        />
        {children}
      </div>
    </div>
  );
}

/** Whether the viewer has Materials Financial, as the list reports it. */
function useMaterialsFinancial(): boolean {
  const { data } = useSuspenseQuery(
    materialMasterListQuery("materials", {
      search: "",
      status: "all",
      cursor: null,
      limit: 1,
    }),
  );
  return data.financial;
}

/** Masters → Materials → Add Material (CM-501). */
export function NewMaterialScreen() {
  const financial = useMaterialsFinancial();
  const create = useCreateMaterial();
  return (
    <FormPage title="Add Material">
      <MaterialForm
        material={null}
        financial={financial}
        saving={create.isPending}
        onSave={(payload) => create.mutateAsync(payload)}
      />
    </FormPage>
  );
}

/** Masters → Materials → Edit; 409 when someone saved it since. */
export function EditMaterialScreen({ id }: { id: string }) {
  const financial = useMaterialsFinancial();
  const { data } = useSuspenseQuery(materialMasterQuery("materials", id));
  const update = useUpdateMaterial(id);
  return (
    <FormPage title={`Edit ${data.name}`}>
      <MaterialForm
        key={data.updatedAt}
        material={data}
        financial={financial}
        saving={update.isPending}
        onSave={(payload) =>
          update.mutateAsync({ ...payload, expectedUpdatedAt: data.updatedAt })
        }
      />
    </FormPage>
  );
}
