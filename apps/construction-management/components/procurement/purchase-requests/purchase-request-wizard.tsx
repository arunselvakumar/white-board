"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type FieldPath,
} from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Switch } from "@repo/ui/components/switch";
import { Textarea } from "@repo/ui/components/textarea";
import { cn } from "@repo/ui/lib/utils";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { localToday } from "@/components/payments/payment-format";
import { LocationPicker } from "@/components/locations/location-picker";
import { MaterialPicker } from "@/components/procurement/material-picker";
import { fieldForCode } from "@/lib/server-errors";
import { materialOptionsQuery } from "@/src/queries/material-options";
import {
  canIn,
  procurementAccessQuery,
} from "@/src/queries/procurement-access";
import { uploadDocumentFile } from "@/src/queries/procurement-documents";
import {
  purchaseRequestQuantityInfoQuery,
  useCreatePurchaseRequest,
  useUpdatePurchaseRequest,
  type PurchaseRequestDetail,
} from "@/src/queries/purchase-requests";
import type { LocationRef } from "@/src/shared-kernel/location-ref";

import { purchaseRequestsPath } from "./purchase-request-actions";
import { quantityText, siteLocationInput } from "./purchase-request-format";

const QUANTITY_RE = /^\d{1,11}(\.\d{1,3})?$/;

const itemSchema = z.object({
  materialId: z.string(),
  materialName: z.string(),
  uomName: z.string(),
  quantity: z
    .string()
    .trim()
    .refine((value) => QUANTITY_RE.test(value) && Number(value) > 0, {
      message: "Enter a quantity more than 0 (at most three decimals)",
    }),
  remark: z.string().max(500, "Use at most 500 characters"),
});

export const purchaseRequestFormSchema = z
  .object({
    items: z.array(itemSchema).min(1, "Pick at least one material"),
    separateRemarks: z.boolean(),
    commonRemark: z.string().max(500, "Use at most 500 characters"),
    requestDate: z.string().min(1, "Enter the Purchase Request Date"),
    requiredDate: z.string(),
    siteLocation: z.custom<LocationRef | null>(),
    remark: z.string().max(500, "Use at most 500 characters"),
  })
  .refine(
    (value) =>
      value.requiredDate === "" || value.requiredDate >= value.requestDate,
    {
      message: "Required Date cannot be before the Purchase Request Date",
      path: ["requiredDate"],
    },
  );

export type PurchaseRequestFormValues = z.infer<
  typeof purchaseRequestFormSchema
>;

const STEPS = ["Materials", "Quantity", "Details"] as const;

const STEP_FIELDS: FieldPath<PurchaseRequestFormValues>[][] = [
  ["items"],
  ["items", "commonRemark"],
  ["requestDate", "requiredDate", "remark"],
];

const SERVER_FIELDS: Partial<
  Record<string, FieldPath<PurchaseRequestFormValues>>
> = {
  REQUEST_DATE_INVALID: "requestDate",
  DATE_IN_FUTURE: "requestDate",
  BACKDATED_CREATE_BLOCKED: "requestDate",
  BACKDATED_EDIT_BLOCKED: "requestDate",
  FINANCIAL_PERIOD_CLOSED: "requestDate",
  REQUIRED_DATE_BEFORE_REQUEST_DATE: "requiredDate",
  MATERIAL_NOT_FOUND: "items",
  MATERIAL_REPEATED: "items",
  QUANTITY_INVALID: "items",
};

export function wizardDefaults(
  today: string,
  pr?: PurchaseRequestDetail,
): PurchaseRequestFormValues {
  if (pr == null)
    return {
      items: [],
      separateRemarks: false,
      commonRemark: "",
      requestDate: today,
      requiredDate: "",
      siteLocation: null,
      remark: "",
    };
  return {
    items: pr.items.map((item) => ({
      materialId: item.materialId,
      materialName: item.materialName,
      uomName: item.uomName,
      quantity: quantityText(item.quantity),
      remark: item.remark ?? "",
    })),
    separateRemarks: pr.separateRemarks,
    commonRemark: pr.commonRemark ?? "",
    requestDate: pr.requestDate,
    requiredDate: pr.requiredDate ?? "",
    siteLocation: pr.siteLocation,
    remark: pr.remark ?? "",
  };
}

function toInput(values: PurchaseRequestFormValues, approve: boolean) {
  return {
    requestDate: values.requestDate,
    requiredDate: values.requiredDate === "" ? null : values.requiredDate,
    siteLocation: siteLocationInput(values.siteLocation),
    remark: values.remark.trim() === "" ? null : values.remark.trim(),
    separateRemarks: values.separateRemarks,
    commonRemark:
      values.separateRemarks || values.commonRemark.trim() === ""
        ? null
        : values.commonRemark.trim(),
    items: values.items.map((item) => ({
      materialId: item.materialId,
      quantity: item.quantity.trim(),
      remark:
        values.separateRemarks && item.remark.trim() !== ""
          ? item.remark.trim()
          : null,
    })),
    approve,
  };
}

/**
 * Add or edit a Purchase Request in three steps (CM-503): **Materials**
 * (pick with Create New, View Selected), **Quantity** (with Available
 * Stock and Balanced estimated qty; one Common Remark or a remark per
 * item), **Details** (date, location, Required Date, remark, the
 * "Upload Required Materials List" attachment). Save, or Save & Approve
 * for approvers. Mode B preloads `initialMaterialIds` from Current
 * Inventory.
 */
export function PurchaseRequestWizard({
  projectId,
  today = localToday(),
  existing,
  initialMaterialIds = [],
}: {
  projectId: string;
  today?: string;
  existing?: PurchaseRequestDetail;
  initialMaterialIds?: readonly string[];
}) {
  const router = useRouter();
  const access = useQuery(procurementAccessQuery(projectId)).data;
  const canApprove =
    access != null && canIn(access, "procurement.purchase_requests", "approve");
  const form = useForm<PurchaseRequestFormValues>({
    resolver: zodResolver(purchaseRequestFormSchema),
    defaultValues: wizardDefaults(today, existing),
    mode: "onTouched",
  });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });
  const items = useWatch({ control: form.control, name: "items" });
  const separateRemarks = useWatch({
    control: form.control,
    name: "separateRemarks",
  });
  const [step, setStep] = useState(0);
  const [viewSelected, setViewSelected] = useState(
    initialMaterialIds.length > 0,
  );
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [noItems, setNoItems] = useState(false);
  const create = useCreatePurchaseRequest();
  const update = useUpdatePurchaseRequest(existing?.id ?? "");
  const busy = create.isPending || update.isPending;

  // Mode B: materials chosen on Current Inventory.
  const preload = useQuery({
    ...materialOptionsQuery({ ids: initialMaterialIds }),
    enabled: existing == null && initialMaterialIds.length > 0,
  });
  const preloaded = useRef(false);
  const preloadIds = initialMaterialIds.join(",");
  useEffect(() => {
    if (existing != null || preloadIds === "") return;
    if (preloaded.current || preload.data == null) return;
    preloaded.current = true;
    // The picker's read can share this cache key: keep only the ids asked for.
    const wanted = new Set(preloadIds.split(","));
    for (const material of preload.data.filter((option) =>
      wanted.has(option.id),
    ))
      append({
        materialId: material.id,
        materialName: material.name,
        uomName: material.uomName,
        quantity: "",
        remark: "",
      });
  }, [append, existing, preload.data, preloadIds]);

  const quantities = useQuery({
    ...purchaseRequestQuantityInfoQuery(
      projectId,
      items.map((item) => item.materialId),
      existing?.id,
    ),
    enabled: step >= 1 && items.length > 0,
  });
  const info = new Map(
    (quantities.data ?? []).map((row) => [row.materialId, row]),
  );

  const next = async () => {
    if (step === 0) {
      if (form.getValues("items").length === 0) {
        setNoItems(true);
        return;
      }
      setNoItems(false);
      setStep(1);
      return;
    }
    const valid = await form.trigger(STEP_FIELDS[step] ?? []);
    if (valid) setStep((current) => Math.min(current + 1, STEPS.length - 1));
  };

  const submit = (approve: boolean) =>
    form.handleSubmit(async (values) => {
      setError(undefined);
      const input = toInput(values, approve);
      try {
        const saved =
          existing == null
            ? await create.mutateAsync({
                projectId,
                source: initialMaterialIds.length > 0 ? "inventory" : "manual",
                ...input,
              })
            : await update.mutateAsync({
                ...input,
                expectedUpdatedAt: existing.updatedAt,
              });
        const failed: string[] = [];
        for (const file of files) {
          try {
            await uploadDocumentFile("purchase_request", saved.id, file);
          } catch {
            failed.push(file.name);
          }
        }
        const path = purchaseRequestsPath(projectId, `/${saved.id}`);
        router.push(
          failed.length > 0
            ? `${path}?uploadFailed=${String(failed.length)}`
            : path,
        );
      } catch (failure) {
        const { field, message } = fieldForCode(failure, SERVER_FIELDS);
        if (field != null) {
          form.setError(field, { message });
          const back = STEP_FIELDS.findIndex((fieldsOfStep) =>
            fieldsOfStep.includes(field),
          );
          if (back >= 0) setStep(back);
        } else setError(message);
      }
    })();

  const errors = form.formState.errors;
  const itemsError =
    (noItems ? "Pick at least one material" : undefined) ??
    errors.items?.message ??
    errors.items?.root?.message;

  return (
    <form
      className="w-full max-w-4xl space-y-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <ol aria-label="Steps" className="flex gap-2">
        {STEPS.map((label, index) => (
          <li
            key={label}
            aria-current={index === step ? "step" : undefined}
            className={cn(
              "flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-sm",
              index === step
                ? "border-primary bg-primary/5 font-medium"
                : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-xs",
                index <= step
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted",
              )}
            >
              {index + 1}
            </span>
            <span className="truncate">{label}</span>
          </li>
        ))}
      </ol>
      <FormAlert message={error} />

      {step === 0 && (
        <section aria-label="Materials" className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pr-material-picker">Add a material</Label>
            <MaterialPicker
              id="pr-material-picker"
              value={null}
              allowCreate
              excludeIds={items.map((item) => item.materialId)}
              invalid={itemsError != null}
              onChange={(material) => {
                if (material == null) return;
                append({
                  materialId: material.id,
                  materialName: material.name,
                  uomName: material.uomName,
                  quantity: "",
                  remark: "",
                });
                setNoItems(false);
                form.clearErrors("items");
              }}
            />
            <FieldError message={itemsError} />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={viewSelected}
            disabled={fields.length === 0}
            onClick={() => {
              setViewSelected((current) => !current);
            }}
          >
            View Selected ({fields.length})
          </Button>
          {viewSelected && fields.length > 0 && (
            <ul
              aria-label="Selected materials"
              className="divide-y rounded-lg border"
            >
              {fields.map((field, index) => (
                <li
                  key={field.id}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <span className="min-w-0 truncate text-sm">
                    {field.materialName}{" "}
                    <span className="text-muted-foreground">
                      ({field.uomName})
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${field.materialName}`}
                    onClick={() => {
                      remove(index);
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {step === 1 && (
        <section aria-label="Quantity" className="space-y-4">
          <ul className="space-y-3">
            {fields.map((field, index) => {
              const row = info.get(field.materialId);
              const quantityError = errors.items?.[index]?.quantity?.message;
              return (
                <li key={field.id} className="space-y-2 rounded-lg border p-3">
                  <div className="grid gap-3 sm:grid-cols-[1fr_12rem] sm:items-start">
                    <div className="min-w-0">
                      <p className="font-medium">{field.materialName}</p>
                      <p
                        className="text-muted-foreground text-xs"
                        data-testid={`stock-${field.materialId}`}
                      >
                        {row == null ? (
                          quantities.isLoading ? (
                            "Loading stock…"
                          ) : (
                            "Stock not known"
                          )
                        ) : (
                          <>
                            Available Stock: {quantityText(row.availableStock)}{" "}
                            {field.uomName}
                            {" · "}Balanced estimated qty:{" "}
                            {row.balancedEstimatedQty == null
                              ? "no estimate"
                              : `${quantityText(row.balancedEstimatedQty)} ${field.uomName}`}
                          </>
                        )}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <Label
                        htmlFor={`pr-qty-${String(index)}`}
                        className="text-xs"
                      >
                        Quantity ({field.uomName})
                      </Label>
                      <Input
                        id={`pr-qty-${String(index)}`}
                        inputMode="decimal"
                        aria-label={`Quantity of ${field.materialName}`}
                        aria-invalid={quantityError != null}
                        {...form.register(`items.${index}.quantity`)}
                      />
                      <FieldError message={quantityError} />
                    </div>
                  </div>
                  {separateRemarks && (
                    <div className="space-y-1">
                      <Label
                        htmlFor={`pr-remark-${String(index)}`}
                        className="text-xs"
                      >
                        Remark
                      </Label>
                      <Input
                        id={`pr-remark-${String(index)}`}
                        aria-label={`Remark for ${field.materialName}`}
                        maxLength={500}
                        {...form.register(`items.${index}.remark`)}
                      />
                      <FieldError
                        message={errors.items?.[index]?.remark?.message}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <Controller
              name="separateRemarks"
              control={form.control}
              render={({ field }) => (
                <Switch
                  id="pr-separate-remarks"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Label htmlFor="pr-separate-remarks">
              Separate remark for each item
            </Label>
          </div>
          {!separateRemarks && (
            <div className="space-y-1.5">
              <Label htmlFor="pr-common-remark">Common Remark</Label>
              <Textarea
                id="pr-common-remark"
                maxLength={500}
                aria-invalid={errors.commonRemark != null}
                {...form.register("commonRemark")}
              />
              <FieldError message={errors.commonRemark?.message} />
            </div>
          )}
        </section>
      )}

      {step === 2 && (
        <section aria-label="Details" className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pr-request-date">Purchase Request Date</Label>
            <Input
              id="pr-request-date"
              type="date"
              max={today}
              aria-invalid={errors.requestDate != null}
              {...form.register("requestDate")}
            />
            <FieldError message={errors.requestDate?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-required-date">Required Date</Label>
            <Input
              id="pr-required-date"
              type="date"
              aria-invalid={errors.requiredDate != null}
              {...form.register("requiredDate")}
            />
            <FieldError message={errors.requiredDate?.message} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
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
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="pr-remark">Remark</Label>
            <Textarea
              id="pr-remark"
              maxLength={500}
              {...form.register("remark")}
            />
            <FieldError message={errors.remark?.message} />
          </div>
          {existing == null ? (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="pr-files">Upload Required Materials List</Label>
              <Input
                id="pr-files"
                type="file"
                multiple
                onChange={(event) => {
                  setFiles([...(event.target.files ?? [])]);
                }}
              />
              {files.length > 0 && (
                <p className="text-muted-foreground text-xs">
                  {files.map((file) => file.name).join(", ")}
                </p>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm sm:col-span-2">
              Add or remove the Required Materials List on the request&rsquo;s
              page.
            </p>
          )}
        </section>
      )}

      <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (step === 0) router.back();
            else setStep((current) => current - 1);
          }}
        >
          {step === 0 ? "Cancel" : "Back"}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button
            type="button"
            onClick={() => {
              void next();
            }}
          >
            Next
          </Button>
        ) : (
          <div className="flex flex-wrap gap-2">
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
        )}
      </div>
    </form>
  );
}
