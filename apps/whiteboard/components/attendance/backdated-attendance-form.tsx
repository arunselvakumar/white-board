"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

const schema = z.object({ date: z.iso.date() });
type Values = z.infer<typeof schema>;

export function BackdatedAttendanceForm({
  onOpen,
}: {
  onOpen: (date: string) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { date: "" },
  });
  return (
    <form
      className="space-y-3 rounded-xl border p-4"
      noValidate
      onSubmit={handleSubmit(async ({ date }) => {
        try {
          await onOpen(date);
        } catch (error) {
          setError("root", {
            message:
              error instanceof Error
                ? error.message
                : "Could not open Attendance.",
          });
        }
      })}
    >
      <p className="font-medium">Missed a day?</p>
      <p className="text-muted-foreground text-sm">
        Choose an earlier date. The Register uses the current scheduled roster
        for that weekday. Review the Students before saving Attendance.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="earlier-attendance-date">Earlier date</Label>
          <Input
            id="earlier-attendance-date"
            type="date"
            {...register("date")}
          />
        </div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Opening…" : "Open earlier Register"}
        </Button>
      </div>
      {errors.date && (
        <p role="alert" className="text-destructive text-sm">
          Choose a valid date.
        </p>
      )}
      {errors.root?.message && (
        <p role="alert" className="text-destructive text-sm">
          {errors.root.message}
        </p>
      )}
    </form>
  );
}
