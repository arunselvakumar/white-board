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
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";

import { errorMessage } from "./enquiry-errors";

export const NOT_INTERESTED_REASONS = [
  "Fees too high",
  "Timing doesn't suit",
  "Joined elsewhere",
  "Too far away",
] as const;

const schema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "Choose or write a reason")
    .max(200, "Keep the reason to 200 characters or fewer"),
});

type Values = z.infer<typeof schema>;

export function NotInterestedDialog({
  open,
  onOpenChange,
  prospectName,
  hasBookedDemos,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospectName: string;
  /** Unmarked demos are cancelled when the Enquiry closes. */
  hasBookedDemos: boolean;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { reason: "" },
  });
  const reason = useWatch({ control, name: "reason" });

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
          <DialogTitle>Not interested</DialogTitle>
          <DialogDescription>
            Close {prospectName}’s Enquiry. You can reopen it later if they call
            back.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit(async (values) => {
            try {
              await onSubmit(values.reason);
              reset();
            } catch (error) {
              setError("root", { message: errorMessage(error) });
            }
          })}
        >
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Common reasons</legend>
            <div className="flex flex-wrap gap-2">
              {NOT_INTERESTED_REASONS.map((preset) => {
                const selected = reason.trim() === preset;
                return (
                  <Button
                    key={preset}
                    type="button"
                    size="sm"
                    variant={selected ? "default" : "outline"}
                    aria-pressed={selected}
                    className="rounded-full"
                    onClick={() => {
                      setValue("reason", preset, {
                        shouldValidate: errors.reason != null,
                      });
                    }}
                  >
                    {preset}
                  </Button>
                );
              })}
            </div>
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="not-interested-reason">Reason</Label>
            <Textarea
              id="not-interested-reason"
              rows={2}
              maxLength={200}
              placeholder="Pick a reason above or write your own"
              aria-invalid={errors.reason != null}
              {...register("reason")}
            />
            <FieldError message={errors.reason?.message} />
          </div>
          {hasBookedDemos ? (
            <p className="text-muted-foreground text-sm">
              Demos that are booked and not yet marked will be cancelled.
            </p>
          ) : null}
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
              Keep open
            </Button>
            <Button type="submit" variant="destructive" disabled={isSubmitting}>
              {isSubmitting ? "Closing…" : "Mark not interested"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
