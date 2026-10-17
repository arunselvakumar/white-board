"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Controller, useForm, type FieldPath } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { QueryHttpError } from "@/src/queries/http";
import {
  inquiryFormOptionsQuery,
  useInquiryTaskCommand,
  type InquiryTask,
} from "@/src/queries/sales-inquiries";
import { SALES_LIMITS } from "@/src/sales/domain/sales-terms";

import { InquirySelect, withCurrentOption } from "./inquiry-select";

const schema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Enter the task.")
    .max(
      SALES_LIMITS.taskTitle,
      `Use at most ${String(SALES_LIMITS.taskTitle)} characters.`,
    ),
  dueDate: z.string(),
  assigneeMemberId: z.string(),
});
type Values = z.infer<typeof schema>;

const SERVER_FIELDS: Record<string, FieldPath<Values>> = {
  title: "title",
  dueDate: "dueDate",
  assigneeMemberId: "assigneeMemberId",
};

/** Add or edit an Inquiry Task (CM-1004): Title, optional Due date and Assignee. */
export function InquiryTaskDialog({
  projectId,
  inquiryId,
  task,
  onClose,
}: {
  projectId: string;
  inquiryId: string;
  /** Null to add. */
  task: InquiryTask | null;
  onClose: () => void;
}) {
  const { data: options } = useSuspenseQuery(
    inquiryFormOptionsQuery(projectId),
  );
  const command = useInquiryTaskCommand(inquiryId);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: task?.title ?? "",
      dueDate: task?.dueDate ?? "",
      assigneeMemberId: task?.assignee?.id ?? "",
    },
  });
  const errors = form.formState.errors;
  const members = withCurrentOption(
    options.members.map((member) => ({ value: member.id, label: member.name })),
    task?.assignee,
    "not on this Project",
  );

  const submit = form.handleSubmit(async (values) => {
    const input = {
      title: values.title.trim(),
      dueDate: values.dueDate === "" ? null : values.dueDate,
      assigneeMemberId:
        values.assigneeMemberId === "" ? null : values.assigneeMemberId,
    };
    try {
      await command.mutateAsync(
        task == null
          ? { kind: "create", input }
          : {
              kind: "update",
              taskId: task.id,
              input,
              expectedUpdatedAt: task.updatedAt,
            },
      );
      onClose();
    } catch (caught) {
      if (caught instanceof QueryHttpError) {
        const raw = (caught.details as { field?: unknown } | undefined)?.field;
        const field = typeof raw === "string" ? SERVER_FIELDS[raw] : undefined;
        form.setError(field ?? "root", { message: caught.message });
        return;
      }
      form.setError("root", {
        message: "Something went wrong. Please try again.",
      });
    }
  });

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
          aria-label={task == null ? "Add task" : "Edit task"}
          className="flex min-w-0 flex-col gap-4"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>{task == null ? "Add task" : "Edit task"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="inquiry-task-title">Task</Label>
            <Input
              id="inquiry-task-title"
              autoComplete="off"
              placeholder="Send the brochure"
              aria-invalid={errors.title != null}
              {...form.register("title")}
            />
            <FieldError message={errors.title?.message} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="inquiry-task-due">Due date</Label>
              <Input
                id="inquiry-task-due"
                type="date"
                aria-invalid={errors.dueDate != null}
                {...form.register("dueDate")}
              />
              <FieldError message={errors.dueDate?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inquiry-task-assignee">Assignee</Label>
              <Controller
                control={form.control}
                name="assigneeMemberId"
                render={({ field }) => (
                  <InquirySelect
                    id="inquiry-task-assignee"
                    value={field.value}
                    onChange={field.onChange}
                    noneLabel="No one"
                    invalid={errors.assigneeMemberId != null}
                    items={members}
                  />
                )}
              />
              <FieldError message={errors.assigneeMemberId?.message} />
            </div>
          </div>
          <FormAlert message={errors.root?.message} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={form.formState.isSubmitting || command.isPending}
            >
              {task == null ? "Add" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
