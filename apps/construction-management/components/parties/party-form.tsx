"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Textarea } from "@repo/ui/components/textarea";

import { PageHeader } from "@/components/app-shell/page-header";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { MobileField } from "@/components/auth/mobile-field";
import { fieldForCode } from "@/lib/server-errors";
import { lookupListQuery } from "@/src/queries/masters";
import {
  partyQuery,
  useCreateParty,
  useUpdateParty,
  type Party,
  type PartyInput,
  type PartyList,
} from "@/src/queries/parties";
import { projectOptionsQuery } from "@/src/queries/projects";

import {
  partyErrorField,
  partyFormDefaults,
  partyFormSchema,
  partyPayload,
  type PartyFormValues,
} from "./party-form-schema";
import { PARTY_SCREENS, type PartyScreen } from "./party-screens";

type Choice = { id: string; label: string };

function Checklist({
  label,
  choices,
  value,
  onChange,
}: {
  label: string;
  choices: readonly Choice[];
  value: readonly string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <ul aria-label={label} className="grid gap-2 sm:grid-cols-2">
      {choices.map((choice) => {
        const checked = value.includes(choice.id);
        return (
          <li key={choice.id}>
            <Label className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 font-normal">
              <Checkbox
                checked={checked}
                onCheckedChange={(next) => {
                  onChange(
                    next
                      ? [...value, choice.id]
                      : value.filter((id) => id !== choice.id),
                  );
                }}
              />
              <span className="min-w-0 truncate">{choice.label}</span>
            </Label>
          </li>
        );
      })}
    </ul>
  );
}

function ProjectsChecklist({
  screen,
  value,
  onChange,
}: {
  screen: PartyScreen;
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const { data } = useSuspenseQuery(projectOptionsQuery);
  if (data.items.length === 0)
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
        No Projects yet. Add a Project first, then assign the {screen.label} to
        it.
      </p>
    );
  return (
    <Checklist
      label="Projects"
      choices={data.items.map((project) => ({
        id: project.id,
        label: project.name,
      }))}
      value={value}
      onChange={onChange}
    />
  );
}

/** Enabled Departments, plus disabled ones the Contractor already has. */
function DepartmentsChecklist({
  party,
  value,
  onChange,
}: {
  party: Party | null;
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const { data } = useSuspenseQuery(lookupListQuery("departments"));
  const kept = new Set(party?.departments.map((item) => item.id) ?? []);
  const choices = data.items
    .filter((item) => !item.disabled || kept.has(item.id))
    .map((item) => ({
      id: item.id,
      label: item.disabled ? `${item.name} (disabled)` : item.name,
    }));
  if (choices.length === 0)
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
        No Departments yet. Add them under Masters → Departments.
      </p>
    );
  return (
    <Checklist
      label="Departments"
      choices={choices}
      value={value}
      onChange={onChange}
    />
  );
}

function ChecklistSkeleton() {
  return <Skeleton className="h-11 w-full" />;
}

function PartyForm({
  screen,
  party,
  onSave,
  saving,
}: {
  screen: PartyScreen;
  party: Party | null;
  onSave: (payload: PartyInput) => Promise<unknown>;
  saving: boolean;
}) {
  const router = useRouter();
  const form = useForm<PartyFormValues>({
    resolver: zodResolver(partyFormSchema),
    defaultValues: partyFormDefaults(party),
  });
  const errors = form.formState.errors;
  const id = (field: string) => `${screen.list}-${field}`;

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSave(partyPayload(values, screen.departments));
      router.push(screen.path);
    } catch (error) {
      form.setError(partyErrorField(error) ?? "root", {
        message: fieldForCode(error, {}).message,
      });
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
      <section aria-labelledby={id("details")} className="space-y-4">
        <h2 id={id("details")} className="font-semibold">
          Details
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={id("name")}>{screen.label} name</Label>
            <Input
              id={id("name")}
              className="h-10"
              autoComplete="off"
              aria-invalid={errors.name != null}
              {...form.register("name")}
            />
            <FieldError message={errors.name?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("contact-person")}>Contact person</Label>
            <Input
              id={id("contact-person")}
              className="h-10"
              autoComplete="off"
              aria-invalid={errors.contactPerson != null}
              {...form.register("contactPerson")}
            />
            <FieldError message={errors.contactPerson?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("mobile")}>Mobile</Label>
            <MobileField
              id={id("mobile")}
              aria-invalid={errors.mobile != null}
              {...form.register("mobile")}
            />
            <FieldError message={errors.mobile?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("email")}>Email</Label>
            <Input
              id={id("email")}
              type="email"
              className="h-10"
              autoComplete="off"
              aria-invalid={errors.email != null}
              {...form.register("email")}
            />
            <FieldError message={errors.email?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("gstin")}>GSTIN</Label>
            <Input
              id={id("gstin")}
              className="h-10 uppercase"
              autoComplete="off"
              maxLength={15}
              aria-invalid={errors.gstin != null}
              {...form.register("gstin")}
            />
            <FieldError message={errors.gstin?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("pan")}>PAN</Label>
            <Input
              id={id("pan")}
              className="h-10 uppercase"
              autoComplete="off"
              maxLength={10}
              aria-invalid={errors.pan != null}
              {...form.register("pan")}
            />
            <FieldError message={errors.pan?.message} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={id("address")}>Address</Label>
            <Textarea
              id={id("address")}
              rows={2}
              aria-invalid={errors.address != null}
              {...form.register("address")}
            />
            <FieldError message={errors.address?.message} />
          </div>
        </div>
      </section>

      {screen.departments && (
        <section aria-labelledby={id("departments")} className="space-y-3">
          <div className="space-y-1">
            <h2 id={id("departments")} className="font-semibold">
              Departments
            </h2>
            <p className="text-muted-foreground text-sm">
              The trades this Contractor works in.
            </p>
          </div>
          <Suspense fallback={<ChecklistSkeleton />}>
            <Controller
              name="departmentIds"
              control={form.control}
              render={({ field }) => (
                <DepartmentsChecklist
                  party={party}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </Suspense>
          <FieldError message={errors.departmentIds?.message} />
        </section>
      )}

      <section aria-labelledby={id("projects")} className="space-y-3">
        <div className="space-y-1">
          <h2 id={id("projects")} className="font-semibold">
            Projects
          </h2>
          <p className="text-muted-foreground text-sm">
            The {screen.label} is on these Projects&apos; Resources.
          </p>
        </div>
        <Suspense fallback={<ChecklistSkeleton />}>
          <Controller
            name="projectIds"
            control={form.control}
            render={({ field }) => (
              <ProjectsChecklist
                screen={screen}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </Suspense>
        <FieldError message={errors.projectIds?.message} />
      </section>

      <FormAlert message={errors.root?.message} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Link
          href={screen.path}
          className={buttonVariants({ variant: "outline" })}
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

function FormPage({
  screen,
  title,
  children,
}: {
  screen: PartyScreen;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: screen.plural, href: screen.path }}
          title={title}
        />
        {children}
      </div>
    </div>
  );
}

/** Add Contractor or Add Supplier (CM-406). */
export function NewPartyScreen({ list }: { list: PartyList }) {
  const screen = PARTY_SCREENS[list];
  const create = useCreateParty(list);
  return (
    <FormPage screen={screen} title={`Add ${screen.label}`}>
      <PartyForm
        screen={screen}
        party={null}
        saving={create.isPending}
        onSave={(payload) => create.mutateAsync(payload)}
      />
    </FormPage>
  );
}

/** Edit Contractor or Edit Supplier; 409 when someone saved it since. */
export function EditPartyScreen({ list, id }: { list: PartyList; id: string }) {
  const screen = PARTY_SCREENS[list];
  const { data } = useSuspenseQuery(partyQuery(list, id));
  const update = useUpdateParty(list, id);
  return (
    <FormPage screen={screen} title={`Edit ${data.name}`}>
      <PartyForm
        key={data.updatedAt}
        screen={screen}
        party={data}
        saving={update.isPending}
        onSave={(payload) =>
          update.mutateAsync({ ...payload, expectedUpdatedAt: data.updatedAt })
        }
      />
    </FormPage>
  );
}
