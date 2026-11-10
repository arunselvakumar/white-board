"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
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
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import {
  checkSubmission,
  classWorkQueries,
  type SubmissionView,
} from "@/src/queries/class-work";

import { errorMessage } from "./class-work-format";

const REMARK_LIMIT = 500;

const schema = z.object({
  remark: z
    .string()
    .trim()
    .max(
      REMARK_LIMIT,
      `Keep the remark to ${REMARK_LIMIT} characters or fewer`,
    ),
});

type Values = z.infer<typeof schema>;

export type CheckTarget = {
  studentName: string;
  submission: SubmissionView;
};

export function CheckSubmissionDialog({
  target,
  onOpenChange,
  batchId,
  homeworkId,
}: {
  /** The Submission being checked; null when the dialog is closed. */
  target: CheckTarget | null;
  onOpenChange: (open: boolean) => void;
  batchId: string;
  homeworkId: string;
}) {
  const checked = target?.submission.checkedAt != null;
  return (
    <Dialog open={target != null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {checked ? "Edit remark" : "Check Homework"}
          </DialogTitle>
          <DialogDescription>
            {target == null
              ? null
              : checked
                ? `Change the remark on ${target.studentName}’s Homework.`
                : `Mark ${target.studentName}’s Homework as checked. Once checked, it can’t be changed by the Student or a Parent.`}
          </DialogDescription>
        </DialogHeader>
        {target == null ? null : (
          <CheckForm
            target={target}
            batchId={batchId}
            homeworkId={homeworkId}
            onDone={() => {
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CheckForm({
  target,
  batchId,
  homeworkId,
  onDone,
}: {
  target: CheckTarget;
  batchId: string;
  homeworkId: string;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const checked = target.submission.checkedAt != null;
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { remark: target.submission.remark ?? "" },
  });
  const remark = useWatch({ control, name: "remark" });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        try {
          await checkSubmission(
            homeworkId,
            target.submission.id,
            values.remark === "" ? null : values.remark,
          );
        } catch (error) {
          setError("root", { message: errorMessage(error) });
          return;
        }
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: classWorkQueries.key.submissions(homeworkId),
          }),
          queryClient.invalidateQueries({
            queryKey: classWorkQueries.key.batch(batchId),
          }),
        ]);
        onDone();
      })}
    >
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="check-remark">
            Remark (visible to the Student and Parents)
          </Label>
          <span className="text-muted-foreground text-xs tabular-nums">
            {remark.length}/{REMARK_LIMIT}
          </span>
        </div>
        <Textarea
          id="check-remark"
          rows={3}
          maxLength={REMARK_LIMIT}
          placeholder="Optional. e.g. Good work. Check question 3 again."
          aria-invalid={errors.remark != null}
          {...register("remark")}
        />
        <FieldError message={errors.remark?.message} />
      </div>
      <FormAlert message={errors.root?.message} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : checked ? "Save remark" : "Mark checked"}
        </Button>
      </DialogFooter>
    </form>
  );
}
