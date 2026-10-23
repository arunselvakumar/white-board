"use client";

import { useId, useState, type ReactNode } from "react";
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

const REASON_MAX = 500;

function reasonProblem(reason: string, empty: string): string | undefined {
  const text = reason.trim();
  if (text === "") return empty;
  if (text.length > REASON_MAX)
    return `Use at most ${String(REASON_MAX)} characters.`;
  return undefined;
}

/**
 * A dialog that asks for a reason before a Work Order step: reject,
 * cancel or amend. `onConfirm` gets the reason; it reports a server error
 * by returning its message.
 */
export function ReasonDialog({
  title,
  description,
  label = "Reason",
  empty,
  confirm,
  busyLabel,
  destructive = false,
  pending,
  error,
  onConfirm,
  onClose,
  children,
}: {
  title: string;
  description: ReactNode;
  label?: string;
  /** Shown when the reason is left blank. */
  empty: string;
  confirm: string;
  busyLabel: string;
  destructive?: boolean;
  pending: boolean;
  /** A server error to show. */
  error: string | undefined;
  onConfirm: (reason: string) => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  const id = useId();
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | undefined>();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="grid-cols-1 sm:max-w-md">
        <form
          noValidate
          className="flex min-w-0 flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            const found = reasonProblem(reason, empty);
            setProblem(found);
            if (found == null) onConfirm(reason.trim());
          }}
        >
          <DialogHeader>
            <DialogTitle className="break-words">{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {children}
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-reason`} required>
              {label}
            </Label>
            <Textarea
              id={`${id}-reason`}
              rows={3}
              value={reason}
              aria-required
              aria-invalid={problem != null}
              onChange={(event) => {
                setReason(event.target.value);
              }}
            />
            <FieldError message={problem} />
          </div>
          <FormAlert message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Back
            </Button>
            <Button
              type="submit"
              variant={destructive ? "destructive" : "default"}
              disabled={pending}
            >
              {pending ? busyLabel : confirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Close an issued Work Order: the date it closed and why. */
export function CloseWorkOrderDialog({
  number,
  orderDate,
  today,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  number: string;
  orderDate: string;
  today: string;
  pending: boolean;
  error: string | undefined;
  onConfirm: (input: { closedOn: string; reason: string }) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [closedOn, setClosedOn] = useState(today);
  const [dateProblem, setDateProblem] = useState<string | undefined>();
  return (
    <ReasonDialog
      title={`Close Work Order ${number}?`}
      description="Closing marks the work complete; the close date starts the defects liability period. A bill still in draft or waiting for approval stops it."
      empty="Write why it is closed."
      confirm="Close Work Order"
      busyLabel="Closing…"
      pending={pending}
      error={error}
      onConfirm={(reason) => {
        if (closedOn === "" || closedOn < orderDate) {
          setDateProblem("Pick a date on or after the order date.");
          return;
        }
        setDateProblem(undefined);
        onConfirm({ closedOn, reason });
      }}
      onClose={onClose}
    >
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-closed-on`} required>
          Close date
        </Label>
        <Input
          id={`${id}-closed-on`}
          type="date"
          min={orderDate}
          value={closedOn}
          aria-required
          aria-invalid={dateProblem != null}
          onChange={(event) => {
            setClosedOn(event.target.value);
          }}
        />
        <FieldError message={dateProblem} />
      </div>
    </ReasonDialog>
  );
}
