"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useFieldArray, useForm } from "react-hook-form";
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
import type {
  AttendanceRegister,
  AttendanceStatus,
} from "@/src/queries/attendance";

const statuses = [
  { value: "unmarked", label: "Unmarked" },
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "late", label: "Late" },
  { value: "excused", label: "Excused" },
] as const;
const schema = z.object({
  marks: z.array(
    z.object({
      enrollmentId: z.uuid(),
      studentName: z.string(),
      status: z.enum(["unmarked", "present", "absent", "late", "excused"]),
      note: z.string().max(500),
    }),
  ),
});
type Values = z.infer<typeof schema>;

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
        status: mark.status,
        note: mark.note ?? "",
      })),
    },
  });
  const { fields } = useFieldArray({ control, name: "marks" });
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
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            fields.forEach((_, index) => {
              setValue(`marks.${index}.status`, "present");
            });
          }}
        >
          Mark all Present
        </Button>
      </div>
      <div className="space-y-3">
        {fields.map((mark, index) => (
          <div
            key={mark.id}
            className="grid gap-3 rounded-xl border p-4 sm:grid-cols-[1fr_11rem_1fr] sm:items-start"
          >
            <div className="font-medium">{mark.studentName}</div>
            <div className="space-y-1">
              <Label htmlFor={`attendance-status-${index}`}>
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
                      className="w-full"
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
        ))}
      </div>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving…" : "Save Attendance"}
      </Button>
    </form>
  );
}
