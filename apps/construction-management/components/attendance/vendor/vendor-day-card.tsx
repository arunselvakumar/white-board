"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ClipboardCopy } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch, type UseFormReturn } from "react-hook-form";
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
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { formatPaise } from "@/components/money/money-input";
import { fieldForCode } from "@/lib/server-errors";
import {
  useClearVendorDay,
  useRecordVendorDay,
  type VendorAttendanceDay,
  type VendorAttendanceGridRow,
} from "@/src/queries/vendor-attendance";

import {
  isEmptyLine,
  lineErrorTarget,
  previewDayPay,
  previewLinePay,
  rateRows,
  vendorDayDefaults,
  vendorDayFormSchema,
  vendorDayPayload,
  type RateRow,
  type VendorDayFormValues,
} from "./vendor-day-form";

export const VENDOR_MASTERS_PATH = "/app/masters/vendors";

function vendorEditPath(id: string): string {
  return `${VENDOR_MASTERS_PATH}/${encodeURIComponent(id)}`;
}

function money(paise: number | null): string {
  return paise == null ? "—" : formatPaise(paise);
}

/** Recorded lines, read-only (a vendor that left the Project or was deactivated). */
function RecordedLines({ day }: { day: VendorAttendanceDay }) {
  return (
    <ul className="divide-y text-sm">
      {day.lines.map((line) => (
        <li
          key={`${line.shiftId}:${line.labourCategoryId}`}
          className="flex flex-wrap justify-between gap-2 py-2"
        >
          <span>
            {line.shiftName} · {line.labourCategoryName ?? "Deleted category"}
          </span>
          <span className="text-muted-foreground tabular-nums">
            {line.fullDayCount} full · {line.halfDayCount} half ·{" "}
            {line.overtimeHours} h OT
            {line.amount == null ? null : ` · ${formatPaise(line.amount)}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ClearDayDialog({
  open,
  onOpenChange,
  vendorName,
  day,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorName: string;
  day: VendorAttendanceDay;
}) {
  const clear = useClearVendorDay();
  const [error, setError] = useState<string>();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear {vendorName}&apos;s day?</AlertDialogTitle>
          <AlertDialogDescription>
            The headcount for {day.date} is removed and its pay is taken off the
            vendor&apos;s balance.
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
              clear.mutate(
                { id: day.id, expectedUpdatedAt: day.updatedAt },
                {
                  onSuccess: () => {
                    onOpenChange(false);
                  },
                  onError: (failure) => {
                    setError(fieldForCode(failure, {}).message);
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

function LineInputs({
  index,
  row,
  form,
  vendorName,
}: {
  index: number;
  row: RateRow;
  form: UseFormReturn<VendorDayFormValues>;
  vendorName: string;
}) {
  const line = useWatch({ control: form.control, name: `lines.${index}` });
  const errors = form.formState.errors.lines?.[index];
  const pay = previewLinePay(line, row);
  const label = `${vendorName} ${row.shiftName} ${row.labourCategoryName}`;
  return (
    <li className="space-y-2 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{row.labourCategoryName}</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {row.ratePerDay == null
            ? null
            : `${formatPaise(row.ratePerDay)}/day · ${formatPaise(row.overtimePerHour ?? 0)}/h OT`}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="space-y-1">
          <span className="text-muted-foreground text-xs">Full day</span>
          <Input
            aria-label={`${label} full day`}
            inputMode="numeric"
            autoComplete="off"
            placeholder="0"
            className="h-11 text-base tabular-nums"
            aria-invalid={errors?.full != null}
            {...form.register(`lines.${index}.full`)}
          />
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground text-xs">Half day</span>
          <Input
            aria-label={`${label} half day`}
            inputMode="numeric"
            autoComplete="off"
            placeholder="0"
            className="h-11 text-base tabular-nums"
            aria-invalid={errors?.half != null}
            {...form.register(`lines.${index}.half`)}
          />
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground text-xs">OT hours</span>
          <Input
            aria-label={`${label} OT hours`}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            className="h-11 text-base tabular-nums"
            aria-invalid={errors?.overtime != null}
            {...form.register(`lines.${index}.overtime`)}
          />
        </label>
      </div>
      <FieldError
        message={
          errors?.full?.message ??
          errors?.half?.message ??
          errors?.overtime?.message
        }
      />
      {pay == null || isEmptyLine(line) ? null : (
        <p
          className="text-muted-foreground text-right text-xs tabular-nums"
          aria-label={`${label} pay`}
        >
          {formatPaise(pay)}
        </p>
      )}
    </li>
  );
}

/**
 * One vendor's day (CM-213): per shift, a row per Labour Category on the
 * rate card with Full day, Half day and OT hours, the pay preview (the
 * server prices it again), Save, Clear day and Copy yesterday.
 */
export function VendorDayCard({
  projectId,
  date,
  row,
  yesterday,
}: {
  projectId: string;
  date: string;
  row: VendorAttendanceGridRow;
  /** The vendor's previous-day lines, for "Copy yesterday". */
  yesterday: VendorAttendanceDay | null;
}) {
  const rows = useMemo(() => rateRows(row), [row]);
  const day = row.attendance;
  const form = useForm<VendorDayFormValues>({
    resolver: zodResolver(vendorDayFormSchema),
    defaultValues: vendorDayDefaults(rows, day),
  });
  const record = useRecordVendorDay();
  const [formError, setFormError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [clearing, setClearing] = useState(false);
  const lines = useWatch({ control: form.control, name: "lines" });
  const total = previewDayPay(lines, rows);
  const recordedAt = day?.updatedAt ?? null;
  const { reset } = form;
  // A saved, cleared or reloaded day refills the form from the server.
  useEffect(() => {
    reset(vendorDayDefaults(rows, day));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refill only when the stored day changes
  }, [recordedAt, reset]);

  if (!row.canRecord) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{row.vendorName}</CardTitle>
          <CardDescription>
            {!row.hasRateCard
              ? "No rate card yet. Add a shift with Labour Category rates to record attendance."
              : !row.isActive
                ? "Inactive. Activate the vendor to record attendance."
                : "No longer on this Project."}
          </CardDescription>
          <CardAction>
            <Link
              href={vendorEditPath(row.vendorId)}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              {row.hasRateCard ? "Open vendor" : "Add rate card"}
            </Link>
          </CardAction>
        </CardHeader>
        {day == null ? null : (
          <>
            <CardContent>
              <RecordedLines day={day} />
            </CardContent>
            <CardFooter className="justify-between gap-2">
              <span className="font-medium tabular-nums">
                {money(day.totalPay)}
              </span>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setClearing(true);
                }}
              >
                Clear day
              </Button>
            </CardFooter>
            <ClearDayDialog
              open={clearing}
              onOpenChange={setClearing}
              vendorName={row.vendorName}
              day={day}
            />
          </>
        )}
      </Card>
    );
  }

  const submit = form.handleSubmit(async (values) => {
    setFormError(undefined);
    setSaved(false);
    if (values.lines.every(isEmptyLine)) {
      setFormError(
        day == null
          ? "Enter the headcount for at least one category."
          : "Every count is zero. Use Clear day to remove this day.",
      );
      return;
    }
    try {
      await record.mutateAsync(
        vendorDayPayload({
          projectId,
          vendorId: row.vendorId,
          date,
          values,
          expectedUpdatedAt: day?.updatedAt ?? null,
        }),
      );
      setSaved(true);
    } catch (failure) {
      const target = lineErrorTarget(failure, values.lines);
      const { message } = fieldForCode(failure, {});
      if (target == null) setFormError(message);
      else
        form.setError(`lines.${target.index}.${target.field}`, {
          type: "server",
          message,
        });
    }
  });

  const shifts = row.shifts.map((shift) => ({
    shift,
    indexes: rows
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.shiftId === shift.id),
  }));
  const canCopy = day == null && yesterday != null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{row.vendorName}</CardTitle>
        <CardDescription>
          {day == null ? (
            "Not recorded"
          ) : (
            <Badge variant="secondary">Recorded</Badge>
          )}
        </CardDescription>
        {canCopy ? (
          <CardAction>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                form.reset(vendorDayDefaults(rows, yesterday));
                setSaved(false);
              }}
            >
              <ClipboardCopy aria-hidden="true" />
              Copy yesterday
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <form
        noValidate
        aria-label={`${row.vendorName} attendance`}
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <CardContent className="space-y-4">
          {shifts.map(({ shift, indexes }) => (
            <section key={shift.id} aria-label={shift.name}>
              <h3 className="text-sm font-semibold">
                {shift.name}
                {shift.startTime == null ? null : (
                  <span className="text-muted-foreground ml-2 font-normal">
                    {shift.startTime}–{shift.endTime ?? ""}
                  </span>
                )}
              </h3>
              <ul className="divide-y">
                {indexes.map(({ item, index }) => (
                  <LineInputs
                    key={`${item.shiftId}:${item.labourCategoryId}`}
                    index={index}
                    row={item}
                    form={form}
                    vendorName={row.vendorName}
                  />
                ))}
              </ul>
            </section>
          ))}
          <FormAlert message={formError} />
          {saved ? (
            <p
              role="status"
              className="text-sm text-emerald-700 dark:text-emerald-400"
            >
              Saved.
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="flex-wrap justify-between gap-2 pt-4">
          <span className="font-semibold tabular-nums">
            {total == null ? null : (
              <>
                <span className="text-muted-foreground mr-2 text-sm font-normal">
                  Day total
                </span>
                <output aria-label={`${row.vendorName} day total`}>
                  {formatPaise(total)}
                </output>
              </>
            )}
          </span>
          <div className="flex gap-2">
            {day == null ? null : (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setClearing(true);
                }}
              >
                Clear day
              </Button>
            )}
            <Button type="submit" disabled={record.isPending}>
              {record.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </CardFooter>
      </form>
      {day == null ? null : (
        <ClearDayDialog
          open={clearing}
          onOpenChange={setClearing}
          vendorName={row.vendorName}
          day={day}
        />
      )}
    </Card>
  );
}
