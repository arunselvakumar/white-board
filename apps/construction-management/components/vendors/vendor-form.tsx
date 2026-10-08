"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useMemo, type ReactNode } from "react";
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
import { MoneyInput } from "@/components/money/money-input";
import { fieldForCode } from "@/lib/server-errors";
import { lookupListQuery } from "@/src/queries/masters";
import { projectOptionsQuery } from "@/src/queries/projects";
import {
  useCreateVendor,
  useUpdateVendor,
  vendorQuery,
  type VendorResponse,
} from "@/src/queries/vendors";

import { RateCardEditor, type CategoryChoice } from "./rate-card-editor";
import {
  vendorErrorField,
  vendorFormDefaults,
  vendorFormSchema,
  vendorPayload,
  type VendorFormValues,
} from "./vendor-form-schema";
import { VENDORS_PATH } from "./vendors-page";

type Payload = ReturnType<typeof vendorPayload>;

/** Labour Categories for the rate card: enabled ones, plus any already on it. */
function useCategoryChoices(vendor: VendorResponse | null): {
  choices: CategoryChoice[];
  error: string | undefined;
} {
  const query = useQuery(lookupListQuery("labour-categories"));
  return useMemo(() => {
    const choices = new Map<string, CategoryChoice>();
    for (const item of query.data?.items ?? [])
      choices.set(item.id, {
        value: item.id,
        label: item.disabled ? `${item.name} (disabled)` : item.name,
        disabled: item.disabled,
      });
    for (const shift of vendor?.shifts ?? [])
      for (const rate of shift.rates)
        if (!choices.has(rate.labourCategoryId))
          choices.set(rate.labourCategoryId, {
            value: rate.labourCategoryId,
            label: rate.labourCategoryName ?? "Deleted category",
            disabled: true,
          });
    return {
      choices: [...choices.values()],
      error:
        query.error == null
          ? undefined
          : `Labour Categories could not be loaded: ${fieldForCode(query.error, {}).message}`,
    };
  }, [query.data, query.error, vendor]);
}

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
      <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
        No Projects yet. Add a Project first, then assign the Vendor to it.
      </p>
    );
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {data.items.map((project) => {
        const checked = value.includes(project.id);
        return (
          <li key={project.id}>
            <Label className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 font-normal">
              <Checkbox
                checked={checked}
                onCheckedChange={(next) => {
                  onChange(
                    next
                      ? [...value, project.id]
                      : value.filter((id) => id !== project.id),
                  );
                }}
              />
              {project.name}
            </Label>
          </li>
        );
      })}
    </ul>
  );
}

function VendorForm({
  vendor,
  onSave,
  saving,
}: {
  vendor: VendorResponse | null;
  onSave: (payload: Payload) => Promise<unknown>;
  saving: boolean;
}) {
  const router = useRouter();
  // Amounts come back null without the Financial flag; a new Vendor assumes it.
  const showAmounts = vendor == null || vendor.openingBalance != null;
  const categories = useCategoryChoices(vendor);
  const form = useForm<VendorFormValues>({
    resolver: zodResolver(vendorFormSchema(showAmounts)),
    defaultValues: vendorFormDefaults(vendor),
  });
  const errors = form.formState.errors;

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSave(vendorPayload(values, showAmounts));
      router.push(VENDORS_PATH);
    } catch (error) {
      const field = vendorErrorField(error, values);
      const { message } = fieldForCode(error, {});
      form.setError(field ?? "root", {
        message,
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
      <section aria-labelledby="vendor-details" className="space-y-4">
        <h2 id="vendor-details" className="font-semibold">
          Details
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="vendor-name">Vendor name</Label>
            <Input
              id="vendor-name"
              className="h-10"
              autoComplete="off"
              aria-invalid={errors.name != null}
              {...form.register("name")}
            />
            <FieldError message={errors.name?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vendor-joining-date">Joining date</Label>
            <Input
              id="vendor-joining-date"
              type="date"
              className="h-10"
              aria-invalid={errors.joiningDate != null}
              {...form.register("joiningDate")}
            />
            <FieldError message={errors.joiningDate?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vendor-contact">Contact number</Label>
            <MobileField
              id="vendor-contact"
              aria-invalid={errors.contactNumber != null}
              {...form.register("contactNumber")}
            />
            <FieldError message={errors.contactNumber?.message} />
          </div>
          {showAmounts && (
            <div className="space-y-1.5">
              <Label htmlFor="vendor-opening-balance">Opening balance</Label>
              <MoneyInput
                id="vendor-opening-balance"
                className="h-10"
                placeholder="0"
                aria-describedby="vendor-opening-balance-hint"
                aria-invalid={errors.openingBalance != null}
                {...form.register("openingBalance")}
              />
              <p
                id="vendor-opening-balance-hint"
                className="text-muted-foreground text-xs"
              >
                What you owed them on the joining date. Negative for an advance
                already given.
              </p>
              <FieldError message={errors.openingBalance?.message} />
            </div>
          )}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="vendor-address">Address</Label>
            <Textarea
              id="vendor-address"
              rows={2}
              aria-invalid={errors.address != null}
              {...form.register("address")}
            />
            <FieldError message={errors.address?.message} />
          </div>
        </div>
      </section>

      <section aria-labelledby="vendor-projects" className="space-y-3">
        <div className="space-y-1">
          <h2 id="vendor-projects" className="font-semibold">
            Projects
          </h2>
          <p className="text-muted-foreground text-sm">
            The Vendor appears on the attendance screen of these Projects.
          </p>
        </div>
        <Suspense fallback={<Skeleton className="h-11 w-full" />}>
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

      <FormAlert message={categories.error} />
      <RateCardEditor
        control={form.control}
        register={form.register}
        errors={errors}
        categories={categories.choices}
        showAmounts={showAmounts}
      />

      <FormAlert message={errors.root?.message} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Link
          href={VENDORS_PATH}
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
          back={{ label: "Vendors", href: VENDORS_PATH }}
          title={title}
        />
        {children}
      </div>
    </div>
  );
}

export function NewVendorScreen() {
  const create = useCreateVendor();
  return (
    <FormPage title="Add Vendor">
      <VendorForm
        vendor={null}
        saving={create.isPending}
        onSave={(payload) => create.mutateAsync(payload)}
      />
    </FormPage>
  );
}

export function EditVendorScreen({ id }: { id: string }) {
  const { data } = useSuspenseQuery(vendorQuery(id));
  const update = useUpdateVendor(id);
  return (
    <FormPage title={`Edit ${data.name}`}>
      <VendorForm
        key={data.updatedAt}
        vendor={data}
        saving={update.isPending}
        onSave={(payload) =>
          update.mutateAsync({ ...payload, expectedUpdatedAt: data.updatedAt })
        }
      />
    </FormPage>
  );
}
