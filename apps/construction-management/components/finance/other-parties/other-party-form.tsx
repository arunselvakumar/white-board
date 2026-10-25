"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
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
import { Textarea } from "@repo/ui/components/textarea";

import { PageHeader } from "@/components/app-shell/page-header";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { MobileField } from "@/components/auth/mobile-field";
import { CheckList } from "@/components/masters/check-list";
import {
  GST_STATE_ITEMS,
  NO_STATE,
  gstStateLabel,
  gstinState,
} from "@/components/parties/party-form-schema";
import { fieldForCode } from "@/lib/server-errors";
import {
  otherPartyQuery,
  useCreateOtherParty,
  useUpdateOtherParty,
  type OtherParty,
  type OtherPartyInput,
} from "@/src/queries/finance-other-parties";
import { projectOptionsQuery } from "@/src/queries/projects";

import {
  OTHER_PARTIES_PATH,
  otherPartyErrorField,
  otherPartyFormDefaults,
  otherPartyFormSchema,
  otherPartyPayload,
  type OtherPartyFormValues,
} from "./other-party-form-schema";
import { ProjectsChecklistSkeleton } from "./other-parties-skeletons";

function ProjectsChecklist({
  value,
  onChange,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const { data } = useSuspenseQuery(projectOptionsQuery);
  if (data.items.length === 0)
    return (
      <p className="bg-card text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
        No Projects yet. Add a Project first, then choose it here.
      </p>
    );
  return (
    <CheckList
      legend="Projects"
      legendHidden
      idPrefix="other-party-project"
      options={data.items.map((project) => ({
        id: project.id,
        label: project.name,
      }))}
      value={value}
      onChange={onChange}
    />
  );
}

/**
 * The Other Party form (CM-704, ADR CM-0017 §11): name, mobile, email,
 * GSTIN (fills the GST state), PAN, GST state, address and the Projects it
 * works on.
 */
export function OtherPartyForm({
  party,
  onSave,
  saving,
}: {
  party: OtherParty | null;
  onSave: (payload: OtherPartyInput) => Promise<unknown>;
  saving: boolean;
}) {
  const router = useRouter();
  const form = useForm<OtherPartyFormValues>({
    resolver: zodResolver(otherPartyFormSchema),
    defaultValues: otherPartyFormDefaults(party),
  });
  const errors = form.formState.errors;
  const lockedState = gstinState(
    useWatch({ control: form.control, name: "gstin" }),
  );
  const gstinField = form.register("gstin", {
    onChange: (event: { target: { value: string } }) => {
      const state = gstinState(event.target.value);
      if (state != null) {
        form.setValue("stateCode", state, { shouldDirty: true });
        form.clearErrors("stateCode");
      }
    },
  });

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSave(otherPartyPayload(values));
      router.push(OTHER_PARTIES_PATH);
    } catch (error) {
      form.setError(otherPartyErrorField(error) ?? "root", {
        message: fieldForCode(error, {}).message,
      });
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
      <section
        aria-labelledby="other-party-details"
        className="bg-card space-y-4 rounded-xl border p-4 sm:p-5"
      >
        <h2 id="other-party-details" className="font-semibold">
          Details
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="other-party-name" required>
              Party name
            </Label>
            <Input
              id="other-party-name"
              className="h-10"
              autoComplete="off"
              aria-required
              aria-invalid={errors.name != null}
              {...form.register("name")}
            />
            <FieldError message={errors.name?.message} />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="other-party-mobile">Mobile</Label>
            <MobileField
              id="other-party-mobile"
              aria-invalid={errors.mobile != null}
              {...form.register("mobile")}
            />
            <FieldError message={errors.mobile?.message} />
          </div>
          <div className="min-w-0 space-y-1.5 sm:col-span-2">
            <Label htmlFor="other-party-email">Email</Label>
            <Input
              id="other-party-email"
              type="email"
              className="h-10"
              autoComplete="off"
              aria-invalid={errors.email != null}
              {...form.register("email")}
            />
            <FieldError message={errors.email?.message} />
          </div>
          <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2 lg:grid-cols-3">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="other-party-gstin">GSTIN</Label>
              <Input
                id="other-party-gstin"
                className="h-10 uppercase"
                autoCapitalize="characters"
                autoComplete="off"
                maxLength={15}
                aria-invalid={errors.gstin != null}
                {...gstinField}
              />
              <FieldError message={errors.gstin?.message} />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="other-party-state">GST state</Label>
              <Controller
                name="stateCode"
                control={form.control}
                render={({ field }) => {
                  const value = lockedState ?? field.value;
                  const items = GST_STATE_ITEMS.some(
                    (item) => item.value === value,
                  )
                    ? GST_STATE_ITEMS
                    : [
                        ...GST_STATE_ITEMS,
                        { value, label: gstStateLabel(value) },
                      ];
                  return (
                    <Select
                      items={items}
                      value={value === "" ? NO_STATE : value}
                      disabled={lockedState != null}
                      onValueChange={(next) => {
                        if (next != null)
                          field.onChange(next === NO_STATE ? "" : next);
                      }}
                    >
                      <SelectTrigger
                        id="other-party-state"
                        ref={field.ref}
                        size="lg"
                        className="w-full min-w-0"
                        aria-invalid={errors.stateCode != null}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent
                        align="start"
                        alignItemWithTrigger={false}
                        aria-label="GST states"
                      >
                        {items.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  );
                }}
              />
              {lockedState != null && (
                <p className="text-muted-foreground text-xs">From the GSTIN</p>
              )}
              <FieldError message={errors.stateCode?.message} />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="other-party-pan">PAN</Label>
              <Input
                id="other-party-pan"
                className="h-10 uppercase"
                autoCapitalize="characters"
                autoComplete="off"
                maxLength={10}
                aria-invalid={errors.pan != null}
                {...form.register("pan")}
              />
              <FieldError message={errors.pan?.message} />
            </div>
          </div>
          <div className="min-w-0 space-y-1.5 sm:col-span-2">
            <Label htmlFor="other-party-address">Address</Label>
            <Textarea
              id="other-party-address"
              rows={2}
              aria-invalid={errors.address != null}
              {...form.register("address")}
            />
            <FieldError message={errors.address?.message} />
          </div>
        </div>
      </section>

      <section
        aria-labelledby="other-party-projects"
        className="bg-card space-y-3 rounded-xl border p-4 sm:p-5"
      >
        <div className="space-y-1">
          <h2 id="other-party-projects" className="font-semibold">
            Projects
          </h2>
          <p className="text-muted-foreground text-sm">
            The Projects this party works on. Its invoices and payments are
            recorded on these Projects.
          </p>
        </div>
        <Suspense fallback={<ProjectsChecklistSkeleton />}>
          <Controller
            name="projectIds"
            control={form.control}
            render={({ field }) => (
              <ProjectsChecklist
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
          href={OTHER_PARTIES_PATH}
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
          back={{ label: "Other Parties", href: OTHER_PARTIES_PATH }}
          title={title}
        />
        {children}
      </div>
    </div>
  );
}

/** Masters → Other Parties → Add. */
export function NewOtherPartyScreen() {
  const create = useCreateOtherParty();
  return (
    <FormPage title="Add Other Party">
      <OtherPartyForm
        party={null}
        saving={create.isPending || create.isSuccess}
        onSave={(payload) => create.mutateAsync(payload)}
      />
    </FormPage>
  );
}

/** Masters → Other Parties → Edit; 409 when someone saved it since. */
export function EditOtherPartyScreen({ id }: { id: string }) {
  const { data } = useSuspenseQuery(otherPartyQuery(id));
  const update = useUpdateOtherParty(id);
  return (
    <FormPage title={`Edit ${data.name}`}>
      <OtherPartyForm
        key={data.updatedAt}
        party={data}
        saving={update.isPending || update.isSuccess}
        onSave={(payload) =>
          update.mutateAsync({ ...payload, expectedUpdatedAt: data.updatedAt })
        }
      />
    </FormPage>
  );
}
