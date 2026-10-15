"use client";

import { CircleCheck, CircleX, Clock } from "lucide-react";
import { useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
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
import { formatDate } from "@/components/payments/payment-format";
import {
  INSPECTION_STATUS_LABELS,
  type InspectionStatus,
} from "@/src/tracking/domain/inspection";

export { formatDate };

/** "14:30" → "2:30 pm". */
export function timeText(time: string | null): string | null {
  if (time == null) return null;
  const [h = "0", m = "00"] = time.split(":");
  const hour = Number(h);
  const suffix = hour < 12 ? "am" : "pm";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(twelve)}:${m} ${suffix}`;
}

/** "14 Oct 2026, 2:30 pm" or "14 Oct 2026". */
export function inspectionWhen(inspection: {
  inspectionDate: string;
  inspectionTime: string | null;
}): string {
  const time = timeText(inspection.inspectionTime);
  const date = formatDate(inspection.inspectionDate);
  return time == null ? date : `${date}, ${time}`;
}

/** An instant in India time: "14 Oct 2026, 2:30 pm". */
export function instantText(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

const ICONS = {
  pending: Clock,
  approved: CircleCheck,
  rejected: CircleX,
} as const;

/** Pending for approval / Approved / Rejected: an icon and the words, never colour alone. */
export function InspectionStatusBadge({
  status,
}: {
  status: InspectionStatus;
}) {
  const Icon = ICONS[status];
  return (
    <Badge
      variant={
        status === "approved"
          ? "default"
          : status === "rejected"
            ? "destructive"
            : "secondary"
      }
    >
      <Icon aria-hidden="true" />
      {INSPECTION_STATUS_LABELS[status]}
    </Badge>
  );
}

const MAX = 500;

/**
 * Reject one or more Inspection Requests (CM-0019 §9, §10): a reason is
 * required; **Also raise a snag** is offered when the member holds Issues &
 * Snags Create (the server checks again). `onSubmit` rejects with a message
 * to show, or resolves to close.
 */
export function InspectionRejectDialog({
  open,
  onOpenChange,
  title,
  description,
  canRaiseSnag,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  canRaiseSnag: boolean;
  onSubmit: (input: { reason: string; raiseSnag: boolean }) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [raiseSnag, setRaiseSnag] = useState(false);
  const [problem, setProblem] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const close = () => {
    setReason("");
    setRaiseSnag(false);
    setProblem(undefined);
    setError(undefined);
    onOpenChange(false);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        // Stay open while the rejection is sent, to show its outcome.
        else if (!busy) close();
      }}
    >
      <DialogContent className="grid-cols-1">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="min-w-0 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const text = reason.trim();
            if (text === "") {
              setProblem("Write why it is rejected.");
              return;
            }
            if (text.length > MAX) {
              setProblem(`Use at most ${String(MAX)} characters.`);
              return;
            }
            setBusy(true);
            setError(undefined);
            onSubmit({ reason: text, raiseSnag: canRaiseSnag && raiseSnag })
              .then(close)
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
            <Label htmlFor="inspection-reject-reason">Reason</Label>
            <Textarea
              id="inspection-reject-reason"
              value={reason}
              maxLength={MAX}
              rows={3}
              aria-invalid={problem != null}
              onChange={(event) => {
                setReason(event.target.value);
                setProblem(undefined);
              }}
            />
            <FieldError message={problem} />
          </div>
          {canRaiseSnag && (
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <Checkbox
                id="inspection-raise-snag"
                checked={raiseSnag}
                onCheckedChange={(checked) => {
                  setRaiseSnag(checked);
                }}
                aria-describedby="inspection-raise-snag-hint"
              />
              <div className="min-w-0 space-y-1">
                <Label htmlFor="inspection-raise-snag">Also raise a snag</Label>
                <p
                  id="inspection-raise-snag-hint"
                  className="text-muted-foreground text-xs"
                >
                  An Issue & Snag in Quality for the contractor, at the same
                  location, with this reason.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={close}
            >
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={busy}>
              {busy ? "Rejecting…" : "Reject"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
