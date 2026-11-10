"use client";

import { useState } from "react";
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

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { localToday } from "@/components/payments/payment-format";
import { QueryHttpError } from "@/src/queries/http";
import {
  useBookingAction,
  type BookingDetail,
} from "@/src/queries/sales-bookings";
import { SALES_LIMITS } from "@/src/sales/domain/sales-terms";

export type BookingDialogKind = "confirm" | "extend-hold" | "cancel";

const COPY: Record<
  BookingDialogKind,
  { title: string; description: string; date: string; action: string }
> = {
  confirm: {
    title: "Confirm the hold",
    description: "The unit becomes Booked from this date.",
    date: "Confirm date",
    action: "Confirm",
  },
  "extend-hold": {
    title: "Extend hold",
    description: "The unit stays On Hold until this date.",
    date: "Hold until",
    action: "Extend hold",
  },
  cancel: {
    title: "Cancel booking",
    description:
      "The unit is free to book again. The booking stays in its history.",
    date: "Cancel date",
    action: "Cancel booking",
  },
};

/**
 * Confirm (On Hold → Booked, with a date), Extend hold (a new Hold until)
 * and Cancel (a reason ≤ 500 and a date) of one booking (CM-0022 §7).
 */
export function BookingActionDialog({
  booking,
  kind,
  onOpenChange,
  today = localToday(),
}: {
  booking: BookingDetail;
  kind: BookingDialogKind | null;
  onOpenChange: (open: boolean) => void;
  today?: string;
}) {
  const action = useBookingAction(booking);
  const shown = kind ?? "confirm";
  const copy = COPY[shown];
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<{
    field: string;
    message: string;
  } | null>(null);
  const [error, setError] = useState<string | undefined>();
  const close = () => {
    setDate(today);
    setReason("");
    setProblem(null);
    setError(undefined);
    onOpenChange(false);
  };
  const submit = () => {
    setProblem(null);
    setError(undefined);
    if (date === "") {
      setProblem({
        field: "date",
        message: `Choose the ${copy.date.toLowerCase()}.`,
      });
      return;
    }
    if (shown === "cancel" && reason.trim() === "") {
      setProblem({
        field: "reason",
        message: "Say why the booking is cancelled.",
      });
      return;
    }
    const input =
      shown === "confirm"
        ? { action: shown, confirmedOn: date }
        : shown === "extend-hold"
          ? { action: shown, holdUntil: date }
          : { action: shown, reason: reason.trim(), cancelledOn: date };
    action.mutate(input, {
      onSuccess: close,
      onError: (caught) => {
        if (caught instanceof QueryHttpError) {
          const field = (caught.details as { field?: unknown } | undefined)
            ?.field;
          if (field === "reason")
            setProblem({ field: "reason", message: caught.message });
          else if (typeof field === "string")
            setProblem({ field: "date", message: caught.message });
          else setError(caught.message);
        } else setError("Something went wrong. Please try again.");
      },
    });
  };
  return (
    <Dialog
      open={kind != null}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <FormAlert message={error} />
          <div className="space-y-1.5">
            <Label htmlFor="booking-action-date" required>
              {copy.date}
            </Label>
            <Input
              id="booking-action-date"
              type="date"
              value={date}
              {...(shown === "extend-hold" ? { min: today } : { max: today })}
              aria-required
              aria-invalid={problem?.field === "date"}
              onChange={(event) => {
                setDate(event.target.value);
              }}
            />
            <FieldError
              message={problem?.field === "date" ? problem.message : undefined}
            />
          </div>
          {shown === "cancel" && (
            <div className="space-y-1.5">
              <Label htmlFor="booking-cancel-reason" required>
                Reason
              </Label>
              <Textarea
                id="booking-cancel-reason"
                value={reason}
                maxLength={SALES_LIMITS.cancelReason}
                aria-required
                aria-invalid={problem?.field === "reason"}
                onChange={(event) => {
                  setReason(event.target.value);
                }}
              />
              <FieldError
                message={
                  problem?.field === "reason" ? problem.message : undefined
                }
              />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Back
            </Button>
            <Button
              type="submit"
              variant={shown === "cancel" ? "destructive" : "default"}
              disabled={action.isPending}
            >
              {copy.action}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
