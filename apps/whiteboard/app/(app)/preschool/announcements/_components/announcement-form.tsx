"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";

import { FormAlert } from "@/components/auth/form-alert";
import {
  SelectField,
  TextareaField,
  TextField,
  type Option,
} from "@/app/(app)/preschool/_components/form-fields";
import { isIsoDate } from "@/src/preschool/domain/dates";
import { QueryHttpError } from "@/src/queries/http";
import {
  PRESCHOOL_ANNOUNCEMENT_KIND_LABELS,
  type CreatePreschoolAnnouncementInput,
  type PreschoolAnnouncement,
  type PreschoolAnnouncementKind,
} from "@/src/queries/preschool/announcements";

/** The audience Select's value for every Centre and for the whole Centre. */
export const ALL_CENTRES = "all-centres";
export const WHOLE_CENTRE = "whole-centre";

const schema = z
  .object({
    audience: z.string().min(1, "Choose who it is for"),
    kind: z.enum(["notice", "event", "holiday"]),
    title: z.string().trim().min(1, "Enter a title").max(200),
    body: z.string().trim().min(1, "Write the Announcement").max(5000),
    startsOn: z.string(),
    endsOn: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "notice") return;
    if (!isIsoDate(value.startsOn))
      ctx.addIssue({
        code: "custom",
        path: ["startsOn"],
        message: "Enter the first day",
      });
    if (
      value.endsOn !== "" &&
      isIsoDate(value.startsOn) &&
      value.endsOn < value.startsOn
    )
      ctx.addIssue({
        code: "custom",
        path: ["endsOn"],
        message: "The last day cannot be before the first day",
      });
  });

type Values = z.infer<typeof schema>;

export type AnnouncementContent = {
  kind: PreschoolAnnouncementKind;
  title: string;
  body: string;
  startsOn: string | null;
  endsOn: string | null;
};

const FIELD_BY_CODE: Record<string, keyof Values> = {
  ANNOUNCEMENT_DATE_REQUIRED: "startsOn",
  ANNOUNCEMENT_DATES_ORDER: "endsOn",
  CLASSROOM_FORBIDDEN: "audience",
  ANNOUNCEMENT_KIND_FORBIDDEN: "kind",
};

/**
 * New or edit. `audiences` are what the role may post to; editing keeps
 * the audience and shows it as text.
 */
export function AnnouncementForm({
  centreId,
  audiences,
  kinds,
  editing,
  onSubmit,
  onCancel,
}: {
  centreId: string;
  audiences: readonly Option[];
  kinds: readonly PreschoolAnnouncementKind[];
  editing?: PreschoolAnnouncement;
  onSubmit: (
    input: CreatePreschoolAnnouncementInput | AnnouncementContent,
  ) => Promise<void>;
  onCancel: () => void;
}) {
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues:
      editing == null
        ? {
            audience: audiences.length === 1 ? (audiences[0]?.value ?? "") : "",
            kind: "notice",
            title: "",
            body: "",
            startsOn: "",
            endsOn: "",
          }
        : {
            audience: "kept",
            kind: editing.kind,
            title: editing.title,
            body: editing.body,
            startsOn: editing.startsOn ?? "",
            endsOn: editing.endsOn ?? "",
          },
  });
  const kind = useWatch({ control, name: "kind" });
  return (
    <form
      noValidate
      aria-label={editing == null ? "New Announcement" : "Edit Announcement"}
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        const content: AnnouncementContent = {
          kind: values.kind,
          title: values.title,
          body: values.body,
          startsOn: values.kind === "notice" ? null : values.startsOn,
          endsOn:
            values.kind === "notice" || values.endsOn === ""
              ? null
              : values.endsOn,
        };
        try {
          await onSubmit(
            editing == null
              ? {
                  ...content,
                  centreId: values.audience === ALL_CENTRES ? null : centreId,
                  classroomId:
                    values.audience === ALL_CENTRES ||
                    values.audience === WHOLE_CENTRE
                      ? null
                      : values.audience,
                }
              : content,
          );
        } catch (error) {
          const field =
            error instanceof QueryHttpError
              ? FIELD_BY_CODE[error.code]
              : undefined;
          setError(field ?? "root", {
            message:
              error instanceof QueryHttpError && error.message !== ""
                ? error.message
                : "Could not post the Announcement. Please try again.",
          });
        }
      })}
    >
      <FormAlert message={errors.root?.message} />
      <div className="grid gap-4 sm:grid-cols-2">
        {editing == null ? (
          <SelectField
            id="announcement-audience"
            name="audience"
            label="For"
            required
            control={control}
            options={audiences}
            error={errors.audience}
          />
        ) : (
          <div className="space-y-1.5 text-sm">
            <p className="font-medium">For</p>
            <p className="text-muted-foreground">{editing.audience}</p>
          </div>
        )}
        <SelectField
          id="announcement-kind"
          name="kind"
          label="Kind"
          required
          control={control}
          options={kinds.map((value) => ({
            value,
            label: PRESCHOOL_ANNOUNCEMENT_KIND_LABELS[value],
          }))}
          error={errors.kind}
        />
      </div>
      <TextField
        id="announcement-title"
        name="title"
        label="Title"
        required
        register={register}
        error={errors.title}
      />
      <TextareaField
        id="announcement-body"
        name="body"
        label="Message"
        required
        rows={5}
        register={register}
        error={errors.body}
      />
      {kind === "notice" ? null : (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="announcement-startsOn"
            name="startsOn"
            label="First day"
            type="date"
            required
            register={register}
            error={errors.startsOn}
          />
          <TextField
            id="announcement-endsOn"
            name="endsOn"
            label="Last day"
            type="date"
            hint="Leave empty for a single day."
            register={register}
            error={errors.endsOn}
          />
        </div>
      )}
      {editing == null ? (
        <p className="text-muted-foreground text-sm">
          The Parents of the Children it reaches are emailed when you post.
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : editing == null ? "Post" : "Save"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
