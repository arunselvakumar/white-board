"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ListPlus, Plus, Trash2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type FieldPath,
} from "react-hook-form";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Badge } from "@repo/ui/components/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { formatPaise, MoneyInput } from "@/components/money/money-input";
import { fieldForCode } from "@/lib/server-errors";
import {
  useCreateWorkOrder,
  useSaveWorkOrder,
  workOrderBoqItemsQuery,
  workOrderFormOptionsQuery,
  workOrdersPath,
  type WorkOrder,
  type WorkOrderBoqItem,
} from "@/src/queries/contracts-work-orders";
import { QueryHttpError } from "@/src/queries/http";

import { BoqItemsDialog } from "./boq-items-dialog";
import { ReasonDialog } from "./work-order-dialogs";
import {
  blankLine,
  formWarnings,
  lineAmount,
  lineFromBoq,
  newWorkOrderValues,
  runningTotal,
  workOrderBody,
  workOrderSchema,
  workOrderValues,
  type WorkOrderValues,
} from "./work-order-form-schema";
import { quantity, workOrderNumber } from "./work-order-format";
import { WorkOrderMaterials } from "./work-order-materials";

const NONE = "__none";

/** The Company's day in the browser, `YYYY-MM-DD`. */
export function localToday(): string {
  return new Date().toLocaleDateString("en-CA");
}

/** Error paths the API names (`details.field`) that the form shows under a field. */
function formPath(field: string): FieldPath<WorkOrderValues> | null {
  const flat = field.replace(/^terms\./, "");
  if (
    /^(contractorId|departmentId|orderDate|validUntil|scope|retentionPercent|retentionCapPercent|retentionCompletionPercent|dlpMonths|tdsNature|sacCode|gstRate|mobilisationAdvance|mobilisationRecoveryPercent)$/.test(
      flat,
    ) ||
    /^lines\.\d+\.(itemNo|description|uomId|sacHsn|quantity|rate)$/.test(
      flat,
    ) ||
    /^materials\.\d+\.(materialId|issueRate|wastagePercent|penalRate)$/.test(
      flat,
    )
  )
    return flat as FieldPath<WorkOrderValues>;
  return null;
}

function TextField({
  id,
  label,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-w-0 space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      <FieldError message={error} />
    </div>
  );
}

/**
 * The Work Order form (CM-1104): a header card (Contractor and its
 * Department, dates, scope), a terms card, the lines with "Add from BOQ"
 * and "Add line", the materials issued and a running total. Lines beyond
 * what the BOQ has left show a warning; saving is never refused for it.
 * `mode` is a new draft, a draft's edit, or an issued Work Order's
 * amendment (saved with a reason, as a new revision).
 */
export function WorkOrderForm({
  projectId,
  workOrder,
  mode,
  today = localToday(),
}: {
  projectId: string;
  workOrder: WorkOrder | null;
  mode: "create" | "edit" | "amend";
  today?: string;
}) {
  const router = useRouter();
  const { data: options } = useSuspenseQuery(
    workOrderFormOptionsQuery(projectId),
  );
  const { data: boq } = useSuspenseQuery(
    workOrderBoqItemsQuery(projectId, workOrder?.id ?? null),
  );
  const financial = options.financial;
  const schema = useMemo(() => workOrderSchema(financial), [financial]);
  const {
    control,
    register,
    handleSubmit,
    setValue,
    setError,
    getValues,
    formState: { errors },
  } = useForm<WorkOrderValues>({
    resolver: zodResolver(schema),
    defaultValues:
      workOrder == null
        ? newWorkOrderValues(today)
        : workOrderValues(workOrder, boq.items),
  });
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const lines = useWatch({ control, name: "lines" });
  const contractorId = useWatch({ control, name: "contractorId" });
  const create = useCreateWorkOrder();
  const save = useSaveWorkOrder(workOrder?.id ?? "");
  const [picking, setPicking] = useState(false);
  const [amending, setAmending] = useState<WorkOrderValues | null>(null);
  const [failure, setFailure] = useState<string | undefined>();
  const pending = create.isPending || save.isPending;

  // A Contractor no longer on the Project stays pickable on its own Work Order.
  const contractors = useMemo(() => {
    const list = options.contractors.map((c) => ({
      value: c.id,
      label: c.name,
    }));
    if (
      workOrder != null &&
      !list.some((item) => item.value === workOrder.contractorId)
    )
      list.unshift({
        value: workOrder.contractorId,
        label: workOrder.contractorName,
      });
    return list;
  }, [options.contractors, workOrder]);
  const departments = useMemo(() => {
    const own =
      options.contractors.find((c) => c.id === contractorId)?.departments ?? [];
    const list = [
      { value: NONE, label: "No Department" },
      ...own.map((d) => ({ value: d.id, label: d.name })),
    ];
    if (
      workOrder?.departmentId != null &&
      workOrder.contractorId === contractorId &&
      !own.some((d) => d.id === workOrder.departmentId)
    )
      list.push({
        value: workOrder.departmentId,
        label: workOrder.departmentName ?? "Department",
      });
    return list;
  }, [options.contractors, contractorId, workOrder]);
  const natures = [
    { value: NONE, label: "No TDS" },
    ...options.tdsNatures.map((nature) => ({
      value: nature.key,
      label: nature.label,
    })),
  ];
  const uoms = useMemo(() => {
    const list = options.uoms.map((uom) => ({
      value: uom.id,
      label: uom.name,
    }));
    for (const row of workOrder?.lines ?? [])
      if (!list.some((item) => item.value === row.uomId))
        list.push({ value: row.uomId, label: row.uomName });
    for (const item of boq.items)
      if (!list.some((entry) => entry.value === item.uomId))
        list.push({ value: item.uomId, label: item.uomName });
    return list;
  }, [options.uoms, workOrder, boq.items]);
  const uomName = (id: string) =>
    uoms.find((item) => item.value === id)?.label ?? "";
  const warnings = formWarnings(lines, boq.items);
  const total = runningTotal(lines);
  const onWorkOrder = new Set(
    lines.flatMap((row) => (row.boqItemId == null ? [] : [row.boqItemId])),
  );

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

  const done = (saved: WorkOrder) => {
    router.push(workOrdersPath(projectId, saved.id));
  };

  const submit = (values: WorkOrderValues) => {
    setFailure(undefined);
    const body = workOrderBody(values, financial);
    if (mode === "create") {
      create.mutate(
        { projectId, ...body },
        { onSuccess: done, onError: failed },
      );
      return;
    }
    if (workOrder == null) return;
    if (mode === "amend") {
      setAmending(values);
      return;
    }
    save.mutate(
      {
        kind: "update",
        input: { ...body, expectedUpdatedAt: workOrder.updatedAt },
      },
      { onSuccess: done, onError: failed },
    );
  };

  const addFromBoq = (items: WorkOrderBoqItem[]) => {
    const added = items.map(lineFromBoq);
    append(added);
    // Each Material's coefficients for the new lines come from the rate analysis.
    getValues("materials").forEach((material, index) => {
      const next = { ...material.coefficients };
      for (const row of added) {
        const found = items
          .find((item) => item.id === row.boqItemId)
          ?.analysis.find((entry) => entry.materialId === material.materialId);
        if (found != null)
          next[row.key] = found.coefficient.replace(/\.?0+$/, "");
      }
      setValue(`materials.${index}.coefficients`, next);
    });
    setPicking(false);
  };

  const backHref =
    workOrder == null
      ? workOrdersPath(projectId)
      : workOrdersPath(projectId, workOrder.id);

  return (
    <form
      noValidate
      className="flex w-full max-w-4xl min-w-0 flex-col gap-4"
      onSubmit={(event) => {
        void handleSubmit(submit)(event);
      }}
    >
      {mode === "amend" ? (
        <Alert>
          <AlertTitle>Amending an issued Work Order</AlertTitle>
          <AlertDescription>
            Revision {String(workOrder?.revision ?? 0)} is kept in the history
            and this becomes revision {String((workOrder?.revision ?? 0) + 1)}.
            A line on an approved bill stays, at or above what was billed.
          </AlertDescription>
        </Alert>
      ) : null}
      {workOrder?.rejectReason != null && mode === "edit" ? (
        <Alert variant="destructive">
          <AlertTitle>Rejected</AlertTitle>
          <AlertDescription>{workOrder.rejectReason}</AlertDescription>
        </Alert>
      ) : null}

      <section
        aria-labelledby="wo-header"
        className="grid min-w-0 gap-4 rounded-xl border p-4 sm:grid-cols-2"
      >
        <h3 id="wo-header" className="font-semibold sm:col-span-2">
          Contractor and dates
        </h3>
        <TextField
          id="wo-contractor"
          label="Contractor"
          error={errors.contractorId?.message}
        >
          <Controller
            control={control}
            name="contractorId"
            render={({ field }) => (
              <Select
                items={contractors}
                value={field.value === "" ? null : field.value}
                disabled={mode === "amend"}
                onValueChange={(value) => {
                  if (value == null) return;
                  field.onChange(value);
                  setValue("departmentId", "");
                  const picked = options.contractors.find(
                    (c) => c.id === value,
                  );
                  if (mode === "create")
                    setValue("tdsNature", picked?.defaultTdsNature ?? "");
                }}
              >
                <SelectTrigger
                  id="wo-contractor"
                  className="w-full min-w-0"
                  aria-invalid={errors.contractorId != null}
                >
                  <SelectValue placeholder="Pick a Contractor on this Project" />
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  {contractors.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {contractors.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              No Contractor is assigned to this Project. Add one under Project →
              Resources.
            </p>
          ) : null}
        </TextField>
        <TextField
          id="wo-department"
          label="Department"
          error={errors.departmentId?.message}
        >
          <Controller
            control={control}
            name="departmentId"
            render={({ field }) => (
              <Select
                items={departments}
                value={field.value === "" ? NONE : field.value}
                onValueChange={(value) => {
                  field.onChange(value == null || value === NONE ? "" : value);
                }}
              >
                <SelectTrigger id="wo-department" className="w-full min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  {departments.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </TextField>
        <TextField
          id="wo-order-date"
          label="Order date"
          error={errors.orderDate?.message}
        >
          <Input
            id="wo-order-date"
            type="date"
            aria-invalid={errors.orderDate != null}
            {...register("orderDate")}
          />
        </TextField>
        <TextField
          id="wo-valid-until"
          label="Valid until"
          error={errors.validUntil?.message}
        >
          <Input
            id="wo-valid-until"
            type="date"
            aria-invalid={errors.validUntil != null}
            {...register("validUntil")}
          />
        </TextField>
        <TextField
          id="wo-scope"
          label="Scope"
          error={errors.scope?.message}
          className="sm:col-span-2"
        >
          <Textarea
            id="wo-scope"
            rows={3}
            placeholder="What the Contractor is to do"
            {...register("scope")}
          />
        </TextField>
      </section>

      <section
        aria-labelledby="wo-terms"
        className="grid min-w-0 gap-4 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <h3 id="wo-terms" className="font-semibold sm:col-span-2 lg:col-span-3">
          Terms
        </h3>
        <TextField
          id="wo-retention"
          label="Retention % per bill"
          error={errors.retentionPercent?.message}
        >
          <Input
            id="wo-retention"
            inputMode="decimal"
            placeholder="0"
            aria-invalid={errors.retentionPercent != null}
            {...register("retentionPercent")}
          />
        </TextField>
        <TextField
          id="wo-retention-cap"
          label="Retention cap % of value"
          error={errors.retentionCapPercent?.message}
        >
          <Input
            id="wo-retention-cap"
            inputMode="decimal"
            placeholder="No cap"
            aria-invalid={errors.retentionCapPercent != null}
            {...register("retentionCapPercent")}
          />
        </TextField>
        <TextField
          id="wo-retention-completion"
          label="Released on completion %"
          error={errors.retentionCompletionPercent?.message}
        >
          <Input
            id="wo-retention-completion"
            inputMode="decimal"
            aria-invalid={errors.retentionCompletionPercent != null}
            {...register("retentionCompletionPercent")}
          />
        </TextField>
        <TextField
          id="wo-dlp"
          label="DLP (months)"
          error={errors.dlpMonths?.message}
        >
          <Input
            id="wo-dlp"
            inputMode="numeric"
            aria-invalid={errors.dlpMonths != null}
            {...register("dlpMonths")}
          />
        </TextField>
        {financial ? (
          <TextField
            id="wo-advance"
            label="Mobilisation advance"
            error={errors.mobilisationAdvance?.message}
          >
            <MoneyInput
              id="wo-advance"
              aria-invalid={errors.mobilisationAdvance != null}
              {...register("mobilisationAdvance")}
            />
          </TextField>
        ) : null}
        <TextField
          id="wo-recovery"
          label="Advance recovery % per bill"
          error={errors.mobilisationRecoveryPercent?.message}
        >
          <Input
            id="wo-recovery"
            inputMode="decimal"
            aria-invalid={errors.mobilisationRecoveryPercent != null}
            {...register("mobilisationRecoveryPercent")}
          />
        </TextField>
        <TextField id="wo-tds" label="TDS nature">
          <Controller
            control={control}
            name="tdsNature"
            render={({ field }) => (
              <Select
                items={natures}
                value={field.value === "" ? NONE : field.value}
                onValueChange={(value) => {
                  field.onChange(value == null || value === NONE ? "" : value);
                }}
              >
                <SelectTrigger id="wo-tds" className="w-full min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  {natures.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </TextField>
        <TextField id="wo-sac" label="SAC" error={errors.sacCode?.message}>
          <Input
            id="wo-sac"
            inputMode="numeric"
            list="wo-sac-presets"
            aria-invalid={errors.sacCode != null}
            {...register("sacCode")}
          />
          <datalist id="wo-sac-presets">
            {options.sacPresets.map((preset) => (
              <option key={preset.code} value={preset.code}>
                {preset.label}
              </option>
            ))}
          </datalist>
        </TextField>
        <TextField id="wo-gst" label="GST %" error={errors.gstRate?.message}>
          <Input
            id="wo-gst"
            inputMode="decimal"
            list="wo-gst-rates"
            aria-invalid={errors.gstRate != null}
            {...register("gstRate")}
          />
          <datalist id="wo-gst-rates">
            {options.gstRates.map((rate) => (
              <option key={rate} value={rate} />
            ))}
          </datalist>
        </TextField>
        <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
          <Controller
            control={control}
            name="reverseCharge"
            render={({ field }) => (
              <Checkbox
                id="wo-rcm"
                checked={field.value}
                onCheckedChange={(checked) => {
                  field.onChange(checked);
                }}
              />
            )}
          />
          <Label htmlFor="wo-rcm" className="font-normal">
            Reverse charge (RCM): the Company pays the GST
          </Label>
        </div>
      </section>

      <section
        aria-labelledby="wo-lines"
        className="min-w-0 space-y-3 rounded-xl border p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="wo-lines" className="font-semibold">
            Lines
          </h3>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setPicking(true);
              }}
            >
              <ListPlus aria-hidden="true" />
              Add from BOQ
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                append(blankLine());
              }}
            >
              <Plus aria-hidden="true" />
              Add line
            </Button>
          </div>
        </div>
        {fields.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Add BOQ items at the work-order rate, or a line for labour-only or
            extra work outside the BOQ.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table aria-label="Lines" className="min-w-[44rem]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Item no</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-28">UoM</TableHead>
                  <TableHead className="w-24">SAC/HSN</TableHead>
                  <TableHead className="w-28 text-right">Qty</TableHead>
                  {financial ? (
                    <>
                      <TableHead className="w-32 text-right">Rate</TableHead>
                      <TableHead className="w-32 text-right">Amount</TableHead>
                    </>
                  ) : null}
                  <TableHead className="w-10">
                    <span className="sr-only">Remove</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.map((field, index) => {
                  const row = lines[index];
                  const rowErrors = errors.lines?.[index];
                  const number = String(index + 1);
                  const boqItem =
                    row?.boqItemId == null
                      ? undefined
                      : boq.items.find((item) => item.id === row.boqItemId);
                  const amount = row == null ? null : lineAmount(row);
                  return (
                    <TableRow key={field.id} className="align-top">
                      <TableCell>
                        <Input
                          aria-label={`Line ${number} item no`}
                          className="h-8"
                          {...register(`lines.${index}.itemNo`)}
                        />
                        {row?.kind === "boq" ? (
                          <Badge variant="outline" className="mt-1">
                            BOQ
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Textarea
                          aria-label={`Line ${number} description`}
                          rows={1}
                          className="min-h-8"
                          aria-invalid={rowErrors?.description != null}
                          {...register(`lines.${index}.description`)}
                        />
                        <FieldError message={rowErrors?.description?.message} />
                      </TableCell>
                      <TableCell>
                        <Controller
                          control={control}
                          name={`lines.${index}.uomId`}
                          render={({ field: uom }) => (
                            <Select
                              items={uoms}
                              value={uom.value === "" ? null : uom.value}
                              onValueChange={(value) => {
                                if (value != null) uom.onChange(value);
                              }}
                            >
                              <SelectTrigger
                                aria-label={`Line ${number} UoM`}
                                className="h-8 w-full min-w-0"
                                aria-invalid={rowErrors?.uomId != null}
                              >
                                <SelectValue placeholder="UoM" />
                              </SelectTrigger>
                              <SelectContent
                                align="start"
                                alignItemWithTrigger={false}
                              >
                                {uoms.map((option) => (
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
                        <FieldError message={rowErrors?.uomId?.message} />
                      </TableCell>
                      <TableCell>
                        <Input
                          aria-label={`Line ${number} SAC/HSN`}
                          inputMode="numeric"
                          className="h-8"
                          aria-invalid={rowErrors?.sacHsn != null}
                          {...register(`lines.${index}.sacHsn`)}
                        />
                        <FieldError message={rowErrors?.sacHsn?.message} />
                      </TableCell>
                      <TableCell>
                        <Input
                          aria-label={`Line ${number} quantity`}
                          inputMode="decimal"
                          className="h-8 text-right"
                          aria-invalid={rowErrors?.quantity != null}
                          {...register(`lines.${index}.quantity`)}
                        />
                        {boqItem == null ? null : (
                          <p className="text-muted-foreground mt-1 text-right text-xs">
                            {quantity(boqItem.remaining)}{" "}
                            {uomName(boqItem.uomId)} left
                          </p>
                        )}
                        <FieldError message={rowErrors?.quantity?.message} />
                      </TableCell>
                      {financial ? (
                        <>
                          <TableCell>
                            <MoneyInput
                              aria-label={`Line ${number} rate`}
                              className="h-8"
                              aria-invalid={rowErrors?.rate != null}
                              {...register(`lines.${index}.rate`)}
                            />
                            <FieldError message={rowErrors?.rate?.message} />
                          </TableCell>
                          <TableCell className="pt-4 text-right tabular-nums">
                            {amount == null ? "—" : formatPaise(Number(amount))}
                          </TableCell>
                        </>
                      ) : null}
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove line ${number}`}
                          onClick={() => {
                            remove(index);
                          }}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <FieldError
          message={errors.lines?.root?.message ?? errors.lines?.message}
        />
        {warnings.length > 0 ? (
          <Alert>
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>More than the BOQ has left</AlertTitle>
            <AlertDescription>
              <ul className="list-disc space-y-1 pl-4">
                {warnings.map((warning) => (
                  <li key={warning.boqItemId}>{warning.text}</li>
                ))}
              </ul>
              <p className="mt-1">
                You can still save; raise a Variation on the BOQ if the work
                grew.
              </p>
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-wrap items-baseline justify-end gap-x-3 gap-y-1 border-t pt-3">
          <span className="text-muted-foreground text-sm">
            {fields.length} {fields.length === 1 ? "line" : "lines"}
          </span>
          {financial ? (
            <span className="text-base font-semibold tabular-nums">
              Total {formatPaise(Number(total))}
              <span className="text-muted-foreground ml-1 text-xs font-normal">
                excl. GST
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">
              Rates and totals need the Work Order&apos;s Financial permission.
            </span>
          )}
        </div>
      </section>

      <WorkOrderMaterials
        projectId={projectId}
        control={control}
        register={register}
        setValue={setValue}
        errors={errors}
        financial={financial}
        boqItems={boq.items}
      />

      <FormAlert message={failure} />
      <div className="flex flex-wrap justify-end gap-2">
        <Link
          href={backHref}
          className={buttonVariants({ variant: "outline" })}
        >
          Cancel
        </Link>
        <Button type="submit" disabled={pending}>
          {pending
            ? "Saving…"
            : mode === "amend"
              ? "Amend"
              : mode === "create"
                ? "Save draft"
                : "Save"}
        </Button>
      </div>

      {picking ? (
        <BoqItemsDialog
          items={boq.items}
          onWorkOrder={onWorkOrder}
          financial={financial}
          onAdd={addFromBoq}
          onClose={() => {
            setPicking(false);
          }}
        />
      ) : null}
      {amending != null && workOrder != null ? (
        <ReasonDialog
          title={`Amend Work Order ${workOrderNumber(workOrder.number)}?`}
          description={`Revision ${String(workOrder.revision)} is kept with your reason; you hold Approve, so the amendment takes effect at once.`}
          label="Why it is amended"
          empty="Write why the Work Order changes."
          confirm="Amend"
          busyLabel="Amending…"
          pending={save.isPending}
          error={failure}
          onConfirm={(reason) => {
            setFailure(undefined);
            save.mutate(
              {
                kind: "amend",
                input: {
                  ...workOrderBody(amending, financial),
                  reason,
                  expectedUpdatedAt: workOrder.updatedAt,
                },
              },
              {
                onSuccess: done,
                onError: (error) => {
                  // A field error shows on the form; others stay in the dialog.
                  if (failed(error)) setAmending(null);
                },
              },
            );
          }}
          onClose={() => {
            setAmending(null);
          }}
        />
      ) : null}
    </form>
  );
}
