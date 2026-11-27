"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId } from "react";
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

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  isResourcesChanged,
  useReloadProjectResources,
  useRemoveProjectLabour,
  type ProjectLabour,
} from "@/src/queries/project-resources";

const schema = z.object({
  lastDay: z.string().min(1, "Enter their last day on this Project"),
  remark: z.string().trim().max(500, "Use at most 500 characters"),
});

type Values = z.infer<typeof schema>;

const SERVER_FIELDS: Record<string, keyof Values> = {
  LAST_DAY_INVALID: "lastDay",
  TRANSFER_BEFORE_ATTENDANCE: "lastDay",
  TRANSFER_BEFORE_LAST_TRANSFER: "lastDay",
  REMARK_TOO_LONG: "remark",
};

/**
 * Take a Labour off the Project after their Last day (the Company's today
 * unless changed). Attendance, wages and payments already recorded stay.
 * A Last day before an attendance day on this Project is refused on the
 * field.
 */
export function RemoveLabourDialog({
  projectId,
  labour,
  today,
  onClose,
}: {
  projectId: string;
  /** The Labour to remove; null keeps the dialog closed. */
  labour: ProjectLabour | null;
  /** The Company's today, `YYYY-MM-DD`. */
  today: string;
  onClose: () => void;
}) {
  const id = useId();
  const remove = useRemoveProjectLabour(projectId);
  const reload = useReloadProjectResources(projectId);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { lastDay: today, remark: "" },
  });
  const errors = form.formState.errors;
  const { reset } = form;
  const resetMutation = remove.reset;

  useEffect(() => {
    if (labour != null) {
      reset({ lastDay: today, remark: "" });
      resetMutation();
    }
  }, [labour, today, reset, resetMutation]);

  const submit = form.handleSubmit(async (values) => {
    if (labour == null) return;
    try {
      await remove.mutateAsync({
        labourId: labour.id,
        lastDay: values.lastDay,
        remark: values.remark === "" ? null : values.remark,
      });
      onClose();
    } catch (error) {
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
      form.setError(field ?? "root", { message });
      if (isResourcesChanged(error)) void reload();
    }
  });

  return (
    <Dialog
      open={labour != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="grid-cols-1 sm:max-w-md">
        <form
          noValidate
          className="flex min-w-0 flex-col gap-4"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>Remove {labour?.name} from this Project</DialogTitle>
            <DialogDescription>
              Attendance, wages and payments already recorded stay. Their other
              Projects stay too.
            </DialogDescription>
          </DialogHeader>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={`${id}-last-day`} required>
              Last day
            </Label>
            <Input
              id={`${id}-last-day`}
              type="date"
              className="h-10"
              aria-required
              aria-invalid={errors.lastDay != null}
              aria-describedby={`${id}-last-day-hint`}
              {...form.register("lastDay")}
            />
            <p
              id={`${id}-last-day-hint`}
              className="text-muted-foreground text-xs"
            >
              Their last working day here; attendance can be marked up to it.
            </p>
            <FieldError message={errors.lastDay?.message} />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={`${id}-remark`}>Remark (optional)</Label>
            <Textarea
              id={`${id}-remark`}
              rows={2}
              maxLength={500}
              aria-invalid={errors.remark != null}
              {...form.register("remark")}
            />
            <FieldError message={errors.remark?.message} />
          </div>
          <FormAlert message={errors.root?.message} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={remove.isPending}
            >
              {remove.isPending ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
