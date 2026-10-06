"use client";

import { zodResolver } from "@hookform/resolvers/zod";
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
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";

import { errorMessage } from "./enquiry-errors";
import { todayInKolkata } from "./enquiry-format";

const NOTE_LIMIT = 1000;

function followUpSchema(today: string) {
  return z
    .object({
      note: z
        .string()
        .trim()
        .min(1, "Write what happened on the call")
        .max(NOTE_LIMIT, `Keep the note to ${NOTE_LIMIT} characters or fewer`),
      nextFollowUpOn: z.string(),
    })
    .refine(
      (value) => value.nextFollowUpOn === "" || value.nextFollowUpOn >= today,
      {
        path: ["nextFollowUpOn"],
        message: "Choose today or a later date",
      },
    );
}

type FollowUpValues = z.infer<ReturnType<typeof followUpSchema>>;

export type FollowUpInput = { note: string; nextFollowUpOn: string | null };

export function FollowUpDialog({
  open,
  onOpenChange,
  prospectName,
  onSubmit,
  today = todayInKolkata(),
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospectName: string;
  onSubmit: (input: FollowUpInput) => Promise<void>;
  today?: string;
}) {
  const {
    register,
    handleSubmit,
    setError,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FollowUpValues>({
    resolver: zodResolver(followUpSchema(today)),
    defaultValues: { note: "", nextFollowUpOn: "" },
  });
  const note = useWatch({ control, name: "note" });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Log follow-up</DialogTitle>
          <DialogDescription>
            Note what {prospectName} said, and when to call back next.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit(async (values) => {
            try {
              await onSubmit({
                note: values.note,
                nextFollowUpOn:
                  values.nextFollowUpOn === "" ? null : values.nextFollowUpOn,
              });
              reset();
            } catch (error) {
              setError("root", { message: errorMessage(error) });
            }
          })}
        >
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <Label htmlFor="follow-up-note">Note</Label>
              <span className="text-muted-foreground text-xs tabular-nums">
                {note.length}/{NOTE_LIMIT}
              </span>
            </div>
            <Textarea
              id="follow-up-note"
              rows={4}
              maxLength={NOTE_LIMIT}
              placeholder="e.g. Father wants weekend timings. Call after salary day."
              aria-invalid={errors.note != null}
              {...register("note")}
            />
            <FieldError message={errors.note?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="follow-up-next">Next follow-up (optional)</Label>
            <Input
              id="follow-up-next"
              type="date"
              className="h-10"
              min={today}
              aria-invalid={errors.nextFollowUpOn != null}
              {...register("nextFollowUpOn")}
            />
            <p className="text-muted-foreground text-xs">
              Leave empty if no further call is planned.
            </p>
            <FieldError message={errors.nextFollowUpOn?.message} />
          </div>
          <FormAlert message={errors.root?.message} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save follow-up"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
