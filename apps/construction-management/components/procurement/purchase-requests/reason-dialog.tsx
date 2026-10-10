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
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";

const MAX = 500;

/**
 * Asks for a reason (Reject, Close): required, at most 500 characters.
 * `onSubmit` rejects with a message to show, or resolves to close.
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  action,
  destructive = true,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** The confirm button's label: "Reject", "Close PO". */
  action: string;
  destructive?: boolean;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setReason("");
          setProblem(undefined);
          setError(undefined);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description != null && (
            <DialogDescription>{description}</DialogDescription>
          )}
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const text = reason.trim();
            if (text === "") {
              setProblem("Write a reason.");
              return;
            }
            if (text.length > MAX) {
              setProblem(`Use at most ${String(MAX)} characters.`);
              return;
            }
            setBusy(true);
            setError(undefined);
            onSubmit(text)
              .then(() => {
                setReason("");
                onOpenChange(false);
              })
              .catch((failure: unknown) => {
                setError(
                  failure instanceof Error
                    ? failure.message
                    : "Something went wrong. Please try again.",
                );
              })
              .finally(() => {
                setBusy(false);
              });
          }}
        >
          <FormAlert message={error} />
          <div className="space-y-1.5">
            <Label htmlFor="decision-reason">Reason</Label>
            <Textarea
              id="decision-reason"
              value={reason}
              maxLength={MAX}
              aria-invalid={problem != null}
              onChange={(event) => {
                setReason(event.target.value);
                setProblem(undefined);
              }}
            />
            <FieldError message={problem} />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={destructive ? "destructive" : "default"}
              disabled={busy}
            >
              {action}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
