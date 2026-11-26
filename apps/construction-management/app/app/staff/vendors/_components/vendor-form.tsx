"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";

import { PageHeader } from "@/app/app/_components/app-shell/page-header";
import {
  PendingPhoto,
  StaffFiles,
  type PendingPhotoValue,
  type StaffFilesApi,
} from "@/app/app/staff/_components/staff-files";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { MobileField } from "@/components/auth/mobile-field";
import { MoneyInput } from "@/components/money/money-input";
import type { AppHref } from "@/lib/page-href";
import { fieldForCode } from "@/lib/server-errors";
import { VENDORS_PATH, vendorPagePath } from "@/lib/staff-nav";
import { lookupListQuery } from "@/src/queries/masters";
import {
  VENDORS_KEY,
  addVendorDocument,
  deleteVendorDocument,
  removeVendorPhoto,
  uploadVendorPhoto,
  useCreateVendor,
  vendorDocumentsQuery,
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

const VENDOR_FILES: StaffFilesApi = {
  queryKey: VENDORS_KEY,
  documentsQuery: vendorDocumentsQuery,
  uploadPhoto: uploadVendorPhoto,
  removePhoto: removeVendorPhoto,
  addDocument: addVendorDocument,
  deleteDocument: deleteVendorDocument,
};

/**
 * Add and Edit Vendor: Details and the rate card. Projects are not set
 * here: a Vendor is put on a Project from the Project's Resources. Add
 * Vendor starts with the photo (`photo`); Edit Vendor shows Photo &
 * documents above the form.
 */
function VendorForm({
  vendor,
  onSave,
  saving,
  photo,
}: {
  vendor: VendorResponse | null;
  /** Resolves to where to go next, or the Vendors list when null. */
  onSave: (payload: Payload) => Promise<AppHref | null>;
  saving: boolean;
  /** Add Vendor's photo, taken or chosen before Save. */
  photo?: {
    value: PendingPhotoValue | null;
    onChange: (photo: PendingPhotoValue | null) => void;
  };
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
  const name = useWatch({ control: form.control, name: "name" });

  const submit = form.handleSubmit(async (values) => {
    try {
      const next = await onSave(vendorPayload(values, showAmounts));
      router.push(next ?? VENDORS_PATH);
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
      className="space-y-6"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      {photo != null && (
        <PendingPhoto
          name={name}
          value={photo.value}
          onChange={photo.onChange}
        />
      )}
      <section
        aria-labelledby="vendor-details"
        className="bg-card space-y-4 rounded-xl border p-4 sm:p-5"
      >
        <h2 id="vendor-details" className="font-semibold">
          Details
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="vendor-name" required>
              Vendor name
            </Label>
            <Input
              id="vendor-name"
              className="h-10"
              autoComplete="off"
              aria-required
              aria-invalid={errors.name != null}
              {...form.register("name")}
            />
            <FieldError message={errors.name?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vendor-joining-date" required>
              Joining date
            </Label>
            <Input
              id="vendor-joining-date"
              type="date"
              className="h-10"
              aria-required
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

export function FormPage({
  title,
  watermark,
  children,
}: {
  title: string;
  watermark?: string;
  children: ReactNode;
}) {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Vendors", href: VENDORS_PATH }}
          title={title}
          watermark={watermark}
        />
        {children}
      </div>
    </div>
  );
}

export function NewVendorScreen() {
  const create = useCreateVendor();
  const [photo, setPhoto] = useState<PendingPhotoValue | null>(null);
  return (
    <FormPage title="Add Vendor">
      <VendorForm
        vendor={null}
        saving={create.isPending}
        photo={{ value: photo, onChange: setPhoto }}
        onSave={async (payload) => {
          const created = await create.mutateAsync(payload);
          if (photo == null) return null;
          try {
            await uploadVendorPhoto(created.id, photo.file);
            return null;
          } catch {
            // The Vendor is saved; their page shows no photo, to try again.
            return vendorPagePath(created.id);
          }
        }}
      />
    </FormPage>
  );
}

/** Photo & documents, then Edit Vendor's form: the Vendor page's Details tab. */
export function EditVendorDetails({ vendor }: { vendor: VendorResponse }) {
  const update = useUpdateVendor(vendor.id);
  return (
    <div className="space-y-6">
      <StaffFiles owner={vendor} api={VENDOR_FILES} />
      <VendorForm
        key={vendor.updatedAt}
        vendor={vendor}
        saving={update.isPending}
        onSave={async (payload) => {
          await update.mutateAsync({
            ...payload,
            expectedUpdatedAt: vendor.updatedAt,
          });
          return null;
        }}
      />
    </div>
  );
}

export function EditVendorScreen({ id }: { id: string }) {
  const { data } = useSuspenseQuery(vendorQuery(id));
  return (
    <FormPage title={`Edit ${data.name}`} watermark="Vendors">
      <EditVendorDetails vendor={data} />
    </FormPage>
  );
}
