"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  keepPreviousData,
  useQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  ListChecks,
  Plus,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { LocationPicker } from "@/components/locations/location-picker";
import {
  formatQuantity,
  localToday,
  QUANTITY_PATTERN,
} from "@/components/procurement/inventory/inventory-format";
import { StockErrorAlert } from "@/components/procurement/inventory/stock-error-alert";
import { MaterialPicker } from "@/components/procurement/material-picker";
import { siteLocationInput } from "@/components/procurement/purchase-requests/purchase-request-format";
import { PendingFilesField } from "@/components/site-work/documents/pending-files-field";
import { useUploadPendingFiles } from "@/components/site-work/documents/use-upload-pending-files";
import { QueryHttpError } from "@/src/queries/http";
import { locationOptionsQuery } from "@/src/queries/location-options";
import { materialOptionsQuery } from "@/src/queries/material-options";
import {
  canInSiteWork,
  siteWorkAccessQuery,
} from "@/src/queries/site-work-access";
import {
  useCreateWorksheet,
  useUpdateWorksheet,
  worksheetFormOptionsQuery,
  worksheetStockQuery,
  type Worksheet,
  type WorksheetFormOptions,
} from "@/src/queries/worksheets";
import { addDays } from "@/src/shared-kernel/calendar-date";
import type { LocationRef } from "@/src/shared-kernel/location-ref";
import { WORK_SHIFT_LABELS, WORK_SHIFTS } from "@/src/site-work/domain/shift";
import {
  WORKSHEET_LIMITS,
  WORKSHEET_SECTION_LABELS,
  type WorksheetSection,
} from "@/src/site-work/domain/worksheet";

import { BulkSelectDialog } from "./bulk-select-dialog";
import { WorksheetAttendancePanel } from "./worksheet-attendance-panel";
import { quantityText } from "./worksheet-format";
import {
  WorksheetTaskPicker,
  type WorksheetTaskChoice,
} from "./worksheet-task-picker";

type Settings = WorksheetFormOptions["settings"];

type Values = {
  sheetDate: string;
  siteLocation: LocationRef | null;
  contractorId: string;
  departmentId: string;
  workTypeId: string;
  shift: string;
  skilledCount: string;
  unskilledCount: string;
  approxWorkQty: string;
  approxWorkUnitId: string;
  /** The Task the work is for (CM-806). */
  task: WorksheetTaskChoice | null;
  materials: { materialId: string; quantity: string }[];
  remark: string;
  /** Work Photos picked on a new sheet, uploaded once it is saved. */
  photos: File[];
  /** Not sent: whether the Project has a place to pick (Location required). */
  placesOffered: boolean;
};

const COUNT_PATTERN = /^\d{1,5}$/;

/** The form's rules for the Project's settings: hidden sections are not checked. */
function schemaFor(settings: Settings) {
  return z
    .object({
      sheetDate: z.string().min(1, "Choose the date."),
      siteLocation: z.custom<LocationRef | null>(),
      contractorId: z.string().min(1, "Choose the Contractor."),
      departmentId: z.string().min(1, "Choose the Department."),
      workTypeId: z.string(),
      shift: z.string().min(1, "Choose the Work Shift."),
      skilledCount: z.string(),
      unskilledCount: z.string(),
      approxWorkQty: z.string(),
      approxWorkUnitId: z.string(),
      task: z.custom<WorksheetTaskChoice | null>(),
      materials: z.array(
        z.object({ materialId: z.string(), quantity: z.string() }),
      ),
      remark: z.string(),
      photos: z.array(z.custom<File>()),
      placesOffered: z.boolean(),
    })
    .superRefine((value, ctx) => {
      const issue = (path: string, message: string) => {
        ctx.addIssue({ code: "custom", path: path.split("."), message });
      };
      if (
        settings.showLocation &&
        value.placesOffered &&
        value.siteLocation == null
      )
        issue("siteLocation", "Choose where the work was done.");
      if (settings.showLabour) {
        let total = 0;
        for (const field of ["skilledCount", "unskilledCount"] as const) {
          const raw = value[field].trim();
          if (raw === "") continue;
          if (!COUNT_PATTERN.test(raw))
            issue(field, "Enter a whole number of 0 or more.");
          else total += Number(raw);
        }
        if (
          total === 0 &&
          COUNT_PATTERN.test(value.skilledCount.trim() || "0") &&
          COUNT_PATTERN.test(value.unskilledCount.trim() || "0")
        )
          issue("skilledCount", "Enter the skilled or unskilled headcount.");
      }
      if (settings.showApproxWorkDone && value.approxWorkQty.trim() !== "") {
        const qty = value.approxWorkQty.trim();
        if (!QUANTITY_PATTERN.test(qty) || Number(qty) === 0)
          issue(
            "approxWorkQty",
            "Enter a quantity more than 0 with at most 3 decimals.",
          );
        if (value.approxWorkUnitId === "")
          issue("approxWorkUnitId", "Choose the unit of the work done.");
      }
      if (settings.showMaterials) {
        if (value.materials.length > WORKSHEET_LIMITS.maxMaterials)
          issue("materials", "Add at most 100 materials.");
        value.materials.forEach((line, index) => {
          if (line.materialId === "")
            issue(
              `materials.${String(index)}.materialId`,
              "Choose a material.",
            );
          const qty = line.quantity.trim();
          if (!QUANTITY_PATTERN.test(qty))
            issue(
              `materials.${String(index)}.quantity`,
              "Enter a quantity with at most 3 decimals.",
            );
          else if (Number(qty) === 0)
            issue(
              `materials.${String(index)}.quantity`,
              "Enter a quantity more than 0.",
            );
        });
      }
      if (settings.showRemark && value.remark.trim().length > 500)
        issue("remark", "Use at most 500 characters.");
    });
}

function blank(sheetDate: string): Values {
  return {
    sheetDate,
    siteLocation: null,
    contractorId: "",
    departmentId: "",
    workTypeId: "",
    shift: "",
    skilledCount: "",
    unskilledCount: "",
    approxWorkQty: "",
    approxWorkUnitId: "",
    task: null,
    materials: [],
    remark: "",
    photos: [],
    placesOffered: true,
  };
}

function valuesFrom(sheet: Worksheet, sheetDate: string): Values {
  return {
    sheetDate,
    siteLocation: sheet.siteLocation,
    contractorId: sheet.contractor.id,
    departmentId: sheet.department.id,
    workTypeId: sheet.workType?.id ?? "",
    shift: sheet.shift,
    skilledCount: sheet.skilledCount == null ? "" : String(sheet.skilledCount),
    unskilledCount:
      sheet.unskilledCount == null ? "" : String(sheet.unskilledCount),
    approxWorkQty:
      sheet.approxWorkQty == null ? "" : quantityText(sheet.approxWorkQty),
    approxWorkUnitId: sheet.approxWorkUnit?.id ?? "",
    task:
      sheet.task?.taskNo == null || sheet.task.name == null
        ? null
        : {
            id: sheet.task.id,
            taskNo: sheet.task.taskNo,
            name: sheet.task.name,
            unitId: sheet.task.unitId,
            unitName: sheet.task.unitName,
          },
    materials: sheet.materials.map((line) => ({
      materialId: line.materialId,
      quantity: quantityText(line.quantity),
    })),
    remark: sheet.remark ?? "",
    // Duplicate copies no photos (CM-0016 §9).
    photos: [],
    placesOffered: true,
  };
}

/** Server codes shown under the field they are about. */
function fieldFor(error: QueryHttpError): FieldPath<Values> | null {
  const details = (error.details ?? {}) as { field?: string; index?: number };
  if (error.code.startsWith("LOCATION_")) return "siteLocation";
  if (error.code === "QUANTITY_INVALID" && typeof details.index === "number")
    return `materials.${details.index}.quantity`;
  switch (error.code) {
    case "SHEET_DATE_INVALID":
    case "SHEET_DATE_IN_FUTURE":
    case "BACKDATED_CREATE_BLOCKED":
    case "BACKDATED_EDIT_BLOCKED":
    case "FINANCIAL_PERIOD_CLOSED":
      return "sheetDate";
    case "WORK_SHIFT_REQUIRED":
      return "shift";
    case "CONTRACTOR_REQUIRED":
    case "CONTRACTOR_NOT_FOUND":
    case "CONTRACTOR_NOT_ON_PROJECT":
      return "contractorId";
    case "DEPARTMENT_REQUIRED":
    case "DEPARTMENT_NOT_FOUND":
    case "DEPARTMENT_NOT_CONTRACTORS":
      return "departmentId";
    case "WORK_TYPE_NOT_FOUND":
    case "WORK_TYPE_NOT_DEPARTMENTS":
      return "workTypeId";
    case "LABOUR_COUNT_REQUIRED":
      return "skilledCount";
    case "LABOUR_COUNT_INVALID":
      return details.field === "unskilledCount"
        ? "unskilledCount"
        : "skilledCount";
    case "APPROX_WORK_QTY_INVALID":
      return "approxWorkQty";
    case "APPROX_WORK_UNIT_REQUIRED":
    case "UNIT_NOT_FOUND":
      return "approxWorkUnitId";
    case "WORKSHEET_TASK_NOT_FOUND":
    case "WORKSHEET_TASK_IS_SUMMARY":
      return "task";
    case "TEXT_TOO_LONG":
      return details.field === "remark" ? "remark" : null;
    default:
      return null;
  }
}

/** Adds the sheet's own (maybe now inactive) choice when the options lack it. */
function withCurrent<T extends { id: string; name: string }>(
  options: readonly T[],
  current: { id: string; name: string | null } | null | undefined,
  extra: Omit<T, "id" | "name">,
): T[] {
  if (current == null || options.some((option) => option.id === current.id))
    return [...options];
  return [
    ...options,
    { ...extra, id: current.id, name: current.name ?? "—" } as T,
  ];
}

function SelectField({
  id,
  label,
  value,
  options,
  placeholder,
  invalid,
  error,
  disabled,
  required = false,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  placeholder: string;
  invalid: boolean;
  error: string | undefined;
  disabled?: boolean;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      <Select
        items={options}
        value={value === "" ? null : value}
        disabled={disabled}
        onValueChange={(next) => {
          if (next != null) onChange(next);
        }}
      >
        <SelectTrigger
          id={id}
          className="w-full min-w-0"
          aria-required={required}
          aria-invalid={invalid}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false}>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError message={error} />
    </div>
  );
}

/**
 * New, edit or duplicated Daily Worksheet (CM-602): a date stepper under
 * the back-dated rules, the Project's sections in their configured order —
 * Location, Basic (Contractor → Department → Work Type, Work Shift,
 * headcounts with the attendance panel, Approx Work Done), Material
 * consumption with the stock on that date and Bulk Select, and Other
 * (remark, photos). **Save**, **Save & Add New** (keeps the date,
 * location, contractor and shift) and **Save & Approve** for approvers.
 */
export function WorksheetForm({
  projectId,
  worksheet,
  source,
  today = localToday(),
  hrefFor,
}: {
  projectId: string;
  /** Edit this sheet. */
  worksheet?: Worksheet;
  /** Duplicate: a new sheet prefilled from this one, dated today. */
  source?: Worksheet;
  /** `YYYY-MM-DD`; the device's today unless a story fixes it. */
  today?: string;
  /**
   * Where to go after saving; `failed` names photos that did not upload,
   * for the detail page to warn about.
   */
  hrefFor: (id: string, failed?: readonly string[]) => string;
}) {
  const router = useRouter();
  const { data: options } = useSuspenseQuery(
    worksheetFormOptionsQuery(projectId),
  );
  const access = useQuery(siteWorkAccessQuery(projectId)).data;
  // Location is required only once the Project has a place to pick (the
  // server applies the same rule); until then the picker's empty state is
  // a hint.
  const places = useQuery({
    ...locationOptionsQuery(projectId),
    enabled: options.settings.showLocation,
  }).data;
  const placesOffered = places == null || places.types.length > 0;
  const settings = options.settings;
  const create = useCreateWorksheet();
  const update = useUpdateWorksheet(worksheet?.id ?? "");
  const uploads = useUploadPendingFiles("worksheet");
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  // Save & Add New clears the copy, so later sheets are not marked duplicates.
  const [duplicatedFrom, setDuplicatedFrom] = useState<string | null>(
    source?.id ?? null,
  );
  const editing = worksheet != null;
  // Whether the member picked or cleared the Task (CM-806). Not the field's
  // dirtiness: clearing back to an empty default must still clear the link.
  const [taskTouched, setTaskTouched] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schemaFor(settings)),
    defaultValues:
      worksheet != null
        ? valuesFrom(worksheet, worksheet.sheetDate)
        : source != null
          ? valuesFrom(source, today)
          : blank(today),
  });
  const lines = useFieldArray({ control: form.control, name: "materials" });
  useEffect(() => {
    form.setValue("placesOffered", placesOffered);
  }, [form, placesOffered]);
  const values = useWatch({ control: form.control }) as Values;
  const errors = form.formState.errors;
  const current = worksheet ?? source;

  // Options, with the sheet's own choices kept when they left the lists.
  const contractors = withCurrent(options.contractors, current?.contractor, {
    departmentIds: current == null ? [] : [current.department.id],
  });
  const departments = withCurrent(options.departments, current?.department, {});
  const workTypes = withCurrent(options.workTypes, current?.workType, {
    departmentId: current?.department.id ?? "",
    materialIds: [] as string[],
  });
  const units = withCurrent(options.units, current?.approxWorkUnit, {});
  const contractor = contractors.find((row) => row.id === values.contractorId);
  const departmentOptions = departments.filter(
    (row) =>
      contractor?.departmentIds.includes(row.id) === true ||
      row.id === values.departmentId,
  );
  const workTypeOptions = workTypes.filter(
    (row) => row.departmentId === values.departmentId,
  );
  const workType = workTypes.find((row) => row.id === values.workTypeId);

  const canApprove =
    settings.approvalEnabled &&
    access != null &&
    canInSiteWork(access, "site_work.daily_worksheet", "approve");

  // Material lines: units and the stock on the sheet date.
  const chosen = values.materials
    .map((line) => line.materialId)
    .filter((id) => id !== "");
  const { data: materialRows = [] } = useQuery({
    ...materialOptionsQuery({ ids: chosen }),
    enabled: chosen.length > 0,
    placeholderData: keepPreviousData,
  });
  const unitOf = new Map(materialRows.map((row) => [row.id, row.uomName]));
  const { data: stock } = useQuery({
    ...worksheetStockQuery(
      projectId,
      values.sheetDate,
      chosen,
      worksheet?.id ?? null,
    ),
    enabled:
      settings.showMaterials && chosen.length > 0 && values.sheetDate !== "",
    placeholderData: keepPreviousData,
  });

  const submit = async (
    input: Values,
    mode: "save" | "add-new" | "approve",
  ) => {
    setError(null);
    setNotice(null);
    const qty = input.approxWorkQty.trim();
    const count = (raw: string) => (raw.trim() === "" ? 0 : Number(raw.trim()));
    const remark = input.remark.trim();
    const body = {
      sheetDate: input.sheetDate,
      shift: input.shift as (typeof WORK_SHIFTS)[number],
      contractorId: input.contractorId,
      departmentId: input.departmentId,
      workTypeId:
        settings.showWorkType && input.workTypeId !== ""
          ? input.workTypeId
          : null,
      skilledCount: settings.showLabour ? count(input.skilledCount) : null,
      unskilledCount: settings.showLabour ? count(input.unskilledCount) : null,
      approxWorkQty: settings.showApproxWorkDone && qty !== "" ? qty : null,
      approxWorkUnitId:
        settings.showApproxWorkDone && qty !== ""
          ? input.approxWorkUnitId
          : null,
      siteLocation: settings.showLocation
        ? siteLocationInput(input.siteLocation)
        : null,
      remark: settings.showRemark && remark !== "" ? remark : null,
      materials: settings.showMaterials
        ? input.materials.map((line) => ({
            materialId: line.materialId,
            quantity: line.quantity.trim(),
          }))
        : [],
      approve: mode === "approve",
      // An edit sends the Task only when the member used the field: leaving
      // it out keeps the sheet's link, even to a task that can no longer be
      // picked; clearing it sends null.
      ...(worksheet == null || taskTouched
        ? { taskId: input.task?.id ?? null }
        : {}),
    };
    try {
      const saved =
        worksheet == null
          ? await create.mutateAsync({
              ...body,
              projectId,
              duplicatedFromId: duplicatedFrom,
            })
          : await update.mutateAsync({
              ...body,
              expectedUpdatedAt: worksheet.updatedAt,
            });
      // Photos go up once the sheet exists; a failed one never undoes the save.
      const { failed } =
        worksheet == null && settings.showPhotos
          ? await uploads.uploadAll(saved.id, input.photos)
          : { failed: [] as string[] };
      if (mode === "add-new") {
        setDuplicatedFrom(null);
        form.reset({
          ...blank(input.sheetDate),
          siteLocation: input.siteLocation,
          contractorId: input.contractorId,
          shift: input.shift,
          placesOffered: input.placesOffered,
        });
        setNotice(
          failed.length === 0
            ? `${saved.number} saved. Fill in the next worksheet.`
            : `${saved.number} saved, but ${failed.join(", ")} did not upload. Add ${failed.length === 1 ? "it" : "them"} on the worksheet.`,
        );
        return;
      }
      router.push(hrefFor(saved.id, failed));
    } catch (caught) {
      if (caught instanceof QueryHttpError) {
        const field = fieldFor(caught);
        if (field != null) {
          form.setError(field, { message: caught.message });
          return;
        }
      }
      setError(caught);
    }
  };

  const busy = form.formState.isSubmitting;
  const id = (name: string) => `worksheet-${name}`;
  // One of the headcounts must be more than 0: Skilled is marked while
  // Unskilled has none.
  const hasHeadcount = (raw: string) =>
    COUNT_PATTERN.test(raw.trim()) && Number(raw.trim()) > 0;
  const labourRequired = !hasHeadcount(values.unskilledCount);
  // A quantity of work done needs its unit.
  const approxUnitRequired = values.approxWorkQty.trim() !== "";

  const sections: Record<WorksheetSection, ReactNode> = {
    location: settings.showLocation ? (
      <section
        key="location"
        aria-labelledby={id("location-heading")}
        className="space-y-3"
      >
        <h3 id={id("location-heading")} className="text-sm font-semibold">
          {WORKSHEET_SECTION_LABELS.location}
        </h3>
        <div className="max-w-xl space-y-1.5">
          <Controller
            control={form.control}
            name="siteLocation"
            render={({ field }) => (
              <LocationPicker
                projectId={projectId}
                id={id("location")}
                label="Location"
                required={placesOffered}
                value={field.value}
                invalid={errors.siteLocation != null}
                onChange={field.onChange}
              />
            )}
          />
          <FieldError message={errors.siteLocation?.message} />
          {!placesOffered && (
            <p className="text-muted-foreground text-xs">
              Optional until the Project has a Wing, Amenity, Common Development
              or Location.
            </p>
          )}
        </div>
      </section>
    ) : null,
    basic: (
      <section
        key="basic"
        aria-labelledby={id("basic-heading")}
        className="space-y-3"
      >
        <h3 id={id("basic-heading")} className="text-sm font-semibold">
          {WORKSHEET_SECTION_LABELS.basic}
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id={id("contractor")}
            label="Contractor"
            placeholder="Choose a Contractor"
            required
            value={values.contractorId}
            options={contractors.map((row) => ({
              value: row.id,
              label: row.name,
            }))}
            invalid={errors.contractorId != null}
            error={errors.contractorId?.message}
            onChange={(next) => {
              form.setValue("contractorId", next, { shouldValidate: true });
              const picked = contractors.find((row) => row.id === next);
              if (
                picked?.departmentIds.includes(values.departmentId) !== true
              ) {
                form.setValue("departmentId", "");
                form.setValue("workTypeId", "");
              }
            }}
          />
          <SelectField
            id={id("department")}
            label="Department"
            required
            placeholder={
              values.contractorId === ""
                ? "Choose the Contractor first"
                : "Choose a Department"
            }
            disabled={values.contractorId === ""}
            value={values.departmentId}
            options={departmentOptions.map((row) => ({
              value: row.id,
              label: row.name,
            }))}
            invalid={errors.departmentId != null}
            error={errors.departmentId?.message}
            onChange={(next) => {
              form.setValue("departmentId", next, { shouldValidate: true });
              if (
                workTypes.find((row) => row.id === values.workTypeId)
                  ?.departmentId !== next
              )
                form.setValue("workTypeId", "");
            }}
          />
          {settings.showWorkType && (
            <SelectField
              id={id("work-type")}
              label="Work Type"
              placeholder={
                values.departmentId === ""
                  ? "Choose the Department first"
                  : workTypeOptions.length === 0
                    ? "No Work Types for this Department"
                    : "Choose a Work Type"
              }
              disabled={
                values.departmentId === "" || workTypeOptions.length === 0
              }
              value={values.workTypeId}
              options={workTypeOptions.map((row) => ({
                value: row.id,
                label: row.name,
              }))}
              invalid={errors.workTypeId != null}
              error={errors.workTypeId?.message}
              onChange={(next) => {
                form.setValue("workTypeId", next, { shouldValidate: true });
              }}
            />
          )}
          <SelectField
            id={id("shift")}
            label="Work Shift"
            placeholder="Choose the shift"
            required
            value={values.shift}
            options={WORK_SHIFTS.map((shift) => ({
              value: shift,
              label: WORK_SHIFT_LABELS[shift],
            }))}
            invalid={errors.shift != null}
            error={errors.shift?.message}
            onChange={(next) => {
              form.setValue("shift", next, { shouldValidate: true });
            }}
          />
        </div>
        {settings.showLabour && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid grid-cols-2 gap-3 self-start">
              <div className="space-y-1.5">
                <Label htmlFor={id("skilled")} required={labourRequired}>
                  Skilled Labours
                </Label>
                <Input
                  id={id("skilled")}
                  inputMode="numeric"
                  autoComplete="off"
                  aria-required={labourRequired}
                  aria-invalid={errors.skilledCount != null}
                  {...form.register("skilledCount")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={id("unskilled")}>Unskilled Labours</Label>
                <Input
                  id={id("unskilled")}
                  inputMode="numeric"
                  autoComplete="off"
                  aria-invalid={errors.unskilledCount != null}
                  {...form.register("unskilledCount")}
                />
              </div>
              <div className="col-span-2">
                <FieldError
                  message={
                    errors.skilledCount?.message ??
                    errors.unskilledCount?.message
                  }
                />
              </div>
            </div>
            {values.sheetDate !== "" && (
              <WorksheetAttendancePanel
                projectId={projectId}
                date={values.sheetDate}
                excludeId={worksheet?.id ?? null}
                onUseRemaining={(remaining) => {
                  form.setValue("skilledCount", String(remaining.skilled), {
                    shouldValidate: true,
                  });
                  form.setValue("unskilledCount", String(remaining.unskilled), {
                    shouldValidate: true,
                  });
                }}
              />
            )}
          </div>
        )}
        {settings.showApproxWorkDone && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={id("approx-qty")}>Approx Work Done</Label>
              <Input
                id={id("approx-qty")}
                inputMode="decimal"
                autoComplete="off"
                aria-invalid={errors.approxWorkQty != null}
                {...form.register("approxWorkQty")}
              />
              <FieldError message={errors.approxWorkQty?.message} />
            </div>
            <SelectField
              id={id("approx-unit")}
              label="Unit"
              placeholder="Choose a unit"
              required={approxUnitRequired}
              value={values.approxWorkUnitId}
              options={units.map((row) => ({ value: row.id, label: row.name }))}
              invalid={errors.approxWorkUnitId != null}
              error={errors.approxWorkUnitId?.message}
              onChange={(next) => {
                form.setValue("approxWorkUnitId", next, {
                  shouldValidate: true,
                });
              }}
            />
          </div>
        )}
        <WorksheetTaskPicker
          id={id("task")}
          projectId={projectId}
          value={values.task}
          onChange={(next) => {
            setTaskTouched(true);
            form.setValue("task", next, {
              shouldValidate: true,
              shouldDirty: true,
            });
          }}
          work={{
            quantity: settings.showApproxWorkDone ? values.approxWorkQty : "",
            unitId: settings.showApproxWorkDone ? values.approxWorkUnitId : "",
          }}
          error={errors.task?.message}
        />
      </section>
    ),
    materials: settings.showMaterials ? (
      <section
        key="materials"
        aria-labelledby={id("materials-heading")}
        className="space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id={id("materials-heading")} className="text-sm font-semibold">
            {WORKSHEET_SECTION_LABELS.materials}
          </h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={lines.fields.length >= WORKSHEET_LIMITS.maxMaterials}
            onClick={() => {
              setBulkOpen(true);
            }}
          >
            <ListChecks aria-hidden="true" />
            Bulk Select
          </Button>
        </div>
        {lines.fields.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No material consumed. Add the materials the crew used, if any.
          </p>
        ) : (
          <ol className="space-y-3">
            {lines.fields.map((field, index) => {
              const line = values.materials[index];
              const lineErrors = errors.materials?.[index];
              const lineId = (name: string) =>
                id(`material-${String(index)}-${name}`);
              const available =
                line == null || line.materialId === "" || stock == null
                  ? null
                  : (stock[line.materialId] ?? "0.000");
              const unit =
                line == null ? undefined : unitOf.get(line.materialId);
              const short =
                available != null &&
                line != null &&
                QUANTITY_PATTERN.test(line.quantity.trim()) &&
                Number(line.quantity) > Number(available);
              return (
                <li
                  key={field.id}
                  aria-label={`Material ${String(index + 1)}`}
                  className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_10rem_auto] sm:items-start"
                >
                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor={lineId("material")} required>
                      Material
                    </Label>
                    <Controller
                      control={form.control}
                      name={`materials.${index}.materialId`}
                      render={({ field: control }) => (
                        <MaterialPicker
                          required
                          id={lineId("material")}
                          value={control.value === "" ? null : control.value}
                          excludeIds={chosen.filter(
                            (value) => value !== control.value,
                          )}
                          invalid={lineErrors?.materialId != null}
                          onChange={(material) => {
                            control.onChange(material?.id ?? "");
                          }}
                        />
                      )}
                    />
                    <FieldError message={lineErrors?.materialId?.message} />
                    {available != null && (
                      <p
                        className={
                          short
                            ? "text-destructive text-xs"
                            : "text-muted-foreground text-xs"
                        }
                      >
                        Available: {formatQuantity(available)}
                        {unit == null ? "" : ` ${unit}`}
                        {short && " — more than the stock on this date"}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={lineId("quantity")} required>
                      Used Qty{unit == null ? "" : ` (${unit})`}
                    </Label>
                    <Input
                      id={lineId("quantity")}
                      inputMode="decimal"
                      autoComplete="off"
                      aria-required
                      aria-invalid={lineErrors?.quantity != null}
                      {...form.register(`materials.${index}.quantity`)}
                    />
                    <FieldError message={lineErrors?.quantity?.message} />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="sm:mt-6"
                    aria-label={`Remove material ${String(index + 1)}`}
                    onClick={() => {
                      lines.remove(index);
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
          </ol>
        )}
        {lines.fields.length < WORKSHEET_LIMITS.maxMaterials && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              lines.append({ materialId: "", quantity: "" });
            }}
          >
            <Plus aria-hidden="true" />
            Add material
          </Button>
        )}
        <BulkSelectDialog
          open={bulkOpen}
          onOpenChange={setBulkOpen}
          workTypeName={workType?.name ?? null}
          workTypeMaterialIds={workType?.materialIds ?? []}
          excludeIds={chosen}
          onAdd={(materials) => {
            const room = WORKSHEET_LIMITS.maxMaterials - lines.fields.length;
            // Fill empty lines first, then add the rest.
            const blanks = values.materials
              .map((line, index) => (line.materialId === "" ? index : -1))
              .filter((index) => index >= 0);
            const picked = materials.slice(0, room + blanks.length);
            picked.forEach((material, n) => {
              const at = blanks[n];
              if (at != null)
                form.setValue(`materials.${at}.materialId`, material.id);
            });
            lines.append(
              picked
                .slice(blanks.length)
                .map((material) => ({ materialId: material.id, quantity: "" })),
            );
          }}
        />
      </section>
    ) : null,
    other:
      settings.showRemark || settings.showPhotos ? (
        <section
          key="other"
          aria-labelledby={id("other-heading")}
          className="space-y-3"
        >
          <h3 id={id("other-heading")} className="text-sm font-semibold">
            {WORKSHEET_SECTION_LABELS.other}
          </h3>
          {settings.showRemark && (
            <div className="space-y-1.5">
              <Label htmlFor={id("remark")}>Remark</Label>
              <Textarea
                id={id("remark")}
                rows={3}
                maxLength={500}
                aria-invalid={errors.remark != null}
                {...form.register("remark")}
              />
              <FieldError message={errors.remark?.message} />
            </div>
          )}
          {settings.showPhotos &&
            (editing ? (
              <p className="text-muted-foreground text-sm">
                Add or remove Work Photos on the worksheet page.
              </p>
            ) : (
              <Controller
                control={form.control}
                name="photos"
                render={({ field }) => (
                  <PendingFilesField
                    documentType="worksheet"
                    label="Work Photos"
                    value={field.value}
                    disabled={busy}
                    onChange={field.onChange}
                  />
                )}
              />
            ))}
        </section>
      ) : null,
  };

  return (
    <form
      noValidate
      aria-label={
        worksheet != null
          ? `Edit ${worksheet.number}`
          : source != null
            ? `Duplicate of ${source.number}`
            : "New Daily Worksheet"
      }
      className="w-full max-w-4xl space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit((input) => submit(input, "save"))(event);
      }}
    >
      {notice != null && (
        <p
          role="status"
          className="text-sm text-emerald-700 dark:text-emerald-400"
        >
          {notice}
        </p>
      )}
      <div className="max-w-sm space-y-1.5">
        <Label htmlFor={id("date")} required>
          Sheet Date
        </Label>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Previous day"
            disabled={values.sheetDate === ""}
            onClick={() => {
              form.setValue("sheetDate", addDays(values.sheetDate, -1), {
                shouldValidate: true,
              });
            }}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Input
            id={id("date")}
            type="date"
            max={today}
            className="min-w-0 flex-1"
            aria-required
            aria-invalid={errors.sheetDate != null}
            {...form.register("sheetDate")}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Next day"
            disabled={values.sheetDate === "" || values.sheetDate >= today}
            onClick={() => {
              form.setValue("sheetDate", addDays(values.sheetDate, 1), {
                shouldValidate: true,
              });
            }}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
        <FieldError message={errors.sheetDate?.message} />
      </div>

      {settings.sectionOrder.map((section) => sections[section])}

      <StockErrorAlert error={error} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            router.back();
          }}
        >
          Cancel
        </Button>
        {!editing && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              void form.handleSubmit((input) => submit(input, "add-new"))();
            }}
          >
            Save &amp; Add New
          </Button>
        )}
        {canApprove && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              void form.handleSubmit((input) => submit(input, "approve"))();
            }}
          >
            Save &amp; Approve
          </Button>
        )}
        <Button type="submit" disabled={busy}>
          {uploads.uploading
            ? `Uploading photos ${String(uploads.done)} of ${String(uploads.total)}`
            : busy
              ? "Saving…"
              : "Save"}
        </Button>
      </div>
    </form>
  );
}
