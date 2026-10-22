"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Copy, MapPin, Plus, Trash2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type FieldPath,
} from "react-hook-form";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
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
import { cn } from "@repo/ui/lib/utils";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import {
  LocationLabel,
  LocationPicker,
} from "@/components/locations/location-picker";
import { LocationPickerSkeleton } from "@/components/locations/locations-skeletons";
import { fieldForCode } from "@/lib/server-errors";
import { quantityText } from "@/src/contracts/domain/boq";
import type { Side } from "@/src/contracts/domain/contract-terms";
import {
  fixedDecimal,
  PERCENT_SCALE,
  scaledDecimal,
} from "@/src/contracts/domain/item-analysis";
import { measurementNumber } from "@/src/contracts/domain/measurement";
import {
  measurementFormOptionsQuery,
  measurementQuantitiesQuery,
  measurementsPath,
  useCreateMeasurement,
  useUpdateMeasurement,
  type MeasurementFormOptions,
  type MeasurementSheet,
} from "@/src/queries/contracts-measurements";
import { QueryHttpError } from "@/src/queries/http";
import type { LocationRef } from "@/src/shared-kernel/location-ref";

import { ResourcePicker, type PickerOption } from "../items/resource-picker";
import {
  MeasurementCumulative,
  type CumulativeItem,
} from "./measurement-cumulative";
import {
  blankRow,
  duplicateRow,
  liveMeasured,
  measurementBody,
  measurementSchema,
  measurementValues,
  newMeasurementValues,
  rowQuantity,
  type MeasurementValues,
} from "./measurement-form-schema";
import { quantity } from "./measurement-format";

/** The Company's day in the browser, `YYYY-MM-DD`. */
export function localToday(): string {
  return new Date().toLocaleDateString("en-CA");
}

type ItemOption = PickerOption & {
  itemNo: string | null;
  description: string;
  uomName: string;
  quantity: string;
};

/** Error paths the API names (`details.field`) that the form shows under a field. */
function formPath(field: string): FieldPath<MeasurementValues> | null {
  if (/^(workOrderId|measuredOn|title|remarks)$/.test(field))
    return field as FieldPath<MeasurementValues>;
  const row = /^rows\.(\d+)\.(\w+)/.exec(field);
  if (row == null) return null;
  const [, index = "0", name = ""] = row;
  const mapped =
    name === "boqItemId" || name === "workOrderLineId" ? "itemId" : name;
  if (
    /^(itemId|description|location|nos|length|breadth|depth|quantity)$/.test(
      mapped,
    )
  )
    return `rows.${index}.${mapped}` as FieldPath<MeasurementValues>;
  return null;
}

const NUMBERS = [
  { name: "nos", label: "Nos", placeholder: "1" },
  { name: "length", label: "L", placeholder: "—" },
  { name: "breadth", label: "B", placeholder: "—" },
  { name: "depth", label: "D / H", placeholder: "—" },
] as const;

const NUMBER_WORDS: Record<(typeof NUMBERS)[number]["name"], string> = {
  nos: "nos",
  length: "length",
  breadth: "breadth",
  depth: "depth or height",
};

/** The grid of one row from md up; below md a row is a card. */
const ROW_GRID =
  "md:grid md:grid-cols-[minmax(11rem,2fr)_minmax(9rem,1.6fr)_repeat(4,5.25rem)_7.5rem_auto] md:items-start md:gap-2";

/**
 * A measurement sheet's form (CM-1105): the header (side and Work Order,
 * date measured, title, remarks) and the rows, each naming an item of the
 * side with nos × L × B × D/H (any dimension blank, nos 1 when blank,
 * negative nos for a deduction) or a direct quantity. Each row's quantity
 * is worked out as you type, and the panel below adds it to what checked
 * sheets measured, marking deviation (client) or over-quantity
 * (contractor). Below md each row is a card with its numbers in a 2×2
 * grid.
 */
export function MeasurementForm({
  projectId,
  side,
  sheet,
  today = localToday(),
  onSaved,
  onSubmitForChecking,
  submitting = false,
}: {
  projectId: string;
  side: Side;
  sheet: MeasurementSheet | null;
  today?: string;
  onSaved?: (saved: MeasurementSheet) => void;
  /**
   * A draft's "Submit for checking": called with the `updatedAt` of the
   * sheet as saved. With unsaved changes the form saves them first and
   * calls it only when that save succeeds, so stale rows are never
   * submitted.
   */
  onSubmitForChecking?: (expectedUpdatedAt: string) => void;
  submitting?: boolean;
}) {
  const router = useRouter();
  const { data: options } = useSuspenseQuery(
    measurementFormOptionsQuery(projectId),
  );
  const schema = useMemo(() => measurementSchema(side), [side]);
  const {
    control,
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isDirty },
  } = useForm<MeasurementValues>({
    resolver: zodResolver(schema),
    defaultValues:
      sheet == null ? newMeasurementValues(today) : measurementValues(sheet),
  });
  const { fields, append, insert, remove } = useFieldArray({
    control,
    name: "rows",
  });
  const rows = useWatch({ control, name: "rows" });
  const workOrderId = useWatch({ control, name: "workOrderId" });
  const create = useCreateMeasurement();
  const update = useUpdateMeasurement(sheet?.id ?? "");
  const [failure, setFailure] = useState<string | undefined>();
  const [placing, setPlacing] = useState<number | null>(null);
  const pending = create.isPending || update.isPending;

  const items = useMemo(
    () => itemOptions(options, side, workOrderId, sheet),
    [options, side, workOrderId, sheet],
  );
  const itemById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );
  const enabled = side === "client" || workOrderId !== "";
  // The contractor side's quantities need the Work Order: no request before.
  const measured = useQuery({
    ...measurementQuantitiesQuery(
      projectId,
      side,
      side === "contractor" && workOrderId !== "" ? workOrderId : null,
    ),
    enabled,
  }).data;
  const planned = new Map(
    items.map((item) => [item.id, measurementNumber(item.quantity) ?? 0n]),
  );
  const checked = new Map(
    (enabled ? (measured?.items ?? []) : []).map((item) => [
      item.id,
      measurementNumber(item.checked) ?? 0n,
    ]),
  );
  const limit =
    side === "client" && measured?.deviationLimitPercent != null
      ? scaledDecimal(measured.deviationLimitPercent, 2)
      : null;
  const live = liveMeasured(rows, planned, checked, limit);
  const cumulative: CumulativeItem[] = live.items.map((item) => {
    const facts = itemById.get(item.itemId);
    return {
      itemId: item.itemId,
      itemNo: facts?.itemNo ?? null,
      description: facts?.description ?? "",
      uomName: facts?.uomName ?? "",
      planned: quantityText(item.planned),
      checked: quantityText(item.checked),
      thisSheet: quantityText(item.thisSheet),
      total: quantityText(item.total),
      over: item.over,
      overLimit: item.overLimit,
      percentOver:
        item.percentOver == null
          ? null
          : fixedDecimal(item.percentOver, PERCENT_SCALE),
    };
  });
  const workOrders = options.workOrders.map((order) => ({
    value: order.id,
    label: `${order.number} · ${order.contractorName}`,
  }));
  if (
    sheet?.workOrderId != null &&
    !workOrders.some((order) => order.value === sheet.workOrderId)
  )
    workOrders.push({
      value: sheet.workOrderId,
      label: sheet.workOrderNumber ?? "Work Order",
    });

  /** Shows a server error under its field (true) or above the buttons (false). */
  const failed = (error: unknown): boolean => {
    if (error instanceof QueryHttpError) {
      const details = error.details as { field?: unknown } | undefined;
      const field =
        typeof details?.field === "string" ? formPath(details.field) : null;
      if (field != null) {
        setError(field, { message: error.message }, { shouldFocus: true });
        setFailure(undefined);
        return true;
      }
    }
    setFailure(fieldForCode(error, {}).message);
    return false;
  };

  const done = (saved: MeasurementSheet) => {
    if (onSaved != null) onSaved(saved);
    else router.push(measurementsPath(projectId, saved.id));
  };

  const submit = (values: MeasurementValues) => {
    setFailure(undefined);
    const body = measurementBody(side, values);
    if (sheet == null) {
      create.mutate(
        {
          projectId,
          side,
          workOrderId: side === "contractor" ? values.workOrderId : null,
          ...body,
        },
        { onSuccess: done, onError: failed },
      );
      return;
    }
    update.mutate(
      { ...body, expectedUpdatedAt: sheet.updatedAt },
      { onSuccess: done, onError: failed },
    );
  };

  /** Saves unsaved changes first (stopping if that fails), then submits. */
  const submitForChecking = (values: MeasurementValues) => {
    if (sheet == null || onSubmitForChecking == null) return;
    setFailure(undefined);
    if (!isDirty) {
      onSubmitForChecking(sheet.updatedAt);
      return;
    }
    // `mutateAsync`, not `mutate`'s callbacks: the save reloads the sheet,
    // which starts this form again, and the submit must still follow.
    update
      .mutateAsync({
        ...measurementBody(side, values),
        expectedUpdatedAt: sheet.updatedAt,
      })
      .then(
        (saved) => {
          onSubmitForChecking(saved.updatedAt);
        },
        (error: unknown) => {
          failed(error);
        },
      );
  };

  const placingRow = placing == null ? null : rows[placing];

  return (
    <form
      noValidate
      aria-label="Measurement sheet"
      className="flex w-full max-w-6xl min-w-0 flex-col gap-4"
      onSubmit={(event) => {
        void handleSubmit(submit)(event);
      }}
    >
      <section
        aria-labelledby="measurement-header"
        className="grid min-w-0 gap-4 rounded-xl border p-4 sm:grid-cols-2"
      >
        <h3 id="measurement-header" className="font-semibold sm:col-span-2">
          {side === "client"
            ? `Client side${options.clientName == null ? "" : ` · ${options.clientName}`}`
            : "Contractor side"}
        </h3>
        {side === "client" && options.role === "own" ? (
          <p className="text-muted-foreground text-sm sm:col-span-2">
            On Own development the BOQ is your budget: measuring it tracks
            progress, and it is never billed.
          </p>
        ) : null}
        {side === "contractor" ? (
          <div className="min-w-0 space-y-1.5 sm:col-span-2">
            <Label htmlFor="measurement-work-order">Work Order</Label>
            <Controller
              control={control}
              name="workOrderId"
              render={({ field }) => (
                <Select
                  items={workOrders}
                  value={field.value === "" ? null : field.value}
                  disabled={sheet != null}
                  onValueChange={(value) => {
                    if (value == null) return;
                    field.onChange(value);
                    // Lines belong to one Work Order: start the rows again.
                    setValue("rows", [blankRow()]);
                  }}
                >
                  <SelectTrigger
                    id="measurement-work-order"
                    className="w-full min-w-0"
                    aria-invalid={errors.workOrderId != null}
                  >
                    <SelectValue placeholder="Pick an issued Work Order" />
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    {workOrders.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {workOrders.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                No Work Order on this Project is issued yet. Only issued Work
                Orders are measured.
              </p>
            ) : null}
            <FieldError message={errors.workOrderId?.message} />
          </div>
        ) : null}
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="measurement-measured-on">Measured on</Label>
          <Input
            id="measurement-measured-on"
            type="date"
            max={today}
            aria-invalid={errors.measuredOn != null}
            {...register("measuredOn")}
          />
          <FieldError message={errors.measuredOn?.message} />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="measurement-title">Title</Label>
          <Input
            id="measurement-title"
            placeholder="Footings F1–F4"
            aria-invalid={errors.title != null}
            {...register("title")}
          />
          <FieldError message={errors.title?.message} />
        </div>
        <div className="min-w-0 space-y-1.5 sm:col-span-2">
          <Label htmlFor="measurement-remarks">Remarks</Label>
          <Textarea
            id="measurement-remarks"
            rows={2}
            aria-invalid={errors.remarks != null}
            {...register("remarks")}
          />
          <FieldError message={errors.remarks?.message} />
        </div>
      </section>

      <section
        aria-labelledby="measurement-rows"
        className="min-w-0 space-y-3 rounded-xl border p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <h3 id="measurement-rows" className="font-semibold">
              Rows
            </h3>
            <p className="text-muted-foreground text-xs">
              Quantity = nos × L × B × D/H over the filled numbers; a blank nos
              is 1. A negative nos is a deduction (an opening).
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!enabled}
            onClick={() => {
              append(blankRow());
            }}
          >
            <Plus aria-hidden="true" />
            Add row
          </Button>
        </div>
        <div
          aria-hidden="true"
          className={cn(
            "text-muted-foreground hidden border-b pb-1 text-xs font-medium",
            ROW_GRID,
          )}
        >
          <span>Item</span>
          <span>Description · location</span>
          {NUMBERS.map((number) => (
            <span key={number.name} className="text-right">
              {number.label}
            </span>
          ))}
          <span className="text-right">Quantity</span>
          <span className="sr-only">Actions</span>
        </div>
        <ol aria-label="Rows" className="space-y-3 md:space-y-2">
          {fields.map((field, index) => {
            const row = rows[index] ?? field;
            const n = String(index + 1);
            const rowErrors = errors.rows?.[index];
            const computed = rowQuantity(row);
            const item = itemById.get(row.itemId);
            const over = live.over.has(index);
            return (
              <li
                key={field.key}
                aria-label={`Row ${n}`}
                className={cn(
                  "min-w-0 space-y-3 rounded-lg border p-3 md:space-y-0 md:rounded-none md:border-0 md:p-0",
                  ROW_GRID,
                )}
              >
                <div className="min-w-0 space-y-1">
                  <Label
                    htmlFor={`measurement-row-${n}-item`}
                    className="text-xs md:sr-only"
                  >
                    {side === "client" ? "BOQ item" : "Work Order line"}
                  </Label>
                  <Controller
                    control={control}
                    name={`rows.${index}.itemId`}
                    render={({ field: itemField }) => (
                      <ResourcePicker<ItemOption>
                        id={`measurement-row-${n}-item`}
                        label={`Row ${n} item`}
                        noun={side === "client" ? "BOQ items" : "lines"}
                        placeholder={
                          enabled
                            ? side === "client"
                              ? "Pick a BOQ item"
                              : "Pick a line"
                            : "Pick the Work Order first"
                        }
                        options={items}
                        value={itemById.get(itemField.value) ?? null}
                        invalid={rowErrors?.itemId != null}
                        inputRef={itemField.ref}
                        onChange={(option) => {
                          itemField.onChange(option?.id ?? "");
                        }}
                      />
                    )}
                  />
                </div>
                <div className="min-w-0 space-y-1">
                  <Label
                    htmlFor={`measurement-row-${n}-description`}
                    className="text-xs md:sr-only"
                  >
                    Description
                  </Label>
                  <Input
                    id={`measurement-row-${n}-description`}
                    aria-label={`Row ${n} description`}
                    placeholder="Footing F1"
                    {...register(`rows.${index}.description`)}
                  />
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto max-w-full justify-start px-0 text-xs"
                    aria-label={`Row ${n} location`}
                    onClick={() => {
                      setPlacing(index);
                    }}
                  >
                    <MapPin aria-hidden="true" />
                    {row.location == null ? (
                      "Add location"
                    ) : (
                      <Suspense fallback="Location">
                        <LocationLabel
                          projectId={projectId}
                          value={row.location}
                          className="truncate"
                        />
                      </Suspense>
                    )}
                  </Button>
                </div>
                {row.direct ? (
                  <div className="min-w-0 space-y-1 md:col-span-4">
                    <Label
                      htmlFor={`measurement-row-${n}-quantity`}
                      className="text-xs"
                    >
                      Direct quantity
                    </Label>
                    <Input
                      id={`measurement-row-${n}-quantity`}
                      aria-label={`Row ${n} direct quantity`}
                      inputMode="decimal"
                      className="text-right tabular-nums"
                      aria-invalid={rowErrors?.quantity != null}
                      {...register(`rows.${index}.quantity`)}
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 md:contents">
                    {NUMBERS.map((number) => (
                      <div key={number.name} className="min-w-0 space-y-1">
                        <Label
                          htmlFor={`measurement-row-${n}-${number.name}`}
                          className="text-xs md:sr-only"
                        >
                          {number.label}
                        </Label>
                        <Input
                          id={`measurement-row-${n}-${number.name}`}
                          aria-label={`Row ${n} ${NUMBER_WORDS[number.name]}`}
                          inputMode="decimal"
                          placeholder={number.placeholder}
                          className="text-right tabular-nums"
                          aria-invalid={rowErrors?.[number.name] != null}
                          {...register(`rows.${index}.${number.name}`)}
                        />
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex min-w-0 items-center justify-between gap-2 md:flex-col md:items-end md:justify-start md:pt-1.5">
                  <output
                    aria-label={`Row ${n} quantity`}
                    className={cn(
                      "text-sm font-medium tabular-nums",
                      computed != null && computed < 0n && "text-destructive",
                    )}
                  >
                    {computed == null
                      ? "—"
                      : `${quantity(quantityText(computed))}${item == null ? "" : ` ${item.uomName}`}`}
                  </output>
                  {over ? (
                    <Badge variant="destructive">
                      <TriangleAlert aria-hidden="true" />
                      {side === "client" ? "Deviation" : "Over WO"}
                    </Badge>
                  ) : computed != null && computed < 0n ? (
                    <Badge variant="outline">Deduction</Badge>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-1 md:flex-nowrap md:pt-0.5">
                  <Controller
                    control={control}
                    name={`rows.${index}.direct`}
                    render={({ field: directField }) => (
                      <Label className="text-muted-foreground mr-1 flex items-center gap-1.5 text-xs font-normal whitespace-nowrap">
                        <Checkbox
                          aria-label={`Row ${n} direct quantity entry`}
                          checked={directField.value}
                          onCheckedChange={(checked) => {
                            directField.onChange(checked);
                          }}
                        />
                        Direct
                      </Label>
                    )}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Duplicate row ${n}`}
                    onClick={() => {
                      insert(index + 1, duplicateRow(row));
                    }}
                  >
                    <Copy aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove row ${n}`}
                    onClick={() => {
                      remove(index);
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
                {rowErrors == null ? null : (
                  <div className="md:col-span-full">
                    <FieldError
                      message={
                        rowErrors.itemId?.message ??
                        rowErrors.nos?.message ??
                        rowErrors.length?.message ??
                        rowErrors.breadth?.message ??
                        rowErrors.depth?.message ??
                        rowErrors.quantity?.message ??
                        rowErrors.location?.message ??
                        rowErrors.description?.message
                      }
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        {fields.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No rows yet. Add one for each thing measured.
          </p>
        ) : null}
      </section>

      <MeasurementCumulative
        side={side}
        waiting={
          enabled ? null : "Pick the Work Order to see each line’s total."
        }
        items={cumulative}
        limit={measured?.deviationLimitPercent ?? null}
        deviationsHref={`/app/projects/${projectId}/boq?tab=deviations`}
      />

      <FormAlert message={failure} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : sheet == null ? "Save draft" : "Save changes"}
        </Button>
        {sheet != null && onSubmitForChecking != null ? (
          <Button
            type="button"
            variant="secondary"
            disabled={pending || submitting || rows.length === 0}
            onClick={() => {
              void handleSubmit(submitForChecking)();
            }}
          >
            {submitting
              ? "Submitting…"
              : isDirty
                ? "Save and submit for checking"
                : "Submit for checking"}
          </Button>
        ) : null}
        <Link
          href={
            sheet == null
              ? measurementsPath(projectId)
              : measurementsPath(projectId, sheet.id)
          }
          className={buttonVariants({ variant: "outline" })}
        >
          Cancel
        </Link>
      </div>

      {placing != null && placingRow != null ? (
        <RowLocationDialog
          projectId={projectId}
          row={placing + 1}
          value={placingRow.location}
          onSave={(location) => {
            setValue(`rows.${placing}.location`, location, {
              shouldDirty: true,
            });
            setPlacing(null);
          }}
          onClose={() => {
            setPlacing(null);
          }}
        />
      ) : null}
    </form>
  );
}

/** The items a row may name: BOQ items, or the picked Work Order's lines. */
function itemOptions(
  options: MeasurementFormOptions,
  side: Side,
  workOrderId: string,
  sheet: MeasurementSheet | null,
): ItemOption[] {
  const list: ItemOption[] =
    side === "client"
      ? options.boqItems.map((item) => ({
          id: item.id,
          itemNo: item.itemNo,
          description: item.description,
          label: `${item.itemNo ?? ""} · ${item.description}`,
          detail: `${quantity(item.quantity)} ${item.uomName} · ${item.sectionTitle}`,
          uomName: item.uomName,
          quantity: item.quantity,
        }))
      : (
          options.workOrders.find((order) => order.id === workOrderId)?.lines ??
          []
        ).map((line) => ({
          id: line.id,
          itemNo: line.itemNo,
          description: line.description,
          label: `${line.itemNo ?? "—"} · ${line.description}`,
          detail: `${quantity(line.quantity)} ${line.uomName} on the Work Order`,
          uomName: line.uomName,
          quantity: line.quantity,
        }));
  // An item the sheet already names stays pickable.
  for (const row of sheet?.rows ?? [])
    if (row.item != null && !list.some((item) => item.id === row.item?.id))
      list.push({
        id: row.item.id,
        itemNo: row.item.itemNo,
        description: row.item.description,
        label: `${row.item.itemNo ?? "—"} · ${row.item.description}`,
        detail: `${quantity(row.item.quantity)} ${row.item.uomName}`,
        uomName: row.item.uomName,
        quantity: row.item.quantity,
      });
  return list;
}

/** Where on the Project a row was measured: the Project's location picker. */
function RowLocationDialog({
  projectId,
  row,
  value,
  onSave,
  onClose,
}: {
  projectId: string;
  row: number;
  value: LocationRef | null;
  onSave: (location: LocationRef | null) => void;
  onClose: () => void;
}) {
  const [location, setLocation] = useState<LocationRef | null>(value);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="grid-cols-1 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{`Row ${String(row)} location`}</DialogTitle>
          <DialogDescription>
            Where on the Project this was measured.
          </DialogDescription>
        </DialogHeader>
        <Suspense fallback={<LocationPickerSkeleton />}>
          <LocationPicker
            projectId={projectId}
            value={location}
            onChange={setLocation}
          />
        </Suspense>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onSave(null);
            }}
          >
            Clear
          </Button>
          <Button
            type="button"
            onClick={() => {
              onSave(location);
            }}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
