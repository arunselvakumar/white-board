"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { AttachmentPicker } from "@/components/class-work/attachments";
import {
  classWorkQueries,
  setHomework,
  updateHomework,
  type AttachmentView,
  type ClassDateView,
  type HomeworkView,
} from "@/src/queries/class-work";

import { classDateOptions, errorCode, errorMessage } from "./class-work-format";

const TITLE_LIMIT = 200;
const INSTRUCTIONS_LIMIT = 5000;

const attachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  sizeBytes: z.number(),
});

const schema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Give the Homework a title")
      .max(TITLE_LIMIT, `Keep the title to ${TITLE_LIMIT} characters or fewer`),
    instructions: z
      .string()
      .trim()
      .min(1, "Write what the Students should do")
      .max(
        INSTRUCTIONS_LIMIT,
        `Keep the instructions to ${INSTRUCTIONS_LIMIT} characters or fewer`,
      ),
    classDate: z.string().min(1, "Choose the Class this Homework follows"),
    dueOn: z.string().min(1, "Choose a due date"),
    attachments: z.array(attachmentSchema),
  })
  .refine(
    (value) =>
      value.classDate === "" ||
      value.dueOn === "" ||
      value.dueOn >= value.classDate,
    { path: ["dueOn"], message: "The due date can’t be before the Class date" },
  );

type Values = z.infer<typeof schema>;

function defaults(
  homework: HomeworkView | null,
  classDates: readonly ClassDateView[],
  today: string,
): Values {
  if (homework != null) {
    return {
      title: homework.title,
      instructions: homework.instructions,
      classDate: homework.classDate,
      dueOn: homework.dueOn,
      attachments: homework.attachments,
    };
  }
  const dates = [...new Set(classDates.map((item) => item.date))].sort();
  const past = dates.filter((date) => date <= today);
  const classDate = past.at(-1) ?? dates[0] ?? "";
  const nextClass = dates.find((date) => date > classDate) ?? "";
  return {
    title: "",
    instructions: "",
    classDate,
    dueOn: nextClass,
    attachments: [],
  };
}

export function HomeworkFormDialog({
  open,
  onOpenChange,
  batchId,
  classDates,
  today,
  homework = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batchId: string;
  classDates: readonly ClassDateView[];
  today: string;
  /** The Homework being edited; null to set new Homework. */
  homework?: HomeworkView | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {homework == null ? "Set homework" : "Edit homework"}
          </DialogTitle>
          <DialogDescription>
            Homework follows a Class. Students and Parents see it on their
            Homework page.
          </DialogDescription>
        </DialogHeader>
        <HomeworkForm
          key={homework?.id ?? "new"}
          batchId={batchId}
          classDates={classDates}
          today={today}
          homework={homework}
          onDone={() => {
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function HomeworkForm({
  batchId,
  classDates,
  today,
  homework,
  onDone,
}: {
  batchId: string;
  classDates: readonly ClassDateView[];
  today: string;
  homework: HomeworkView | null;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const options = classDateOptions(
    classDates,
    today,
    homework?.classDate ?? null,
  );
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: defaults(homework, classDates, today),
  });
  const [instructions, classDate] = useWatch({
    control,
    name: ["instructions", "classDate"],
  });
  const noClassDates = options.length === 0;

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        const input = {
          title: values.title,
          instructions: values.instructions,
          classDate: values.classDate,
          dueOn: values.dueOn,
          attachmentIds: values.attachments.map((item) => item.id),
        };
        try {
          if (homework == null) await setHomework(batchId, input);
          else await updateHomework(homework.id, input);
        } catch (error) {
          const code = errorCode(error);
          const message = errorMessage(error);
          if (code === "CLASS_DATE_INVALID") setError("classDate", { message });
          else if (code === "HOMEWORK_DUE_BEFORE_CLASS")
            setError("dueOn", { message });
          else setError("root", { message });
          return;
        }
        await queryClient.invalidateQueries({
          queryKey: classWorkQueries.key.batch(batchId),
        });
        if (homework != null)
          await queryClient.invalidateQueries({
            queryKey: classWorkQueries.key.submissions(homework.id),
          });
        onDone();
      })}
    >
      <div className="space-y-1.5">
        <Label htmlFor="homework-title">Title</Label>
        <Input
          id="homework-title"
          className="h-10"
          maxLength={TITLE_LIMIT}
          placeholder="e.g. Practice: Excel SUM and AVERAGE"
          aria-invalid={errors.title != null}
          {...register("title")}
        />
        <FieldError message={errors.title?.message} />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="homework-instructions">Instructions</Label>
          <span className="text-muted-foreground text-xs tabular-nums">
            {instructions.length}/{INSTRUCTIONS_LIMIT}
          </span>
        </div>
        <Textarea
          id="homework-instructions"
          rows={5}
          maxLength={INSTRUCTIONS_LIMIT}
          placeholder="What to do, and what to send back"
          aria-invalid={errors.instructions != null}
          {...register("instructions")}
        />
        <FieldError message={errors.instructions?.message} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="homework-class-date">Class date</Label>
          {noClassDates ? (
            <p
              id="homework-class-date"
              className="text-muted-foreground bg-muted/50 rounded-lg border p-3 text-sm"
            >
              This Batch has no Classes in the last 60 days or next 14, so
              Homework can’t be set yet.
            </p>
          ) : (
            <Controller
              name="classDate"
              control={control}
              render={({ field }) => (
                <Select
                  items={options}
                  value={field.value}
                  onValueChange={(value) => {
                    if (value == null) return;
                    field.onChange(value);
                  }}
                >
                  <SelectTrigger
                    id="homework-class-date"
                    size="lg"
                    className="w-full min-w-0"
                    aria-invalid={errors.classDate != null}
                  >
                    <SelectValue placeholder="Choose a Class" />
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    {options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          )}
          <FieldError message={errors.classDate?.message} />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="homework-due-on">Due date</Label>
          <Input
            id="homework-due-on"
            type="date"
            className="h-10"
            min={classDate || undefined}
            aria-invalid={errors.dueOn != null}
            {...register("dueOn")}
          />
          <FieldError message={errors.dueOn?.message} />
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Files (optional)</p>
        <Controller
          name="attachments"
          control={control}
          render={({ field }) => (
            <AttachmentPicker
              value={field.value}
              onChange={(next: AttachmentView[]) => {
                field.onChange(next);
              }}
              disabled={isSubmitting}
              onBusyChange={setUploading}
            />
          )}
        />
      </div>
      <FormAlert message={errors.root?.message} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || uploading || noClassDates}
        >
          {isSubmitting
            ? "Saving…"
            : homework == null
              ? "Set homework"
              : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}
