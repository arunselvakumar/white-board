"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

import { PageHeader } from "@/components/app-shell/page-header";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  designationQuery,
  useCreateDesignation,
  useUpdateDesignation,
  type DesignationResponse,
} from "@/src/queries/designations";

export const DESIGNATIONS_PATH = "/app/masters/designations";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter the Designation name")
    .max(80, "Use at most 80 characters"),
});

type Values = z.infer<typeof schema>;

const SERVER_FIELDS: Record<string, keyof Values> = {
  DESIGNATION_NAME_REQUIRED: "name",
  DESIGNATION_NAME_TOO_LONG: "name",
  DESIGNATION_NAME_IN_USE: "name",
};

/**
 * A Designation is a job title only (ADR CM-0029): its name. Save adds or
 * updates (CM-112). What a person may do is their Role.
 */
function DesignationForm({
  designation,
  onSave,
  saving,
}: {
  designation: DesignationResponse | null;
  onSave: (values: { name: string }) => Promise<unknown>;
  saving: boolean;
}) {
  const router = useRouter();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: designation?.name ?? "" },
  });
  const errors = form.formState.errors;

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSave({ name: values.name });
      router.push(DESIGNATIONS_PATH);
    } catch (error) {
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
      form.setError(field ?? "root", { message });
    }
  });

  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <div className="max-w-md space-y-1.5">
        <Label htmlFor="designation-name" required>
          Designation name
        </Label>
        <Input
          id="designation-name"
          className="h-10"
          autoComplete="off"
          aria-required
          aria-invalid={errors.name != null}
          aria-describedby="designation-name-hint"
          {...form.register("name")}
        />
        <p id="designation-name-hint" className="text-muted-foreground text-xs">
          A job title, like Site Engineer or Store Keeper. What a person may do
          comes from their Role.
        </p>
        <FieldError message={errors.name?.message} />
      </div>
      <FormAlert message={errors.root?.message} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Link
          href={DESIGNATIONS_PATH}
          className={buttonVariants({ variant: "outline" })}
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

function FormPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Designations", href: DESIGNATIONS_PATH }}
          title={title}
        />
        {children}
      </div>
    </div>
  );
}

export function NewDesignationScreen() {
  const create = useCreateDesignation();
  return (
    <FormPage title="Add Designation">
      <DesignationForm
        designation={null}
        saving={create.isPending}
        onSave={(values) => create.mutateAsync(values)}
      />
    </FormPage>
  );
}

export function EditDesignationScreen({ id }: { id: string }) {
  const { data } = useSuspenseQuery(designationQuery(id));
  const update = useUpdateDesignation(id);
  return (
    <FormPage title={`Edit ${data.name}`}>
      <DesignationForm
        designation={data}
        saving={update.isPending}
        onSave={(values) => update.mutateAsync(values)}
      />
    </FormPage>
  );
}
