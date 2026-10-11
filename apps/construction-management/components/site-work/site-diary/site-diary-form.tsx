"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Controller,
  useFieldArray,
  useForm,
  type FieldPath,
} from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
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
import { PendingFilesField } from "@/components/site-work/documents/pending-files-field";
import { useUploadPendingFiles } from "@/components/site-work/documents/use-upload-pending-files";
import { localToday } from "@/components/procurement/inventory/inventory-format";
import { QueryHttpError } from "@/src/queries/http";
import {
  siteDiaryPath,
  useCreateSiteDiary,
  useUpdateSiteDiary,
  type SiteDiary,
} from "@/src/queries/site-diary";
import {
  SITE_DIARY_LIMITS,
  WEATHER_LABELS,
  WEATHERS,
  type Weather,
} from "@/src/site-work/domain/site-diary";

const NONE = "none";
const max = (n: number) =>
  z.string().max(n, `Use at most ${String(n)} characters.`);

const schema = z.object({
  diaryDate: z.string().min(1, "Choose the date."),
  weatherMorning: z.string(),
  weatherAfternoon: z.string(),
  rainfallMm: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^\d{1,4}(\.\d)?$/.test(value),
      "Enter the rainfall in mm, with at most 1 decimal.",
    ),
  siteCondition: max(SITE_DIARY_LIMITS.siteCondition),
  notes: max(SITE_DIARY_LIMITS.notes),
  visitors: z
    .array(
      z
        .object({
          name: max(SITE_DIARY_LIMITS.visitorName)
            .trim()
            .min(1, "Enter the visitor's name."),
          organisation: max(SITE_DIARY_LIMITS.organisation),
          purpose: max(SITE_DIARY_LIMITS.purpose),
          timeIn: z.string(),
          timeOut: z.string(),
        })
        .refine(
          (row) =>
            row.timeIn === "" ||
            row.timeOut === "" ||
            row.timeOut >= row.timeIn,
          { message: "Time out cannot be before time in.", path: ["timeOut"] },
        ),
    )
    .max(SITE_DIARY_LIMITS.visitors),
  instructions: z
    .array(
      z.object({
        givenBy: max(SITE_DIARY_LIMITS.person)
          .trim()
          .min(1, "Enter who gave the instruction."),
        givenTo: max(SITE_DIARY_LIMITS.person),
        instruction: max(SITE_DIARY_LIMITS.instruction)
          .trim()
          .min(1, "Write the instruction."),
        actionTaken: max(SITE_DIARY_LIMITS.actionTaken),
      }),
    )
    .max(SITE_DIARY_LIMITS.instructions),
  /** Picked on a new diary; uploaded once it is saved. */
  photos: z.custom<File[]>(),
});
type Values = z.infer<typeof schema>;

/** Server codes about the date, shown under it. */
const DATE_CODES = new Set([
  "SITE_DIARY_EXISTS",
  "SITE_DIARY_DATE_IN_FUTURE",
  "BACKDATED_CREATE_BLOCKED",
  "BACKDATED_EDIT_BLOCKED",
  "FINANCIAL_PERIOD_CLOSED",
]);

const blankVisitor = (): Values["visitors"][number] => ({
  name: "",
  organisation: "",
  purpose: "",
  timeIn: "",
  timeOut: "",
});

const blankInstruction = (): Values["instructions"][number] => ({
  givenBy: "",
  givenTo: "",
  instruction: "",
  actionTaken: "",
});

const blank = (value: string | null): string => value ?? "";
const orNull = (value: string): string | null =>
  value.trim() === "" ? null : value.trim();

function WeatherSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const items = [
    { value: NONE, label: "Not recorded" },
    ...WEATHERS.map((weather) => ({
      value: weather,
      label: WEATHER_LABELS[weather],
    })),
  ];
  return (
    <Select
      items={items}
      value={value === "" ? NONE : value}
      onValueChange={(next) => {
        if (next == null) return;
        onChange(next === NONE ? "" : next);
      }}
    >
      <SelectTrigger id={id} className="w-full min-w-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Write or edit a day's Site Diary (CM-607): the date, weather in the
 * morning and the afternoon, rainfall, site condition, visitor and
 * instruction rows, notes and, on a new diary, photos that upload once it
 * is saved (an existing diary's photos are kept on its page).
 */
export function SiteDiaryForm({
  projectId,
  diary,
  date,
}: {
  projectId: string;
  /** Edit this diary. */
  diary?: SiteDiary;
  /** A new diary's date (`?date=`); today when not given. */
  date?: string;
}) {
  const router = useRouter();
  const create = useCreateSiteDiary();
  const update = useUpdateSiteDiary(diary?.id ?? "");
  const uploads = useUploadPendingFiles("site_diary");
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues:
      diary == null
        ? {
            diaryDate: date ?? localToday(),
            weatherMorning: "",
            weatherAfternoon: "",
            rainfallMm: "",
            siteCondition: "",
            notes: "",
            visitors: [],
            instructions: [],
            photos: [],
          }
        : {
            diaryDate: diary.diaryDate,
            weatherMorning: blank(diary.weatherMorning),
            weatherAfternoon: blank(diary.weatherAfternoon),
            rainfallMm: blank(diary.rainfallMm),
            siteCondition: blank(diary.siteCondition),
            notes: blank(diary.notes),
            visitors: diary.visitors.map((v) => ({
              name: v.name,
              organisation: blank(v.organisation),
              purpose: blank(v.purpose),
              timeIn: blank(v.timeIn),
              timeOut: blank(v.timeOut),
            })),
            instructions: diary.instructions.map((i) => ({
              givenBy: i.givenBy,
              givenTo: blank(i.givenTo),
              instruction: i.instruction,
              actionTaken: blank(i.actionTaken),
            })),
            photos: [],
          },
  });
  const visitors = useFieldArray({ control: form.control, name: "visitors" });
  const instructions = useFieldArray({
    control: form.control,
    name: "instructions",
  });
  const errors = form.formState.errors;

  const submit = async (input: Values) => {
    setError(null);
    const body = {
      diaryDate: input.diaryDate,
      weatherMorning:
        input.weatherMorning === "" ? null : (input.weatherMorning as Weather),
      weatherAfternoon:
        input.weatherAfternoon === ""
          ? null
          : (input.weatherAfternoon as Weather),
      rainfallMm: orNull(input.rainfallMm),
      siteCondition: orNull(input.siteCondition),
      notes: orNull(input.notes),
      visitors: input.visitors.map((v) => ({
        name: v.name.trim(),
        organisation: orNull(v.organisation),
        purpose: orNull(v.purpose),
        timeIn: orNull(v.timeIn),
        timeOut: orNull(v.timeOut),
      })),
      instructions: input.instructions.map((i) => ({
        givenBy: i.givenBy.trim(),
        givenTo: orNull(i.givenTo),
        instruction: i.instruction.trim(),
        actionTaken: orNull(i.actionTaken),
      })),
    };
    try {
      const saved =
        diary == null
          ? await create.mutateAsync({ ...body, projectId })
          : await update.mutateAsync({
              ...body,
              expectedUpdatedAt: diary.updatedAt,
            });
      // A photo that does not go up is named on the diary's Photos, where
      // it can be added again; the diary itself is saved.
      if (diary == null) await uploads.uploadAll(saved.id, input.photos);
      router.push(siteDiaryPath(projectId, saved.diaryDate));
    } catch (caught) {
      if (caught instanceof QueryHttpError) {
        if (DATE_CODES.has(caught.code)) {
          form.setError("diaryDate", { message: caught.message });
          return;
        }
        const field = (caught.details as { field?: unknown } | undefined)
          ?.field;
        if (typeof field === "string" && field !== "projectId") {
          form.setError(field as FieldPath<Values>, {
            message: caught.message,
          });
          return;
        }
        setError(caught.message);
        return;
      }
      setError("Something went wrong. Please try again.");
    }
  };

  const busy = form.formState.isSubmitting || uploads.uploading;

  return (
    <form
      noValidate
      aria-label={diary == null ? "New Site Diary" : "Edit Site Diary"}
      className="w-full max-w-4xl space-y-6"
      onSubmit={(event) => {
        void form.handleSubmit(submit)(event);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="diary-date">Date</Label>
          <Input
            id="diary-date"
            type="date"
            max={localToday()}
            aria-invalid={errors.diaryDate != null}
            {...form.register("diaryDate")}
          />
          <FieldError message={errors.diaryDate?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="diary-weather-morning">Weather (morning)</Label>
          <Controller
            control={form.control}
            name="weatherMorning"
            render={({ field }) => (
              <WeatherSelect
                id="diary-weather-morning"
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="diary-weather-afternoon">Weather (afternoon)</Label>
          <Controller
            control={form.control}
            name="weatherAfternoon"
            render={({ field }) => (
              <WeatherSelect
                id="diary-weather-afternoon"
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="diary-rainfall">Rainfall (mm)</Label>
          <Input
            id="diary-rainfall"
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={errors.rainfallMm != null}
            {...form.register("rainfallMm")}
          />
          <FieldError message={errors.rainfallMm?.message} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="diary-condition">Site condition</Label>
          <Textarea
            id="diary-condition"
            rows={2}
            aria-invalid={errors.siteCondition != null}
            {...form.register("siteCondition")}
          />
          <FieldError message={errors.siteCondition?.message} />
        </div>
      </div>

      <section aria-labelledby="diary-form-visitors" className="space-y-3">
        <h3 id="diary-form-visitors" className="text-sm font-semibold">
          Visitors
        </h3>
        {visitors.fields.length === 0 && (
          <p className="text-muted-foreground text-sm">No visitors added.</p>
        )}
        <ol className="space-y-3">
          {visitors.fields.map((row, index) => {
            const rowErrors = errors.visitors?.[index];
            const id = (name: string) => `visitor-${String(index)}-${name}`;
            return (
              <li
                key={row.id}
                aria-label={`Visitor ${String(index + 1)}`}
                className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_1fr_7rem_7rem_auto] sm:items-start"
              >
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor={id("name")}>Name</Label>
                  <Input
                    id={id("name")}
                    autoComplete="off"
                    aria-invalid={rowErrors?.name != null}
                    {...form.register(`visitors.${index}.name`)}
                  />
                  <FieldError message={rowErrors?.name?.message} />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor={id("organisation")}>Organisation</Label>
                  <Input
                    id={id("organisation")}
                    autoComplete="off"
                    aria-invalid={rowErrors?.organisation != null}
                    {...form.register(`visitors.${index}.organisation`)}
                  />
                  <FieldError message={rowErrors?.organisation?.message} />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor={id("purpose")}>Purpose</Label>
                  <Input
                    id={id("purpose")}
                    autoComplete="off"
                    aria-invalid={rowErrors?.purpose != null}
                    {...form.register(`visitors.${index}.purpose`)}
                  />
                  <FieldError message={rowErrors?.purpose?.message} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={id("in")}>Time in</Label>
                  <Input
                    id={id("in")}
                    type="time"
                    aria-invalid={rowErrors?.timeIn != null}
                    {...form.register(`visitors.${index}.timeIn`)}
                  />
                  <FieldError message={rowErrors?.timeIn?.message} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={id("out")}>Time out</Label>
                  <Input
                    id={id("out")}
                    type="time"
                    aria-invalid={rowErrors?.timeOut != null}
                    {...form.register(`visitors.${index}.timeOut`)}
                  />
                  <FieldError message={rowErrors?.timeOut?.message} />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="sm:mt-6"
                  aria-label={`Remove visitor ${String(index + 1)}`}
                  onClick={() => {
                    visitors.remove(index);
                  }}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            );
          })}
        </ol>
        {visitors.fields.length < SITE_DIARY_LIMITS.visitors && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              visitors.append(blankVisitor());
            }}
          >
            <Plus aria-hidden="true" />
            Add visitor
          </Button>
        )}
      </section>

      <section aria-labelledby="diary-form-instructions" className="space-y-3">
        <h3 id="diary-form-instructions" className="text-sm font-semibold">
          Instructions
        </h3>
        {instructions.fields.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No instructions added.
          </p>
        )}
        <ol className="space-y-3">
          {instructions.fields.map((row, index) => {
            const rowErrors = errors.instructions?.[index];
            const id = (name: string) => `instruction-${String(index)}-${name}`;
            return (
              <li
                key={row.id}
                aria-label={`Instruction ${String(index + 1)}`}
                className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-start"
              >
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor={id("by")}>Given by</Label>
                  <Input
                    id={id("by")}
                    autoComplete="off"
                    aria-invalid={rowErrors?.givenBy != null}
                    {...form.register(`instructions.${index}.givenBy`)}
                  />
                  <FieldError message={rowErrors?.givenBy?.message} />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor={id("to")}>Given to</Label>
                  <Input
                    id={id("to")}
                    autoComplete="off"
                    aria-invalid={rowErrors?.givenTo != null}
                    {...form.register(`instructions.${index}.givenTo`)}
                  />
                  <FieldError message={rowErrors?.givenTo?.message} />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="sm:mt-6"
                  aria-label={`Remove instruction ${String(index + 1)}`}
                  onClick={() => {
                    instructions.remove(index);
                  }}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
                <div className="min-w-0 space-y-1.5 sm:col-span-2">
                  <Label htmlFor={id("text")}>Instruction</Label>
                  <Textarea
                    id={id("text")}
                    rows={2}
                    aria-invalid={rowErrors?.instruction != null}
                    {...form.register(`instructions.${index}.instruction`)}
                  />
                  <FieldError message={rowErrors?.instruction?.message} />
                </div>
                <div className="min-w-0 space-y-1.5 sm:col-span-2">
                  <Label htmlFor={id("action")}>Action taken</Label>
                  <Input
                    id={id("action")}
                    autoComplete="off"
                    aria-invalid={rowErrors?.actionTaken != null}
                    {...form.register(`instructions.${index}.actionTaken`)}
                  />
                  <FieldError message={rowErrors?.actionTaken?.message} />
                </div>
              </li>
            );
          })}
        </ol>
        {instructions.fields.length < SITE_DIARY_LIMITS.instructions && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              instructions.append(blankInstruction());
            }}
          >
            <Plus aria-hidden="true" />
            Add instruction
          </Button>
        )}
      </section>

      <div className="space-y-1.5">
        <Label htmlFor="diary-notes">Notes</Label>
        <Textarea
          id="diary-notes"
          rows={4}
          aria-invalid={errors.notes != null}
          {...form.register("notes")}
        />
        <FieldError message={errors.notes?.message} />
      </div>

      {diary == null && (
        <Controller
          control={form.control}
          name="photos"
          render={({ field }) => (
            <PendingFilesField
              documentType="site_diary"
              value={field.value}
              onChange={field.onChange}
              disabled={busy}
            />
          )}
        />
      )}

      <FormAlert message={error ?? undefined} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            router.back();
          }}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
