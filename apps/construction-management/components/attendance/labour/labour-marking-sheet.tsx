"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ChevronDown,
  ClipboardCopy,
  Clock,
  Plus,
  Search,
  Trash2,
  UserCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  useFieldArray,
  useForm,
  useWatch,
  type Control,
  type UseFormSetValue,
} from "react-hook-form";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Badge } from "@repo/ui/components/badge";
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
import { Switch } from "@repo/ui/components/switch";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";
import { cn } from "@repo/ui/lib/utils";

import { FormAlert } from "@/components/auth/form-alert";
import { formatPaise, MoneyInput } from "@/components/money/money-input";
import { QueryHttpError } from "@/src/queries/http";
import {
  useClearLabourDay,
  useMarkLabourDay,
  type AttendanceStatus,
  type LabourSheet,
  type LabourSheetRow,
} from "@/src/queries/labour-attendance";

import {
  isRowDirty,
  isTimedStatus,
  labourMarkPayload,
  labourSheetDefaults,
  labourSheetFormSchema,
  newOvertimeLine,
  NO_SHIFT,
  previewEarned,
  SHIFT_OPTIONS,
  STATUS_LABELS,
  STATUS_OPTIONS,
  TIMES_FIELDS,
  withStatus,
  withTimes,
  withYesterday,
  type LabourRowDraft,
  type LabourSheetFormValues,
  type TimesField,
  type TimesPatch,
} from "./labour-sheet-form";
import { RowTimes, SetTimesDialog, workingDayLabel } from "./labour-times";

const ALL = "all";
const NO_CATEGORY = "none";

function categoryValue(id: string | undefined): string {
  return id == null || id === "" ? NO_CATEGORY : id;
}

type Form = {
  control: Control<LabourSheetFormValues>;
  setValue: UseFormSetValue<LabourSheetFormValues>;
  /** Replace a row's draft through a pure change (status, times, yesterday). */
  apply: (
    index: number,
    change: (draft: LabourRowDraft) => LabourRowDraft,
  ) => void;
};

/** A row's error: from the server (`details.labourId`) or the form check. */
type RowError = { message: string; field?: TimesField };

function isTimesField(value: unknown): value is TimesField {
  return TIMES_FIELDS.some((field) => field === value);
}

/** Decimal hours of the row's overtime lines, for the OT button. */
function overtimeTotal(draft: LabourRowDraft): string | null {
  let hundredths = 0;
  for (const line of draft.overtime) {
    const hours = Number(line.hours);
    if (line.hours.trim() !== "" && Number.isFinite(hours))
      hundredths += Math.round(hours * 100);
  }
  return hundredths > 0 ? String(hundredths / 100) : null;
}

function SimpleSelect({
  label,
  value,
  items,
  onChange,
  className,
}: {
  label: string;
  value: string;
  items: { value: string; label: string }[];
  onChange: (value: string) => void;
  className?: string;
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
        aria-label={label}
        className={cn("h-11 w-full", className)}
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

function OvertimeLines({
  index,
  row,
  sheet,
  form,
  financial,
}: {
  index: number;
  row: LabourSheetRow;
  sheet: LabourSheet;
  form: Form;
  financial: boolean;
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: `rows.${index}.overtime`,
  });
  const lines = useWatch({
    control: form.control,
    name: `rows.${index}.overtime`,
  });
  const categories = [
    { value: NO_CATEGORY, label: "No category" },
    ...sheet.labourCategories.map((item) => ({
      value: item.id,
      label: item.name,
    })),
  ];
  // A category the line already has but the picker no longer offers.
  for (const line of lines)
    if (
      line.labourCategoryId !== "" &&
      !categories.some((item) => item.value === line.labourCategoryId)
    )
      categories.push({
        value: line.labourCategoryId,
        label: "Other category",
      });
  return (
    <div className="bg-muted/40 space-y-3 rounded-lg border p-3">
      {fields.length === 0 ? (
        <p className="text-muted-foreground text-sm">No overtime.</p>
      ) : null}
      {fields.map((field, line) => (
        <div
          key={field.id}
          className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(8rem,1fr)_6rem_8rem_auto] sm:items-end"
        >
          {lines[line]?.fromTimes === true ? (
            <p className="text-muted-foreground col-span-2 flex flex-wrap items-center gap-2 text-xs sm:col-span-4">
              <Badge variant="secondary">From times</Badge>
              Follows check-in and check-out. Change the hours to set them
              yourself.
            </p>
          ) : null}
          <div className="col-span-2 space-y-1 sm:col-span-1">
            <Label className="text-xs">Labour Category</Label>
            <SimpleSelect
              label={`${row.name} overtime ${String(line + 1)} category`}
              value={categoryValue(lines[line]?.labourCategoryId)}
              items={categories}
              onChange={(value) => {
                form.setValue(
                  `rows.${index}.overtime.${line}.labourCategoryId`,
                  value === NO_CATEGORY ? "" : value,
                  { shouldDirty: true },
                );
              }}
            />
          </div>
          <div className="space-y-1">
            <Label
              htmlFor={`ot-${row.labourId}-${String(line)}-hours`}
              className="text-xs"
            >
              Hours
            </Label>
            <Input
              id={`ot-${row.labourId}-${String(line)}-hours`}
              aria-label={`${row.name} overtime ${String(line + 1)} hours`}
              inputMode="decimal"
              className="h-11"
              value={lines[line]?.hours ?? ""}
              onChange={(event) => {
                form.setValue(
                  `rows.${index}.overtime.${line}.hours`,
                  event.target.value,
                  { shouldDirty: true },
                );
                // Typed hours no longer follow the times (ADR CM-0011).
                if (lines[line]?.fromTimes === true)
                  form.setValue(
                    `rows.${index}.overtime.${line}.fromTimes`,
                    false,
                    { shouldDirty: true },
                  );
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Rate / hour</Label>
            {financial ? (
              <MoneyInput
                aria-label={`${row.name} overtime ${String(line + 1)} rate`}
                className="h-11"
                value={lines[line]?.rate ?? ""}
                onChange={(event) => {
                  form.setValue(
                    `rows.${index}.overtime.${line}.rate`,
                    event.target.value,
                    { shouldDirty: true },
                  );
                }}
              />
            ) : (
              <p className="text-muted-foreground flex h-11 items-center text-sm">
                Labourer&apos;s OT wage
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11"
            aria-label={`Remove ${row.name} overtime ${String(line + 1)}`}
            onClick={() => {
              remove(line);
            }}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        className="h-10"
        onClick={() => {
          append(newOvertimeLine(row));
        }}
      >
        <Plus /> Add overtime line
      </Button>
    </div>
  );
}

function ReadOnlyRow({ row }: { row: LabourSheetRow }) {
  const day = row.attendance;
  return (
    <li
      aria-label={row.name}
      className="bg-muted/30 flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"
    >
      <div>
        <p className="font-medium">{row.name}</p>
        <p className="text-muted-foreground text-xs">
          {row.isActive ? "No longer on this Project" : "Inactive"} · read-only
        </p>
      </div>
      {day == null ? null : (
        <span className="text-sm">
          {STATUS_LABELS[day.status]}
          {day.isPaidLeave ? " (paid)" : ""}
          {day.checkIn == null
            ? ""
            : ` · ${day.checkIn}–${day.checkOut ?? "…"}`}
          {Number(day.overtimeHours) > 0 ? ` · ${day.overtimeHours} h OT` : ""}
          {day.total == null ? "" : ` · ${formatPaise(day.total)}`}
        </span>
      )}
    </li>
  );
}

function SheetRow({
  index,
  row,
  sheet,
  date,
  form,
  financial,
  selected,
  onSelect,
  error,
}: {
  index: number;
  row: LabourSheetRow;
  sheet: LabourSheet;
  date: string;
  form: Form;
  financial: boolean;
  selected: boolean;
  onSelect: (on: boolean) => void;
  error: RowError | undefined;
}) {
  const draft = useWatch({ control: form.control, name: `rows.${index}` });
  const [open, setOpen] = useState(
    draft.overtime.length > 0 && row.attendance == null,
  );
  const dirty = isRowDirty(row, draft);
  const preview = financial ? previewEarned(row, draft, date) : null;
  const timed = isTimedStatus(draft.status);
  const overtimeHours = overtimeTotal(draft);
  const setStatus = (status: AttendanceStatus) => {
    form.apply(index, (current) => withStatus(row, current, status));
  };
  const setTimes = (patch: TimesPatch) => {
    form.apply(index, (current) => withTimes(row, current, patch));
  };
  // A field error shows on the field; anything else under the row.
  const onField = error?.field != null && timed;
  const shiftItems = [
    { value: NO_SHIFT, label: "No shift" },
    ...SHIFT_OPTIONS.map((shift) => ({ value: shift, label: shift })),
  ];
  if (
    draft.shift !== "" &&
    !SHIFT_OPTIONS.some((shift) => shift === draft.shift)
  )
    shiftItems.push({ value: draft.shift, label: draft.shift });

  return (
    <li
      aria-label={row.name}
      data-dirty={dirty ? "true" : undefined}
      className={cn(
        "bg-card space-y-3 rounded-xl border p-3",
        dirty && "border-primary/60 ring-primary/20 ring-2",
        error != null && "border-destructive",
      )}
    >
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[auto_minmax(10rem,1fr)_auto_9rem_12rem] lg:items-center">
        <div className="flex items-start gap-3 lg:contents">
          <Checkbox
            aria-label={`Select ${row.name}`}
            className="mt-1 size-5 lg:mt-0"
            checked={selected}
            onCheckedChange={(on) => {
              onSelect(on);
            }}
          />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 font-medium">
              {row.name}
              {row.labourCode == null ? null : (
                <span className="text-muted-foreground text-xs">
                  {row.labourCode}
                </span>
              )}
              {dirty ? (
                <span
                  className="bg-primary inline-block size-2 rounded-full"
                  title="Unsaved change"
                >
                  <span className="sr-only">Unsaved change</span>
                </span>
              ) : null}
            </p>
            <p className="text-muted-foreground text-xs">
              {[
                row.labourCategory?.name,
                row.supervisor?.name,
                row.wageType === "monthly" ? "Monthly" : "Daily",
                workingDayLabel(row),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {row.isWeeklyHoliday ? (
                <Badge variant="secondary">Weekly holiday</Badge>
              ) : null}
              {row.attendance != null ? (
                <Badge variant="outline">Saved</Badge>
              ) : null}
            </div>
          </div>
        </div>

        <ToggleGroup
          aria-label={`${row.name} status`}
          variant="outline"
          spacing={0}
          className="w-full lg:w-auto"
          value={draft.status === "" ? [] : [draft.status]}
          onValueChange={(value: string[]) => {
            const next = value[0] as AttendanceStatus | undefined;
            if (next != null) setStatus(next);
          }}
        >
          {STATUS_OPTIONS.map((option) => (
            <ToggleGroupItem
              key={option.value}
              value={option.value}
              aria-label={`${row.name} ${option.label}`}
              className="data-[pressed]:bg-primary data-[pressed]:text-primary-foreground h-11 flex-1 px-3 lg:flex-none"
            >
              {option.short}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {timed ? (
          <div className="lg:col-span-3 lg:col-start-3 lg:row-start-2">
            <RowTimes
              row={row}
              draft={draft}
              serverError={
                error?.field == null
                  ? undefined
                  : { field: error.field, message: error.message }
              }
              onChange={setTimes}
            />
          </div>
        ) : null}

        <SimpleSelect
          label={`${row.name} shift`}
          value={draft.shift === "" ? NO_SHIFT : draft.shift}
          items={shiftItems}
          onChange={(value) => {
            form.setValue(
              `rows.${index}.shift`,
              value === NO_SHIFT ? "" : value,
              {
                shouldDirty: true,
              },
            );
          }}
        />

        {/* A fixed column on desktop, so every row's status lines up. */}
        <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
          <Button
            type="button"
            variant="outline"
            className="h-11 min-w-20 justify-between"
            aria-expanded={open}
            aria-label={`${row.name} overtime`}
            disabled={draft.status === "absent"}
            onClick={() => {
              setOpen((value) => !value);
            }}
          >
            OT
            {overtimeHours == null ? "" : ` ${overtimeHours} h`}
            <ChevronDown
              className={cn("transition-transform", open && "rotate-180")}
            />
          </Button>
          {preview == null ? null : (
            <span
              className="text-sm font-medium tabular-nums lg:ml-auto"
              aria-label={`${row.name} earns`}
            >
              {formatPaise(preview)}
            </span>
          )}
        </div>
      </div>

      {draft.status === "on_leave" ? (
        <label className="flex items-center gap-3 text-sm">
          <Switch
            aria-label={`${row.name} paid leave`}
            checked={draft.isPaidLeave}
            onCheckedChange={(on) => {
              form.setValue(`rows.${index}.isPaidLeave`, on, {
                shouldDirty: true,
              });
            }}
          />
          Paid Leave
        </label>
      ) : null}

      {open && draft.status !== "absent" ? (
        <OvertimeLines
          index={index}
          row={row}
          sheet={sheet}
          form={form}
          financial={financial}
        />
      ) : null}

      {error == null || onField ? null : (
        <p role="alert" className="text-destructive text-sm">
          {error.message}
        </p>
      )}
    </li>
  );
}

function ClearDayDialog({
  open,
  onOpenChange,
  projectId,
  date,
  rows,
  onCleared,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  date: string;
  rows: LabourSheetRow[];
  onCleared: (count: number) => void;
}) {
  const clear = useClearLabourDay();
  const [error, setError] = useState<string>();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Clear {rows.length} labourer{rows.length === 1 ? "" : "s"}&apos;
            day?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Their attendance for {date} is removed and its wages are taken off
            their balances.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FormAlert message={error} />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={clear.isPending}
            onClick={() => {
              const expected: Record<string, string> = {};
              for (const row of rows)
                if (row.attendance != null)
                  expected[row.labourId] = row.attendance.updatedAt;
              clear.mutate(
                {
                  projectId,
                  date,
                  labourIds: rows.map((row) => row.labourId),
                  expected,
                },
                {
                  onSuccess: () => {
                    onOpenChange(false);
                    onCleared(rows.length);
                  },
                  onError: (failure) => {
                    setError(
                      failure instanceof QueryHttpError
                        ? failure.message
                        : "Something went wrong. Please try again.",
                    );
                  },
                },
              );
            }}
          >
            Clear day
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function labourIdOf(details: unknown): string | null {
  if (details != null && typeof details === "object" && "labourId" in details) {
    const value = details.labourId;
    return typeof value === "string" ? value : null;
  }
  return null;
}

/** `details.field` when it names one of the row's time fields. */
function timesFieldOf(details: unknown): TimesField | undefined {
  if (details != null && typeof details === "object" && "field" in details)
    return isTimesField(details.field) ? details.field : undefined;
  return undefined;
}

/**
 * The marking sheet for one date (CM-211): a row per labourer with status
 * buttons, Paid Leave on Leave, shift and overtime lines; check-in,
 * check-out and break on Present / Half Day with overtime from the times
 * (CM-220, ADR CM-0011); multi-select bulk marks and "Set times", "Mark all
 * present" and "Copy yesterday". Save sends only the rows that changed, each
 * with its loaded `updatedAt`.
 */
export function LabourMarkingSheet({
  projectId,
  date,
  sheet,
  onSaved,
}: {
  projectId: string;
  date: string;
  sheet: LabourSheet;
  onSaved: (message: string) => void;
}) {
  const financial = sheet.totals.earned != null;
  const { control, setValue, handleSubmit, getValues } =
    useForm<LabourSheetFormValues>({
      resolver: zodResolver(labourSheetFormSchema),
      defaultValues: labourSheetDefaults(sheet),
    });
  const apply: Form["apply"] = (index, change) => {
    const before = getValues(`rows.${index}`);
    const after = change(before);
    const dirty = { shouldDirty: true };
    if (after.status !== before.status)
      setValue(`rows.${index}.status`, after.status, dirty);
    if (after.isPaidLeave !== before.isPaidLeave)
      setValue(`rows.${index}.isPaidLeave`, after.isPaidLeave, dirty);
    if (after.shift !== before.shift)
      setValue(`rows.${index}.shift`, after.shift, dirty);
    if (after.checkIn !== before.checkIn)
      setValue(`rows.${index}.checkIn`, after.checkIn, dirty);
    if (after.checkOut !== before.checkOut)
      setValue(`rows.${index}.checkOut`, after.checkOut, dirty);
    if (after.breakMinutes !== before.breakMinutes)
      setValue(`rows.${index}.breakMinutes`, after.breakMinutes, dirty);
    if (JSON.stringify(after.overtime) !== JSON.stringify(before.overtime))
      setValue(`rows.${index}.overtime`, after.overtime, dirty);
  };
  const form: Form = { control, setValue, apply };
  const rows = useWatch({ control, name: "rows" });
  const mark = useMarkLabourDay();
  const [search, setSearch] = useState("");
  const [supervisorId, setSupervisorId] = useState(ALL);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<Record<string, RowError>>({});
  const [formError, setFormError] = useState<string>();
  const [clearing, setClearing] = useState(false);
  const [settingTimes, setSettingTimes] = useState(false);
  const [notice, setNotice] = useState<string>();

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return sheet.labourers
      .map((row, index) => ({ row, index }))
      .filter(
        ({ row }) =>
          (supervisorId === ALL || row.supervisor?.id === supervisorId) &&
          (term === "" ||
            row.name.toLowerCase().includes(term) ||
            (row.labourCode ?? "").toLowerCase().includes(term)),
      );
  }, [sheet.labourers, search, supervisorId]);
  const markable = visible.filter(({ row }) => row.canMark);
  const dirtyCount = sheet.labourers.filter((row, index) => {
    const draft = rows[index];
    return draft != null && isRowDirty(row, draft);
  }).length;
  const selectedRows = sheet.labourers.filter((row) =>
    selected.has(row.labourId),
  );
  const selectedSaved = selectedRows.filter((row) => row.attendance != null);
  const selectedIndexes = sheet.labourers.flatMap((row, index) =>
    row.canMark && selected.has(row.labourId) ? [index] : [],
  );
  const timedIndexes = selectedIndexes.filter((index) =>
    isTimedStatus(rows[index]?.status ?? ""),
  );
  const allSelected =
    markable.length > 0 &&
    markable.every(({ row }) => selected.has(row.labourId));
  const hasYesterday = markable.some(
    ({ row }) => row.yesterday != null && row.attendance == null,
  );

  const setStatusAt = (index: number, status: AttendanceStatus) => {
    const row = sheet.labourers[index];
    if (row != null) apply(index, (draft) => withStatus(row, draft, status));
  };

  const bulk = (status: AttendanceStatus) => {
    sheet.labourers.forEach((row, index) => {
      if (row.canMark && selected.has(row.labourId)) setStatusAt(index, status);
    });
  };

  const submit = handleSubmit(
    (values) => {
      setRowErrors({});
      setFormError(undefined);
      const payload = labourMarkPayload(projectId, date, sheet, values);
      if (payload == null) {
        setFormError("Nothing to save: mark a status first.");
        return;
      }
      mark.mutate(payload, {
        onSuccess: (saved) => {
          onSaved(
            `Saved ${String(saved.items.length)} Labour${saved.items.length === 1 ? "" : "s"}.`,
          );
        },
        onError: (failure) => {
          if (failure instanceof QueryHttpError) {
            const labourId = labourIdOf(failure.details);
            if (labourId != null) {
              setRowErrors({
                [labourId]: {
                  message: failure.message,
                  field: timesFieldOf(failure.details),
                },
              });
              const name =
                sheet.labourers.find((row) => row.labourId === labourId)
                  ?.name ?? "a Labour";
              setFormError(`Not saved: see ${name}.`);
              return;
            }
            setFormError(failure.message);
            return;
          }
          setFormError("Something went wrong. Please try again.");
        },
      });
    },
    (errors) => {
      const found: Record<string, RowError> = {};
      const values = getValues();
      type LineError = {
        hours?: { message?: string };
        rate?: { message?: string };
      };
      type FieldErrors = {
        overtime?: { message?: string } & Partial<Record<number, LineError>>;
      } & Partial<Record<TimesField, { message?: string }>>;
      const fieldErrors = (errors.rows ?? []) as unknown as Partial<
        Record<number, FieldErrors>
      >;
      values.rows.forEach((draft, index) => {
        const rowError = fieldErrors[index];
        if (rowError == null) return;
        const field = TIMES_FIELDS.find(
          (name) => rowError[name]?.message != null,
        );
        if (field != null) {
          found[draft.labourId] = {
            message: rowError[field]?.message ?? "Check the times.",
            field,
          };
          return;
        }
        const lines = draft.overtime.map((_, at) => rowError.overtime?.[at]);
        const line = lines.find((item) => item != null);
        found[draft.labourId] = {
          message:
            rowError.overtime?.message ??
            line?.hours?.message ??
            line?.rate?.message ??
            "Check this row.",
        };
      });
      setRowErrors(found);
      setFormError("Some rows need fixing.");
    },
  );

  return (
    <form
      aria-label="Labour attendance"
      className="space-y-4 pb-20 lg:pb-0"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="relative w-full sm:w-64">
          <Search className="text-muted-foreground pointer-events-none absolute top-3 left-3 size-4" />
          <Input
            aria-label="Search Labours"
            placeholder="Search name or Labour Id"
            className="h-10 pl-9"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />
        </div>
        {sheet.supervisors.length > 0 ? (
          <SimpleSelect
            label="Supervisor"
            className="h-10 sm:w-52"
            value={supervisorId}
            items={[
              { value: ALL, label: "All supervisors" },
              ...sheet.supervisors.map((item) => ({
                value: item.id,
                label: item.name,
              })),
            ]}
            onChange={setSupervisorId}
          />
        ) : null}
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <Button
            type="button"
            variant="outline"
            className="h-10"
            title="Every visible Labour Present, except weekly holidays"
            disabled={markable.length === 0}
            onClick={() => {
              for (const { row, index } of markable)
                if (!row.isWeeklyHoliday) setStatusAt(index, "present");
            }}
          >
            <UserCheck /> Mark all present
          </Button>
          {hasYesterday ? (
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={() => {
                for (const { row, index } of markable) {
                  if (
                    row.yesterday == null ||
                    row.attendance != null ||
                    row.isWeeklyHoliday
                  )
                    continue;
                  apply(index, (draft) => withYesterday(row, draft));
                }
              }}
            >
              <ClipboardCopy /> Copy yesterday
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            aria-label="Select all shown"
            className="size-5"
            checked={allSelected}
            onCheckedChange={(on) => {
              setSelected((current) => {
                const next = new Set(current);
                for (const { row } of markable)
                  if (on) next.add(row.labourId);
                  else next.delete(row.labourId);
                return next;
              });
            }}
          />
          {selected.size > 0
            ? `${String(selected.size)} selected`
            : "Select all"}
        </label>
        {selected.size > 0 ? (
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Bulk actions"
          >
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                bulk("present");
              }}
            >
              Mark selected Present
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                bulk("absent");
              }}
            >
              Mark selected Absent
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                bulk("holiday");
              }}
            >
              Mark selected Holiday
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setNotice(undefined);
                setSettingTimes(true);
              }}
            >
              <Clock /> Set times
            </Button>
            {selectedSaved.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="text-destructive"
                onClick={() => {
                  setClearing(true);
                }}
              >
                Clear day ({selectedSaved.length})
              </Button>
            ) : null}
          </div>
        ) : null}
        <span
          className="text-muted-foreground ml-auto text-sm"
          aria-live="polite"
        >
          {notice == null ? "" : `${notice} · `}
          {sheet.totals.marked} saved
          {dirtyCount > 0 ? ` · ${String(dirtyCount)} unsaved` : ""}
          {sheet.totals.earned == null
            ? ""
            : ` · ${formatPaise(sheet.totals.earned + (sheet.totals.overtimeAmount ?? 0))} wages`}
        </span>
      </div>

      {visible.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border p-6 text-center text-sm">
          No Labour matches the filter.
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map(({ row, index }) =>
            row.canMark ? (
              <SheetRow
                key={row.labourId}
                index={index}
                row={row}
                sheet={sheet}
                date={date}
                form={form}
                financial={financial}
                selected={selected.has(row.labourId)}
                onSelect={(on) => {
                  setSelected((current) => {
                    const next = new Set(current);
                    if (on) next.add(row.labourId);
                    else next.delete(row.labourId);
                    return next;
                  });
                }}
                error={rowErrors[row.labourId]}
              />
            ) : (
              <ReadOnlyRow key={row.labourId} row={row} />
            ),
          )}
        </ul>
      )}

      <div className="bg-background/95 fixed inset-x-0 bottom-0 z-10 flex items-center gap-3 border-t p-3 lg:static lg:border-0 lg:bg-transparent lg:p-0">
        <FormAlert message={formError} />
        <Button
          type="submit"
          className="ml-auto h-11 min-w-32"
          disabled={mark.isPending || dirtyCount === 0}
        >
          {mark.isPending
            ? "Saving…"
            : dirtyCount > 0
              ? `Save ${String(dirtyCount)}`
              : "Save"}
        </Button>
      </div>

      <SetTimesDialog
        open={settingTimes}
        onOpenChange={setSettingTimes}
        eligible={timedIndexes.length}
        skipped={selectedIndexes.length - timedIndexes.length}
        onApply={(patch) => {
          for (const index of timedIndexes) {
            const row = sheet.labourers[index];
            if (row != null)
              apply(index, (draft) => withTimes(row, draft, patch));
          }
          const skipped = selectedIndexes.length - timedIndexes.length;
          setNotice(
            `Times set for ${String(timedIndexes.length)} Labour${timedIndexes.length === 1 ? "" : "s"}${skipped > 0 ? `, ${String(skipped)} skipped` : ""}`,
          );
          setSettingTimes(false);
        }}
      />

      <ClearDayDialog
        open={clearing}
        onOpenChange={setClearing}
        projectId={projectId}
        date={date}
        rows={selectedSaved}
        onCleared={(count) => {
          setSelected(new Set());
          onSaved(`Cleared ${String(count)} Labour${count === 1 ? "" : "s"}.`);
        }}
      />
    </form>
  );
}
