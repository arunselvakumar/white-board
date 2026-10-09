"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  Controller,
  useForm,
  useWatch,
  type Control,
  type FieldPath,
} from "react-hook-form";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";

import { PageHeader } from "@/components/app-shell/page-header";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { MobileField } from "@/components/auth/mobile-field";
import { MoneyInput } from "@/components/money/money-input";
import { fieldForCode } from "@/lib/server-errors";
import {
  labourQuery,
  useCreateLabour,
  useUpdateLabour,
  type LabourResponse,
} from "@/src/queries/labours";
import { lookupListQuery, supervisorsQuery } from "@/src/queries/masters";
import { projectOptionsQuery } from "@/src/queries/projects";

import { LabourFiles } from "./labour-files";
import {
  WEEKDAYS,
  createLabourPayload,
  labourErrorFields,
  labourFormDefaults,
  labourFormSchema,
  updateLabourPayload,
  type LabourFormValues,
} from "./labour-form-schema";

export const LABOURS_PATH = "/app/masters/labours";

const NONE = "__none";

type Choice = { value: string; label: string };

/** Live choices plus the one already saved, even when it is now disabled. */
function useChoices(
  items: { id: string; name: string; disabled: boolean }[] | undefined,
  saved: { id: string; name: string } | null | undefined,
): Choice[] {
  const choices: Choice[] = [{ value: NONE, label: "None" }];
  for (const item of items ?? [])
    if (!item.disabled || item.id === saved?.id)
      choices.push({ value: item.id, label: item.name });
  if (saved != null && !choices.some((choice) => choice.value === saved.id))
    choices.push({ value: saved.id, label: saved.name });
  return choices;
}

function ChoiceField({
  id,
  label,
  name,
  control,
  choices,
  placeholder,
  error,
}: {
  id: string;
  label: string;
  name: FieldPath<LabourFormValues>;
  control: Control<LabourFormValues>;
  choices: Choice[];
  placeholder: string;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <Select
            items={choices}
            value={
              typeof field.value === "string" && field.value !== ""
                ? field.value
                : null
            }
            onValueChange={(value) => {
              field.onChange(value == null || value === NONE ? "" : value);
            }}
          >
            <SelectTrigger
              id={id}
              size="lg"
              className="w-full min-w-0"
              aria-invalid={error != null}
            >
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent
              align="start"
              alignItemWithTrigger={false}
              aria-label={label}
            >
              {choices.map((choice) => (
                <SelectItem key={choice.value} value={choice.value}>
                  {choice.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      <FieldError message={error} />
    </div>
  );
}

function Section({
  id,
  title,
  hint,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <div className="space-y-1">
        <h2 id={id} className="font-semibold">
          {title}
        </h2>
        {hint != null && (
          <p className="text-muted-foreground text-sm">{hint}</p>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * Add and Edit Labour (CM-207): Basic, Wage, Statutory, Category & contact,
 * and the Project on Add. Amounts are typed in rupees and sent as paise.
 */
export function LabourForm({
  labour,
  onSave,
  saving,
}: {
  labour: LabourResponse | null;
  onSave: (values: LabourFormValues, showAmounts: boolean) => Promise<unknown>;
  saving: boolean;
}) {
  const router = useRouter();
  const isNew = labour == null;
  // Amounts come back null without the Financial flag; Add assumes it.
  const showAmounts = isNew || labour.overtimeWagePerHour != null;
  const form = useForm<LabourFormValues>({
    resolver: zodResolver(labourFormSchema({ showAmounts, isNew })),
    defaultValues: labourFormDefaults(labour),
  });
  const errors = form.formState.errors;
  const wageType = useWatch({ control: form.control, name: "wageType" });

  const categories = useQuery(lookupListQuery("labour-categories"));
  const supervisors = useQuery(supervisorsQuery);
  const projects = useQuery({ ...projectOptionsQuery, enabled: isNew });
  const categoryChoices = useChoices(
    categories.data?.items,
    labour?.labourCategory,
  );
  const supervisorChoices = useChoices(
    supervisors.data?.items,
    labour?.supervisor,
  );
  const projectChoices: Choice[] = (projects.data?.items ?? []).map(
    (project) => ({ value: project.id, label: project.name }),
  );

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSave(values, showAmounts);
      router.push(LABOURS_PATH);
    } catch (error) {
      const { field, message } = fieldForCode(error, labourErrorFields(values));
      form.setError(field ?? "root", { message });
    }
  });

  return (
    <form
      noValidate
      className="space-y-8"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <Section id="labour-basic" title="Basic">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="labour-name">Labour name</Label>
            <Input
              id="labour-name"
              className="h-10"
              autoComplete="off"
              placeholder="Dhuresh Nawin"
              aria-invalid={errors.name != null}
              {...form.register("name")}
            />
            <FieldError message={errors.name?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="labour-code">Labour Id</Label>
            <Input
              id="labour-code"
              className="h-10"
              autoComplete="off"
              placeholder="L-001"
              aria-invalid={errors.labourCode != null}
              {...form.register("labourCode")}
            />
            <FieldError message={errors.labourCode?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="labour-father">Father&apos;s name</Label>
            <Input
              id="labour-father"
              className="h-10"
              autoComplete="off"
              aria-describedby="labour-father-hint"
              aria-invalid={errors.fatherName != null}
              {...form.register("fatherName")}
            />
            <p
              id="labour-father-hint"
              className="text-muted-foreground text-xs"
            >
              Printed on the muster roll.
            </p>
            <FieldError message={errors.fatherName?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="labour-joining-date">Joining date</Label>
            <Input
              id="labour-joining-date"
              type="date"
              className="h-10"
              aria-invalid={errors.joiningDate != null}
              {...form.register("joiningDate")}
            />
            <FieldError message={errors.joiningDate?.message} />
          </div>
        </div>
      </Section>

      <Section
        id="labour-wage"
        title="Wage"
        hint={
          showAmounts
            ? undefined
            : "You cannot see wages. Ask the Owner for the Financial right on Labours."
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Wage type</legend>
            <Controller
              name="wageType"
              control={form.control}
              render={({ field }) => (
                <ToggleGroup
                  value={[field.value]}
                  onValueChange={(value: string[]) => {
                    const next = value[0];
                    if (next === "daily" || next === "monthly")
                      field.onChange(next);
                  }}
                  variant="outline"
                >
                  <ToggleGroupItem value="daily">Daily wages</ToggleGroupItem>
                  <ToggleGroupItem value="monthly">
                    Monthly wages
                  </ToggleGroupItem>
                </ToggleGroup>
              )}
            />
          </fieldset>
          {showAmounts &&
            (wageType === "daily" ? (
              <div className="space-y-1.5">
                <Label htmlFor="labour-wage-day">Wage per day</Label>
                <MoneyInput
                  id="labour-wage-day"
                  className="h-10"
                  placeholder="700"
                  aria-invalid={errors.wagePerDay != null}
                  {...form.register("wagePerDay")}
                />
                <FieldError message={errors.wagePerDay?.message} />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="labour-wage-month">Wage per month</Label>
                <MoneyInput
                  id="labour-wage-month"
                  className="h-10"
                  placeholder="18000"
                  aria-invalid={errors.wagePerMonth != null}
                  {...form.register("wagePerMonth")}
                />
                <FieldError message={errors.wagePerMonth?.message} />
              </div>
            ))}
          {showAmounts && (
            <div className="space-y-1.5">
              <Label htmlFor="labour-overtime">Overtime wage per hour</Label>
              <MoneyInput
                id="labour-overtime"
                className="h-10"
                placeholder="100"
                aria-invalid={errors.overtimeWagePerHour != null}
                {...form.register("overtimeWagePerHour")}
              />
              <FieldError message={errors.overtimeWagePerHour?.message} />
            </div>
          )}
          {showAmounts && (
            <div className="space-y-1.5">
              <Label htmlFor="labour-opening">Opening balance</Label>
              <MoneyInput
                id="labour-opening"
                className="h-10"
                placeholder="0"
                aria-describedby="labour-opening-hint"
                aria-invalid={errors.openingBalance != null}
                {...form.register("openingBalance")}
              />
              <p
                id="labour-opening-hint"
                className="text-muted-foreground text-xs"
              >
                What you owed them on the joining date. Negative for an advance
                already given.
              </p>
              <FieldError message={errors.openingBalance?.message} />
            </div>
          )}
          <fieldset className="space-y-1.5 sm:col-span-2">
            <legend className="text-sm font-medium">Weekly holidays</legend>
            <Controller
              name="weeklyHolidays"
              control={form.control}
              render={({ field }) => (
                <ToggleGroup
                  multiple
                  value={field.value.map(String)}
                  onValueChange={(value: string[]) => {
                    field.onChange(value.map(Number));
                  }}
                  variant="outline"
                  size="sm"
                  className="flex-wrap"
                >
                  {WEEKDAYS.map((day) => (
                    <ToggleGroupItem key={day.value} value={String(day.value)}>
                      {day.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}
            />
            <p className="text-muted-foreground text-xs">
              Attendance marks these days Holiday by default.
            </p>
          </fieldset>
        </div>
      </Section>

      <Section id="labour-statutory" title="Statutory">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="labour-uan">UAN</Label>
            <Input
              id="labour-uan"
              inputMode="numeric"
              className="h-10"
              placeholder="12 digits"
              aria-invalid={errors.uanNumber != null}
              {...form.register("uanNumber")}
            />
            <FieldError message={errors.uanNumber?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="labour-esic">ESIC number</Label>
            <Input
              id="labour-esic"
              inputMode="numeric"
              className="h-10"
              placeholder="10 or 17 digits"
              aria-invalid={errors.esicNumber != null}
              {...form.register("esicNumber")}
            />
            <FieldError message={errors.esicNumber?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="labour-aadhaar">Aadhaar</Label>
            <Input
              id="labour-aadhaar"
              inputMode="numeric"
              className="h-10"
              placeholder={labour?.aadhaarMasked ?? "1234 5678 9012"}
              aria-invalid={errors.aadhaar != null}
              {...form.register("aadhaar")}
            />
            {labour?.aadhaarMasked != null && (
              <p className="text-muted-foreground text-xs">
                Leave blank to keep {labour.aadhaarMasked}.
              </p>
            )}
            <FieldError message={errors.aadhaar?.message} />
          </div>
        </div>
      </Section>

      <Section id="labour-contact" title="Category & contact">
        <div className="grid gap-4 sm:grid-cols-2">
          <ChoiceField
            id="labour-category"
            label="Labour Category"
            name="labourCategoryId"
            control={form.control}
            choices={categoryChoices}
            placeholder="Choose a Labour Category"
            error={errors.labourCategoryId?.message}
          />
          <ChoiceField
            id="labour-supervisor"
            label="Supervisor"
            name="supervisorId"
            control={form.control}
            choices={supervisorChoices}
            placeholder="Choose a Supervisor"
            error={errors.supervisorId?.message}
          />
          <div className="space-y-1.5">
            <Label htmlFor="labour-contact-number">Contact number</Label>
            <MobileField
              id="labour-contact-number"
              aria-invalid={errors.contactNumber != null}
              {...form.register("contactNumber")}
            />
            <FieldError message={errors.contactNumber?.message} />
          </div>
          <ChoiceField
            id="labour-gender"
            label="Gender"
            name="gender"
            control={form.control}
            choices={[
              { value: NONE, label: "Not given" },
              { value: "male", label: "Male" },
              { value: "female", label: "Female" },
              { value: "other", label: "Other" },
            ]}
            placeholder="Not given"
            error={errors.gender?.message}
          />
        </div>
      </Section>

      {isNew && (
        <Section
          id="labour-project"
          title="Project"
          hint="Where they work from the joining date. Move them later with Transfer."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <ChoiceField
              id="labour-project-select"
              label="Project"
              name="currentProjectId"
              control={form.control}
              choices={projectChoices}
              placeholder={
                projects.isPending ? "Loading Projects…" : "Select a Project"
              }
              error={errors.currentProjectId?.message}
            />
          </div>
          {projects.data?.items.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No Projects yet.{" "}
              <Link
                href="/app/projects"
                className="text-primary underline underline-offset-4"
              >
                Add a Project
              </Link>{" "}
              first.
            </p>
          )}
        </Section>
      )}

      <FormAlert message={errors.root?.message} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Link
          href={LABOURS_PATH}
          className={buttonVariants({ variant: "outline" })}
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

function FormPage({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Labours", href: LABOURS_PATH }}
          title={title}
          meta={meta}
        />
        {children}
      </div>
    </div>
  );
}

export function NewLabourScreen() {
  const create = useCreateLabour();
  return (
    <FormPage title="Add Labour">
      <LabourForm
        labour={null}
        saving={create.isPending}
        onSave={(values) => create.mutateAsync(createLabourPayload(values))}
      />
    </FormPage>
  );
}

export function EditLabourScreen({ id }: { id: string }) {
  const { data } = useSuspenseQuery(labourQuery(id));
  const update = useUpdateLabour(id);
  return (
    <FormPage
      title={`Edit ${data.name}`}
      meta={`${data.currentProject.name}${data.isActive ? "" : " · Inactive"}`}
    >
      <div className="space-y-10">
        <LabourForm
          key={data.updatedAt}
          labour={data}
          saving={update.isPending}
          onSave={(values, showAmounts) =>
            update.mutateAsync(
              updateLabourPayload(values, {
                showAmounts,
                expectedUpdatedAt: data.updatedAt,
              }),
            )
          }
        />
        <LabourFiles labour={data} />
      </div>
    </FormPage>
  );
}
