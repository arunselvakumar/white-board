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
import { TrackingEntryFilesField } from "@/components/tracking/documents/tracking-entry-files-field";
import { QueryHttpError } from "@/src/queries/http";
import type { TrackingDocumentFile } from "@/src/queries/tracking-documents";
import {
  useCompleteTask,
  useRebaselineTask,
  useRecordProgress,
  useUpdateProgress,
  type TaskDetail,
  type TaskProgress,
} from "@/src/queries/tracking-tasks";
import { TASK_LIMITS } from "@/src/tracking/domain/task";

import { dateRange, days, quantity } from "./task-parts";

type Errors = Partial<
  Record<"progressDate" | "amount" | "remark" | "reason" | "form", string>
>;

const QUANTITY = /^\d{1,11}(\.\d{1,3})?$/;
const PERCENT = /^\d{1,3}(\.\d{1,2})?$/;

/** A server refusal on one of the dialog's fields, or on the whole form. */
function serverErrors(caught: unknown): Errors {
  if (!(caught instanceof QueryHttpError))
    return { form: "Something went wrong. Please try again." };
  const field = (caught.details as { field?: unknown } | undefined)?.field;
  if (field === "progressDate") return { progressDate: caught.message };
  if (field === "workQty" || field === "progressPct")
    return { amount: caught.message };
  if (field === "remark") return { remark: caught.message };
  if (field === "reason") return { reason: caught.message };
  return { form: caught.message };
}

/**
 * **Update Task Progress** (CM-0019 §4), or edit an update: a quantity
 * task takes the work done in this update (an increment in its unit), a
 * percent task the new percentage. Not after today. A remark and photos
 * go with it; photos join the Gallery.
 */
export function ProgressDialog({
  task,
  update,
  open,
  onClose,
}: {
  task: TaskDetail;
  /** Edit this update instead of recording a new one. */
  update?: TaskProgress | null;
  open: boolean;
  onClose: () => void;
}) {
  const record = useRecordProgress(task.id);
  const edit = useUpdateProgress();
  const quantityTask = task.kind === "quantity";
  const today = localToday();
  const [date, setDate] = useState(update?.progressDate ?? today);
  const [amount, setAmount] = useState(
    update == null
      ? ""
      : quantityTask
        ? (update.workQty ?? "")
        : String(update.progressPct ?? ""),
  );
  const [remark, setRemark] = useState(update?.remark ?? "");
  const [photos, setPhotos] = useState<TrackingDocumentFile[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const busy = record.isPending || edit.isPending;

  const save = () => {
    const next: Errors = {};
    if (date === "") next.progressDate = "Enter the date.";
    else if (date > today)
      next.progressDate = "Progress cannot be dated after today.";
    const value = amount.trim();
    if (quantityTask) {
      if (!QUANTITY.test(value) || Number(value) <= 0)
        next.amount = "Enter the work done, above 0, at most three decimals.";
    } else if (!PERCENT.test(value) || Number(value) > 100)
      next.amount = "Enter a percentage from 0 to 100.";
    if (remark.length > TASK_LIMITS.remark)
      next.remark = `Use at most ${String(TASK_LIMITS.remark)} characters.`;
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const body = {
      progressDate: date,
      ...(quantityTask ? { workQty: value } : { progressPct: Number(value) }),
      remark: remark.trim() === "" ? null : remark.trim(),
      fileIds: photos.map((file) => file.id),
    };
    const done = {
      onSuccess: () => {
        setPhotos([]);
        onClose();
      },
      onError: (caught: unknown) => {
        setErrors(serverErrors(caught));
      },
    };
    if (update == null) record.mutate(body, done);
    else
      edit.mutate(
        { ...body, progressId: update.id, expectedUpdatedAt: update.updatedAt },
        done,
      );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="grid max-h-[92vh] grid-cols-1 overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {update == null ? "Update Task Progress" : "Edit progress update"}
          </DialogTitle>
          <DialogDescription>
            {quantityTask
              ? `${task.label}: ${quantity(task.completedWorkQty, task.unit)} of ${quantity(task.totalWorkQty, task.unit)} done. Enter the work done in this update.`
              : `${task.label} is at ${String(task.progressPct)} %. Enter its progress now.`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="progress-date">Date</Label>
            <Input
              id="progress-date"
              type="date"
              max={today}
              value={date}
              aria-invalid={errors.progressDate != null}
              onChange={(event) => {
                setDate(event.target.value);
              }}
            />
            <FieldError message={errors.progressDate} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="progress-amount">
              {quantityTask
                ? `Work done (${task.unit?.name ?? "quantity"})`
                : "Progress (%)"}
            </Label>
            <Input
              id="progress-amount"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              aria-invalid={errors.amount != null}
              onChange={(event) => {
                setAmount(event.target.value);
              }}
            />
            <FieldError message={errors.amount} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="progress-remark">Remark</Label>
            <Textarea
              id="progress-remark"
              rows={2}
              value={remark}
              aria-invalid={errors.remark != null}
              onChange={(event) => {
                setRemark(event.target.value);
              }}
            />
            <FieldError message={errors.remark} />
          </div>
          <div className="min-w-0 sm:col-span-2">
            <TrackingEntryFilesField
              documentType="task"
              documentId={task.id}
              value={photos}
              onChange={setPhotos}
              label={update == null ? "Photos" : "Add photos"}
              disabled={busy}
            />
          </div>
        </div>
        <FormAlert message={errors.form} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * **Mark As Completed** (CM-0019 §4): records the update that brings the
 * task to 100 % — the remaining quantity, or 100 % — on the date chosen.
 */
export function CompleteDialog({
  task,
  open,
  onClose,
}: {
  task: TaskDetail;
  open: boolean;
  onClose: () => void;
}) {
  const complete = useCompleteTask(task.id);
  const today = localToday();
  const [date, setDate] = useState(today);
  const [remark, setRemark] = useState("");
  const [photos, setPhotos] = useState<TrackingDocumentFile[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const remaining =
    task.kind === "quantity" &&
    task.totalWorkQty != null &&
    task.completedWorkQty != null
      ? Number(task.totalWorkQty) - Number(task.completedWorkQty)
      : null;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="grid max-h-[92vh] grid-cols-1 overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mark {task.label} as completed</DialogTitle>
          <DialogDescription>
            {remaining != null
              ? `Records the remaining ${quantity(String(Number(remaining.toFixed(3))), task.unit)} as done, bringing it to 100 %.`
              : "Records progress of 100 %."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-w-0 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="complete-date">Completed on</Label>
            <Input
              id="complete-date"
              type="date"
              max={today}
              value={date}
              aria-invalid={errors.progressDate != null}
              onChange={(event) => {
                setDate(event.target.value);
              }}
            />
            <FieldError message={errors.progressDate} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="complete-remark">Remark</Label>
            <Textarea
              id="complete-remark"
              rows={2}
              value={remark}
              onChange={(event) => {
                setRemark(event.target.value);
              }}
            />
          </div>
          <TrackingEntryFilesField
            documentType="task"
            documentId={task.id}
            value={photos}
            onChange={setPhotos}
            label="Photos"
            disabled={complete.isPending}
          />
        </div>
        <FormAlert message={errors.form} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={complete.isPending}
            onClick={() => {
              if (date === "" || date > today) {
                setErrors({ progressDate: "Choose a date up to today." });
                return;
              }
              complete.mutate(
                {
                  progressDate: date,
                  remark: remark.trim() === "" ? null : remark.trim(),
                  fileIds: photos.map((file) => file.id),
                },
                {
                  onSuccess: () => {
                    setPhotos([]);
                    onClose();
                  },
                  onError: (caught) => {
                    setErrors(serverErrors(caught));
                  },
                },
              );
            }}
          >
            {complete.isPending ? "Saving…" : "Mark As Completed"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * **Re-baseline** (CM-0019 §3): the planned dates become the next baseline
 * version; the reason is kept with it in the history.
 */
export function RebaselineDialog({
  task,
  open,
  onClose,
}: {
  task: TaskDetail;
  open: boolean;
  onClose: () => void;
}) {
  const rebaseline = useRebaselineTask(task.id);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="grid grid-cols-1 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Re-baseline {task.label}</DialogTitle>
          <DialogDescription>
            The baseline moves from{" "}
            {dateRange(task.baselineStart, task.baselineEnd)} (
            {days(task.baselineDuration)}) to the planned{" "}
            {dateRange(task.startDate, task.dueDate)} (
            {days(task.plannedDuration)}). Earlier baselines stay in the
            history.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="rebaseline-reason">Reason</Label>
          <Textarea
            id="rebaseline-reason"
            rows={3}
            value={reason}
            aria-invalid={errors.reason != null}
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
          <FieldError message={errors.reason} />
        </div>
        <FormAlert message={errors.form} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={rebaseline.isPending}
            onClick={() => {
              if (reason.trim() === "") {
                setErrors({ reason: "Say why the baseline changes." });
                return;
              }
              rebaseline.mutate(
                { reason: reason.trim(), expectedUpdatedAt: task.updatedAt },
                {
                  onSuccess: () => {
                    setReason("");
                    onClose();
                  },
                  onError: (caught) => {
                    setErrors(serverErrors(caught));
                  },
                },
              );
            }}
          >
            {rebaseline.isPending ? "Saving…" : "Re-baseline"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
