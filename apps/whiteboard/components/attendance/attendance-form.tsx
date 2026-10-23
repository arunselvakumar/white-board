"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "@repo/ui/components/badge";
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
import type {
  AttendanceMark,
  AttendanceRegister,
  AttendanceStatus,
  RegisterNoticeView,
} from "@/src/queries/attendance";
import { ABSENCE_REASON_LABELS } from "@/src/training-institute/domain/absence-notice";
import {
  ATTENDANCE_STATUSES,
  ATTENDANCE_STATUS_LABELS,
} from "@/src/training-institute/domain/attendance-register";

const STATUS_ORDER = [
  "unmarked",
  "present",
  "absent",
  "informed_absent",
  "late",
  "excused",
] as const satisfies readonly AttendanceStatus[];
const statuses = STATUS_ORDER.map((value) => ({
  value,
  label: ATTENDANCE_STATUS_LABELS[value],
}));
const schema = z.object({
  marks: z.array(
    z.object({
      enrollmentId: z.uuid(),
      studentName: z.string(),
      status: z.enum(ATTENDANCE_STATUSES),
      note: z.string().max(500),
    }),
  ),
});
type Values = z.infer<typeof schema>;

/**
 * A Student with an Absence Notice starts as Informed absent while their mark
 * is still Unmarked; a saved mark is never overridden (ADR-0041).
 */
function initialStatus(mark: AttendanceMark): AttendanceStatus {
  return mark.status === "unmarked" && mark.notice != null
    ? "informed_absent"
    : mark.status;
}

function NoticeFlag({
  notice,
  id,
}: {
  notice: RegisterNoticeView;
  id: string;
}) {
  const by = notice.givenBy.role === "parent" ? "Parent" : "Student";
  return (
    <div id={id} className="mt-1.5 space-y-1 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge variant="secondary">Notice given</Badge>
        <span className="text-muted-foreground">
          {ABSENCE_REASON_LABELS[notice.reason]} · by {by} (
          {notice.givenBy.name})
        </span>
      </div>
      {notice.note && (
        <p className="text-muted-foreground break-words">“{notice.note}”</p>
      )}
    </div>
  );
}

export function AttendanceForm({
  register,
  onSave,
}: {
  register: AttendanceRegister;
  onSave: (
    marks: {
      enrollmentId: string;
      status: AttendanceStatus;
      note: string | null;
    }[],
  ) => Promise<void>;
}) {
  const {
    control,
    register: field,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      marks: register.marks.map((mark) => ({
        enrollmentId: mark.enrollmentId,
        studentName: mark.studentName,
        status: initialStatus(mark),
        note: mark.note ?? "",
      })),
    },
  });
  const { fields } = useFieldArray({ control, name: "marks" });
  const notices = new Map(
    register.marks.flatMap((mark) =>
      mark.notice == null ? [] : [[mark.enrollmentId, mark.notice] as const],
    ),
  );
  return (
    <form
      className="space-y-5"
      onSubmit={handleSubmit(async (values) => {
        try {
          await onSave(
            values.marks.map((mark) => ({
              enrollmentId: mark.enrollmentId,
              status: mark.status,
              note: mark.note.trim() || null,
            })),
          );
        } catch (error) {
          setError("root", {
            message:
              error instanceof Error
                ? error.message
                : "Could not save Attendance.",
          });
        }
      })}
    >
      {errors.root?.message && (
        <p role="alert" className="text-destructive">
          {errors.root.message}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
        {notices.size > 0 && (
          <p className="text-muted-foreground text-sm">
            Students who gave notice stay Informed absent.
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            fields.forEach((mark, index) => {
              // Leave Students with an Absence Notice as the form has them.
              if (notices.has(mark.enrollmentId)) return;
              setValue(`marks.${index}.status`, "present");
            });
          }}
        >
          Mark all Present
        </Button>
      </div>
      <div className="space-y-3">
        {fields.map((mark, index) => {
          const notice = notices.get(mark.enrollmentId);
          return (
            <div
              key={mark.id}
              className="grid gap-3 rounded-xl border p-4 sm:grid-cols-[1fr_11rem_1fr] sm:items-start"
            >
              <div className="min-w-0">
                <div className="font-medium">{mark.studentName}</div>
                {notice && (
                  <NoticeFlag
                    id={`attendance-notice-${index}`}
                    notice={notice}
                  />
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor={`attendance-status-${index}`} required>
                  Attendance for {mark.studentName}
                </Label>
                <Controller
                  name={`marks.${index}.status`}
                  control={control}
                  render={({ field: statusField }) => (
                    <Select
                      items={statuses.map((item) => ({ ...item }))}
                      value={statusField.value}
                      onValueChange={(value) => {
                        if (value) statusField.onChange(value);
                      }}
                    >
                      <SelectTrigger
                        id={`attendance-status-${index}`}
                        aria-required
                        className="w-full"
                        aria-describedby={
                          notice ? `attendance-notice-${index}` : undefined
                        }
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="start" alignItemWithTrigger={false}>
                        {statuses.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`attendance-note-${index}`}>
                  Note (optional)
                </Label>
                <Input
                  id={`attendance-note-${index}`}
                  {...field(`marks.${index}.note`)}
                />
                <p className="text-destructive text-xs">
                  {errors.marks?.[index]?.note?.message}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving…" : "Save Attendance"}
      </Button>
    </form>
  );
}
