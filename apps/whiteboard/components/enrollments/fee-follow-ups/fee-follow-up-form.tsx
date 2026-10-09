"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@repo/ui/components/radio-group";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import {
  FEE_FOLLOW_UP_CHANNEL_LABELS,
  type FeeFollowUpChannel,
  type FeeFollowUpInput,
} from "@/src/queries/fee-dues";

import { feeFollowUpFormErrors } from "./fee-follow-up-format";

export const FEE_FOLLOW_UP_NOTE_LIMIT = 500;

const CHANNELS = Object.keys(
  FEE_FOLLOW_UP_CHANNEL_LABELS,
) as FeeFollowUpChannel[];

function isChannel(value: string): value is FeeFollowUpChannel {
  return (CHANNELS as string[]).includes(value);
}

/** `kept` is the date already saved, which an edit may leave as it is. */
function feeFollowUpSchema(today: string, kept: string | null) {
  return z.object({
    channel: z
      .string()
      .refine(
        (value) => (CHANNELS as string[]).includes(value),
        "Choose how you followed up",
      ),
    note: z
      .string()
      .trim()
      .max(
        FEE_FOLLOW_UP_NOTE_LIMIT,
        `Keep the note to ${FEE_FOLLOW_UP_NOTE_LIMIT} characters or fewer`,
      ),
    nextFollowUpOn: z
      .string()
      .refine(
        (value) => value === "" || value >= today || value === kept,
        "Choose today or a later date",
      ),
  });
}

type FeeFollowUpValues = z.infer<ReturnType<typeof feeFollowUpSchema>>;

export type FeeFollowUpFormDefaults = {
  channel: FeeFollowUpChannel;
  note: string | null;
  nextFollowUpOn: string | null;
};

export function FeeFollowUpForm({
  idPrefix,
  today,
  defaultValues,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  /** Keeps ids unique when the log form and the edit dialog are both mounted. */
  idPrefix: string;
  /** YYYY-MM-DD in the Batch's timezone; the next follow-up can't be earlier. */
  today: string;
  defaultValues?: FeeFollowUpFormDefaults;
  submitLabel: string;
  onSubmit: (input: FeeFollowUpInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const empty: FeeFollowUpValues = {
    channel: defaultValues?.channel ?? "",
    note: defaultValues?.note ?? "",
    nextFollowUpOn: defaultValues?.nextFollowUpOn ?? "",
  };
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FeeFollowUpValues>({
    resolver: zodResolver(
      feeFollowUpSchema(today, defaultValues?.nextFollowUpOn ?? null),
    ),
    defaultValues: empty,
  });
  const note = useWatch({ control, name: "note" });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        if (!isChannel(values.channel)) return;
        try {
          await onSubmit({
            channel: values.channel,
            note: values.note === "" ? null : values.note,
            nextFollowUpOn:
              values.nextFollowUpOn === "" ? null : values.nextFollowUpOn,
          });
          reset(empty);
        } catch (error) {
          for (const item of feeFollowUpFormErrors(error)) {
            if (item.kind === "field") {
              setError(item.field, { message: item.message });
            } else {
              setError("root", { message: item.message });
            }
          }
        }
      })}
    >
      <fieldset className="space-y-2">
        <legend
          id={`${idPrefix}-channel-label`}
          className="text-sm font-medium"
        >
          Channel
        </legend>
        <Controller
          name="channel"
          control={control}
          render={({ field }) => (
            <RadioGroup
              name={field.name}
              value={field.value}
              onValueChange={(value) => {
                if (typeof value === "string") field.onChange(value);
              }}
              aria-labelledby={`${idPrefix}-channel-label`}
              aria-invalid={errors.channel != null}
              className="flex flex-wrap gap-2"
            >
              {CHANNELS.map((channel) => (
                <Label
                  key={channel}
                  htmlFor={`${idPrefix}-channel-${channel}`}
                  className="has-data-checked:border-primary has-data-checked:bg-primary/5 hover:border-primary/60 flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 font-normal"
                >
                  <RadioGroupItem
                    id={`${idPrefix}-channel-${channel}`}
                    value={channel}
                  />
                  <span className="min-w-0">
                    {FEE_FOLLOW_UP_CHANNEL_LABELS[channel]}
                  </span>
                </Label>
              ))}
            </RadioGroup>
          )}
        />
        <p className="text-muted-foreground text-xs">
          How you reached the family. Whiteboard only records it and sends
          nothing.
        </p>
        <FieldError message={errors.channel?.message} />
      </fieldset>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor={`${idPrefix}-note`}>Note (optional)</Label>
          <span className="text-muted-foreground text-xs tabular-nums">
            {note.length}/{FEE_FOLLOW_UP_NOTE_LIMIT}
          </span>
        </div>
        <Textarea
          id={`${idPrefix}-note`}
          rows={3}
          maxLength={FEE_FOLLOW_UP_NOTE_LIMIT}
          placeholder="e.g. Called parent, will pay Saturday"
          aria-invalid={errors.note != null}
          {...register("note")}
        />
        <FieldError message={errors.note?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-next`}>
          Next follow-up date (optional)
        </Label>
        <Input
          id={`${idPrefix}-next`}
          type="date"
          className="h-10 w-full sm:max-w-56"
          min={
            defaultValues?.nextFollowUpOn != null &&
            defaultValues.nextFollowUpOn < today
              ? defaultValues.nextFollowUpOn
              : today
          }
          aria-invalid={errors.nextFollowUpOn != null}
          {...register("nextFollowUpOn")}
        />
        <p className="text-muted-foreground text-xs">
          Leave empty if no next follow-up is planned.
        </p>
        <FieldError message={errors.nextFollowUpOn?.message} />
      </div>
      <FormAlert message={errors.root?.message} />
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel == null ? null : (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
