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
  postStudyMaterial,
  updateStudyMaterial,
  type AttachmentView,
  type ClassDateView,
  type StudyMaterialView,
} from "@/src/queries/class-work";

import { classDateOptions, errorCode, errorMessage } from "./class-work-format";

const TITLE_LIMIT = 200;
const NOTE_LIMIT = 2000;
const LINK_LIMIT = 2048;
const NO_CLASS_DATE = "none";
export const STUDY_MATERIAL_EMPTY_MESSAGE =
  "Add a note, a link, or a file so there’s something to open.";

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const attachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  sizeBytes: z.number(),
});

const schema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give the material a title")
    .max(TITLE_LIMIT, `Keep the title to ${TITLE_LIMIT} characters or fewer`),
  note: z
    .string()
    .trim()
    .max(NOTE_LIMIT, `Keep the note to ${NOTE_LIMIT} characters or fewer`),
  linkUrl: z
    .string()
    .trim()
    .max(LINK_LIMIT, `Keep the link to ${LINK_LIMIT} characters or fewer`)
    .refine((value) => value === "" || isHttpUrl(value), {
      message: "Enter a full link starting with https://",
    }),
  classDate: z.string(),
  attachments: z.array(attachmentSchema),
});

type Values = z.infer<typeof schema>;

export function StudyMaterialFormDialog({
  open,
  onOpenChange,
  batchId,
  classDates,
  today,
  material = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batchId: string;
  classDates: readonly ClassDateView[];
  today: string;
  /** The Study Material being edited; null to share new material. */
  material?: StudyMaterialView | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {material == null ? "Share material" : "Edit material"}
          </DialogTitle>
          <DialogDescription>
            Notes, links, and files for the Batch. Students and Parents see it
            on their Homework page.
          </DialogDescription>
        </DialogHeader>
        <StudyMaterialForm
          key={material?.id ?? "new"}
          batchId={batchId}
          classDates={classDates}
          today={today}
          material={material}
          onDone={() => {
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function StudyMaterialForm({
  batchId,
  classDates,
  today,
  material,
  onDone,
}: {
  batchId: string;
  classDates: readonly ClassDateView[];
  today: string;
  material: StudyMaterialView | null;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const options = [
    { value: NO_CLASS_DATE, label: "No Class date" },
    ...classDateOptions(classDates, today, material?.classDate ?? null),
  ];
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    control,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: material?.title ?? "",
      note: material?.note ?? "",
      linkUrl: material?.linkUrl ?? "",
      classDate: material?.classDate ?? NO_CLASS_DATE,
      attachments: material?.attachments ?? [],
    },
  });
  const note = useWatch({ control, name: "note" });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        clearErrors("root");
        void handleSubmit(async (values) => {
          if (
            values.note === "" &&
            values.linkUrl === "" &&
            values.attachments.length === 0
          ) {
            setError("root", { message: STUDY_MATERIAL_EMPTY_MESSAGE });
            return;
          }
          const input = {
            title: values.title,
            note: values.note === "" ? null : values.note,
            linkUrl: values.linkUrl === "" ? null : values.linkUrl,
            classDate:
              values.classDate === NO_CLASS_DATE ? null : values.classDate,
            attachmentIds: values.attachments.map((item) => item.id),
          };
          try {
            if (material == null) await postStudyMaterial(batchId, input);
            else await updateStudyMaterial(material.id, input);
          } catch (error) {
            const code = errorCode(error);
            const message = errorMessage(error);
            if (code === "LINK_URL_INVALID") setError("linkUrl", { message });
            else if (code === "CLASS_DATE_INVALID")
              setError("classDate", { message });
            else setError("root", { message });
            return;
          }
          await queryClient.invalidateQueries({
            queryKey: classWorkQueries.key.batch(batchId),
          });
          onDone();
        })(event);
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="material-title">Title</Label>
        <Input
          id="material-title"
          className="h-10"
          maxLength={TITLE_LIMIT}
          placeholder="e.g. Tally shortcut keys"
          aria-invalid={errors.title != null}
          {...register("title")}
        />
        <FieldError message={errors.title?.message} />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="material-note">Note (optional)</Label>
          <span className="text-muted-foreground text-xs tabular-nums">
            {note.length}/{NOTE_LIMIT}
          </span>
        </div>
        <Textarea
          id="material-note"
          rows={4}
          maxLength={NOTE_LIMIT}
          placeholder="What it is and how to use it"
          aria-invalid={errors.note != null}
          {...register("note")}
        />
        <FieldError message={errors.note?.message} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="material-link">Link (optional)</Label>
          <Input
            id="material-link"
            type="url"
            inputMode="url"
            className="h-10"
            maxLength={LINK_LIMIT}
            placeholder="https://"
            aria-invalid={errors.linkUrl != null}
            {...register("linkUrl")}
          />
          <FieldError message={errors.linkUrl?.message} />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="material-class-date">Class date (optional)</Label>
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
                  id="material-class-date"
                  size="lg"
                  className="w-full min-w-0"
                  aria-invalid={errors.classDate != null}
                >
                  <SelectValue placeholder="No Class date" />
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
          <FieldError message={errors.classDate?.message} />
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
        <Button type="submit" disabled={isSubmitting || uploading}>
          {isSubmitting
            ? "Saving…"
            : material == null
              ? "Share material"
              : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}
