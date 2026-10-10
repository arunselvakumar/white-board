"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Component, Suspense, type ReactNode } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button, buttonVariants } from "@repo/ui/components/button";
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

import { PageHeader } from "@/components/app-shell/page-header";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { LocationPicker } from "@/components/locations/location-picker";
import { MaterialPicker } from "@/components/procurement/material-picker";
import { projectRequestHref } from "@/components/procurement/stores/central-store-parts";
import { fieldForCode } from "@/lib/server-errors";
import {
  materialRequestFormOptionsQuery,
  useCreateMaterialRequest,
  useUpdateMaterialRequest,
  type MaterialRequest,
  type MaterialRequestInput,
} from "@/src/queries/material-requests";
import type { LocationRef } from "@/src/shared-kernel/location-ref";

const NONE = "none";
const QUANTITY = /^\d{1,11}(\.\d{1,3})?$/;

const lineSchema = z.object({
  materialId: z.string().min(1, "Choose a material."),
  uomName: z.string(),
  askQty: z
    .string()
    .trim()
    .regex(QUANTITY, "Enter a quantity with at most 3 decimals.")
    .refine((value) => Number(value) > 0, "Ask Qty must be more than 0."),
  remark: z.string().max(500, "Use at most 500 characters."),
});

const schema = z.object({
  requestDate: z.iso.date("Choose the request date."),
  storeId: z.string().min(1, "Choose the store to ask."),
  contractorId: z.string(),
  departmentId: z.string(),
  siteLocation: z.custom<LocationRef | null>(),
  receiverName: z.string().max(200, "Use at most 200 characters."),
  remark: z.string().max(500, "Use at most 500 characters."),
  items: z.array(lineSchema).min(1, "Add at least one material."),
});

type Values = z.infer<typeof schema>;

const SERVER_FIELDS = {
  STORE_NOT_FOUND: "storeId",
  STORE_NOT_ON_PROJECT: "storeId",
  CONTRACTOR_NOT_FOUND: "contractorId",
  CONTRACTOR_INACTIVE: "contractorId",
  CONTRACTOR_NOT_ON_PROJECT: "contractorId",
  DEPARTMENT_NOT_FOUND: "departmentId",
  DEPARTMENT_DISABLED: "departmentId",
  DATE_IN_FUTURE: "requestDate",
  BACKDATED_CREATE_BLOCKED: "requestDate",
  BACKDATED_EDIT_BLOCKED: "requestDate",
  FINANCIAL_PERIOD_CLOSED: "requestDate",
  MATERIAL_REQUEST_ITEMS_REQUIRED: "items",
} as const;

function today(): string {
  return new Date().toLocaleDateString("en-CA");
}

/** Hides the location field when the Project's locations cannot be read. */
class QuietBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

function OptionSelect({
  id,
  label,
  value,
  onChange,
  items,
  invalid,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: { value: string; label: string }[];
  invalid?: boolean;
}) {
  return (
    <Select
      items={items}
      value={value}
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
        <SelectValue />
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

/**
 * Raise / Edit Material Request (CM-508): the Project asks a store that
 * serves it — request date, Request To, contractor, department, site
 * location, receiver, remark and the materials with their Ask Qty.
 */
export function MaterialRequestForm({
  projectId,
  request,
}: {
  projectId: string;
  request?: MaterialRequest;
}) {
  const router = useRouter();
  const { data: options } = useSuspenseQuery(
    materialRequestFormOptionsQuery(projectId),
  );
  const create = useCreateMaterialRequest(projectId);
  const update = useUpdateMaterialRequest(request?.id ?? "");
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      requestDate: request?.requestDate ?? today(),
      storeId:
        request?.storeId ??
        (options.stores.length === 1 ? (options.stores[0]?.id ?? "") : ""),
      contractorId: request?.contractor?.id ?? NONE,
      departmentId: request?.department?.id ?? NONE,
      siteLocation: (request?.siteLocation as LocationRef | null) ?? null,
      receiverName: request?.receiverName ?? "",
      remark: request?.remark ?? "",
      items: request?.items.map((item) => ({
        materialId: item.materialId,
        uomName: item.uomName,
        askQty: item.askQty.replace(/\.?0+$/, ""),
        remark: item.remark ?? "",
      })) ?? [{ materialId: "", uomName: "", askQty: "", remark: "" }],
    },
  });
  const lines = useFieldArray({ control: form.control, name: "items" });
  const errors = form.formState.errors;
  const watched = useWatch({ control: form.control, name: "items" });
  const chosen = watched.map((item) => item.materialId);

  const storeItems = [
    ...(options.stores.length === 1
      ? []
      : [{ value: "", label: "Choose a store" }]),
    ...options.stores.map((store) => ({ value: store.id, label: store.name })),
  ];
  const withNone = (
    list: { id: string; name: string }[],
    kept?: { id: string; name: string } | null,
  ) => [
    { value: NONE, label: "None" },
    ...list.map((item) => ({ value: item.id, label: item.name })),
    ...(kept != null && !list.some((item) => item.id === kept.id)
      ? [{ value: kept.id, label: kept.name }]
      : []),
  ];

  const submit = async (values: Values) => {
    const input: MaterialRequestInput = {
      requestDate: values.requestDate,
      storeId: values.storeId,
      contractorId: values.contractorId === NONE ? null : values.contractorId,
      departmentId: values.departmentId === NONE ? null : values.departmentId,
      siteLocation: values.siteLocation,
      receiverName:
        values.receiverName.trim() === "" ? null : values.receiverName,
      remark: values.remark.trim() === "" ? null : values.remark,
      items: values.items.map((item) => ({
        materialId: item.materialId,
        askQty: item.askQty.trim(),
        remark: item.remark.trim() === "" ? null : item.remark,
      })),
    };
    try {
      const saved =
        request == null
          ? await create.mutateAsync(input)
          : await update.mutateAsync({
              ...input,
              expectedUpdatedAt: request.updatedAt,
            });
      router.push(projectRequestHref.detail(projectId, saved.id));
    } catch (error) {
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
      form.setError(field ?? "root", { message });
    }
  };

  const back =
    request == null
      ? { label: "Material Requests", href: projectRequestHref.list(projectId) }
      : {
          label: request.number,
          href: projectRequestHref.detail(projectId, request.id),
        };

  if (options.stores.length === 0)
    return (
      <div className="w-full space-y-4">
        <PageHeader back={back} title="Raise Material Request" />
        <FormAlert message="No Central Store serves this Project yet. Ask the Owner to assign one under Workspace → Central Store." />
      </div>
    );

  return (
    <div className="w-full">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={back}
          title={
            request == null
              ? "Raise Material Request"
              : `Edit ${request.number}`
          }
        />
        <form
          noValidate
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit(submit)(event);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mr-date">Request Date</Label>
              <Input
                id="mr-date"
                type="date"
                className="h-10"
                max={today()}
                aria-invalid={errors.requestDate != null}
                {...form.register("requestDate")}
              />
              <FieldError message={errors.requestDate?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mr-store">Request To</Label>
              <Controller
                name="storeId"
                control={form.control}
                render={({ field }) => (
                  <OptionSelect
                    id="mr-store"
                    label="Stores"
                    value={field.value}
                    onChange={field.onChange}
                    items={storeItems}
                    invalid={errors.storeId != null}
                  />
                )}
              />
              <FieldError message={errors.storeId?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mr-contractor">Contractor</Label>
              <Controller
                name="contractorId"
                control={form.control}
                render={({ field }) => (
                  <OptionSelect
                    id="mr-contractor"
                    label="Contractors"
                    value={field.value}
                    onChange={field.onChange}
                    items={withNone(options.contractors, request?.contractor)}
                    invalid={errors.contractorId != null}
                  />
                )}
              />
              <FieldError message={errors.contractorId?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mr-department">Department</Label>
              <Controller
                name="departmentId"
                control={form.control}
                render={({ field }) => (
                  <OptionSelect
                    id="mr-department"
                    label="Departments"
                    value={field.value}
                    onChange={field.onChange}
                    items={withNone(options.departments, request?.department)}
                    invalid={errors.departmentId != null}
                  />
                )}
              />
              <FieldError message={errors.departmentId?.message} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <QuietBoundary>
                <Suspense fallback={null}>
                  <Controller
                    name="siteLocation"
                    control={form.control}
                    render={({ field }) => (
                      <LocationPicker
                        projectId={projectId}
                        value={field.value}
                        onChange={field.onChange}
                        label="Site location"
                      />
                    )}
                  />
                </Suspense>
              </QuietBoundary>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mr-receiver">Receiver Name</Label>
              <Input
                id="mr-receiver"
                className="h-10"
                autoComplete="off"
                aria-invalid={errors.receiverName != null}
                {...form.register("receiverName")}
              />
              <FieldError message={errors.receiverName?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mr-remark">Remark</Label>
              <Textarea id="mr-remark" rows={1} {...form.register("remark")} />
              <FieldError message={errors.remark?.message} />
            </div>
          </div>

          <section className="space-y-3">
            <h2 className="font-semibold">Materials</h2>
            <ul aria-label="Materials" className="space-y-3">
              {lines.fields.map((line, index) => {
                const lineErrors = errors.items?.[index];
                return (
                  <li
                    key={line.id}
                    className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.5fr)_auto] sm:items-start"
                  >
                    <div className="min-w-0 space-y-1.5">
                      <Label htmlFor={`mr-material-${String(index)}`}>
                        Material
                      </Label>
                      <Controller
                        name={`items.${index}.materialId`}
                        control={form.control}
                        render={({ field }) => (
                          <MaterialPicker
                            id={`mr-material-${String(index)}`}
                            value={field.value === "" ? null : field.value}
                            excludeIds={chosen.filter(
                              (id) => id !== field.value,
                            )}
                            invalid={lineErrors?.materialId != null}
                            onChange={(material) => {
                              field.onChange(material?.id ?? "");
                              form.setValue(
                                `items.${index}.uomName`,
                                material?.uomName ?? "",
                              );
                            }}
                          />
                        )}
                      />
                      <FieldError message={lineErrors?.materialId?.message} />
                    </div>
                    <div className="min-w-0 space-y-1.5">
                      <Label htmlFor={`mr-qty-${String(index)}`}>
                        Ask Qty
                        {(watched[index]?.uomName ?? "") === ""
                          ? ""
                          : ` (${watched[index]?.uomName ?? ""})`}
                      </Label>
                      <Input
                        id={`mr-qty-${String(index)}`}
                        inputMode="decimal"
                        className="h-10"
                        aria-invalid={lineErrors?.askQty != null}
                        {...form.register(`items.${index}.askQty`)}
                      />
                      <FieldError message={lineErrors?.askQty?.message} />
                    </div>
                    <div className="min-w-0 space-y-1.5">
                      <Label htmlFor={`mr-line-remark-${String(index)}`}>
                        Remark
                      </Label>
                      <Input
                        id={`mr-line-remark-${String(index)}`}
                        className="h-10"
                        {...form.register(`items.${index}.remark`)}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="sm:mt-6"
                      aria-label={`Remove material ${String(index + 1)}`}
                      disabled={lines.fields.length === 1}
                      onClick={() => {
                        lines.remove(index);
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                );
              })}
            </ul>
            <FieldError
              message={errors.items?.message ?? errors.items?.root?.message}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                lines.append({
                  materialId: "",
                  uomName: "",
                  askQty: "",
                  remark: "",
                });
              }}
            >
              <Plus aria-hidden="true" />
              Add material
            </Button>
          </section>

          <FormAlert message={errors.root?.message} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting
                ? "Saving…"
                : request == null
                  ? "Raise request"
                  : "Save"}
            </Button>
            <Link
              href={back.href}
              className={buttonVariants({ variant: "outline" })}
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
