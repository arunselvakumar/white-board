"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
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
import { Textarea } from "@repo/ui/components/textarea";

import { formatDate, type DateKey } from "@/lib/calendar-dates";
import type { Holiday } from "@/src/queries/calendar";

export type HolidayActions = {
  onDeclare: (input: {
    startDate: string;
    endDate: string;
    reason: string | null;
  }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
};

const schema = z
  .object({
    startDate: z.iso.date("Choose the first day."),
    endDate: z.iso.date("Choose the last day."),
    reason: z
      .string()
      .max(200, "Reason must be 200 characters or fewer.")
      .transform((value) => value.trim() || null),
  })
  .refine((value) => value.endDate >= value.startDate, {
    path: ["endDate"],
    message: "The last day must be on or after the first day.",
  });

export function holidayRangeLabel(holiday: {
  startDate: string;
  endDate: string;
}): string {
  const start = formatDate(holiday.startDate, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  if (holiday.startDate === holiday.endDate) return start;
  return `${start} – ${formatDate(holiday.endDate, { weekday: "short", month: "short", day: "numeric" })}`;
}

export function HolidaysDialog({
  open,
  onOpenChange,
  holidays,
  today,
  actions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holidays: Holiday[];
  today: DateKey;
  actions: HolidayActions;
}) {
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { startDate: today, endDate: today, reason: "" },
  });
  const upcoming = holidays.filter((holiday) => holiday.endDate >= today);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Holidays</DialogTitle>
          <DialogDescription>
            A Holiday cancels every Class in this Workspace on its dates.
            Students, Parents, and Teachers see it on their Calendar.
          </DialogDescription>
        </DialogHeader>

        <section aria-labelledby="upcoming-holidays" className="space-y-2">
          <h3 id="upcoming-holidays" className="font-medium">
            Upcoming Holidays
          </h3>
          {upcoming.length === 0 ? (
            <p className="text-muted-foreground">No Holidays declared.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {upcoming.map((holiday) => (
                <li
                  key={holiday.id}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{holidayRangeLabel(holiday)}</p>
                    {holiday.reason && (
                      <p className="text-muted-foreground truncate text-xs">
                        {holiday.reason}
                      </p>
                    )}
                  </div>
                  {holiday.startDate >= today && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={removing === holiday.id}
                      aria-label={`Remove Holiday ${holidayRangeLabel(holiday)}`}
                      onClick={() => {
                        setRemoving(holiday.id);
                        setRemoveError(null);
                        actions
                          .onRemove(holiday.id)
                          .catch((error: unknown) => {
                            setRemoveError(
                              error instanceof Error
                                ? error.message
                                : "Could not remove the Holiday.",
                            );
                          })
                          .finally(() => {
                            setRemoving(null);
                          });
                      }}
                    >
                      Remove
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {removeError && (
            <p role="alert" className="text-destructive text-sm">
              {removeError}
            </p>
          )}
        </section>

        <form
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit(async (values) => {
            try {
              await actions.onDeclare(values);
              reset({ startDate: today, endDate: today, reason: "" });
            } catch (error) {
              setError("root", {
                message:
                  error instanceof Error
                    ? error.message
                    : "Could not declare the Holiday.",
              });
            }
          })}
        >
          <h3 className="font-medium">Declare a Holiday</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="holiday-start">First day</Label>
              <Input
                id="holiday-start"
                type="date"
                min={today}
                aria-invalid={errors.startDate != null}
                {...register("startDate")}
              />
              {errors.startDate && (
                <p role="alert" className="text-destructive text-sm">
                  {errors.startDate.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="holiday-end">Last day</Label>
              <Input
                id="holiday-end"
                type="date"
                min={today}
                aria-invalid={errors.endDate != null}
                {...register("endDate")}
              />
              {errors.endDate && (
                <p role="alert" className="text-destructive text-sm">
                  {errors.endDate.message}
                </p>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="holiday-reason">Reason (optional)</Label>
            <Textarea
              id="holiday-reason"
              placeholder="Diwali, Pongal, exam break…"
              aria-invalid={errors.reason != null}
              {...register("reason")}
            />
            {errors.reason && (
              <p role="alert" className="text-destructive text-sm">
                {errors.reason.message}
              </p>
            )}
          </div>
          {errors.root?.message && (
            <p role="alert" className="text-destructive text-sm">
              {errors.root.message}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Declaring…" : "Declare Holiday"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
