"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
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
import { Switch } from "@repo/ui/components/switch";
import { Textarea } from "@repo/ui/components/textarea";

import { PageHeader } from "@/components/app-shell/page-header";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { MobileField } from "@/components/auth/mobile-field";
import {
  GST_STATE_ITEMS,
  NO_STATE,
  gstStateLabel,
  gstinState,
} from "@/components/parties/party-form-schema";
import { fieldForCode } from "@/lib/server-errors";
import {
  clientQuery,
  useCreateClient,
  useUpdateClient,
  type Client,
  type ClientInput,
} from "@/src/queries/masters-clients";

import {
  CLIENTS_PATH,
  clientErrorField,
  clientFormDefaults,
  clientFormSchema,
  clientPayload,
  type ClientFormValues,
} from "./client-form-schema";

/**
 * The Client form (CM-1101, ADR CM-0023 §2): who the Company builds for
 * and bills. Name and contact, the billing address with its PIN, and the
 * tax ids a tax invoice carries: GSTIN (fills the GST state), PAN and TAN.
 */
export function ClientForm({
  client,
  onSave,
  saving,
}: {
  client: Client | null;
  onSave: (payload: ClientInput) => Promise<unknown>;
  saving: boolean;
}) {
  const router = useRouter();
  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: clientFormDefaults(client),
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
      await onSave(clientPayload(values));
      router.push(CLIENTS_PATH);
    } catch (error) {
      form.setError(clientErrorField(error) ?? "root", {
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
      <section aria-labelledby="client-details" className="space-y-4">
        <h2 id="client-details" className="font-semibold">
          Details
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="min-w-0 space-y-1.5 sm:col-span-2">
            <Label htmlFor="client-name" required>
              Client name
            </Label>
            <Input
              id="client-name"
              className="h-10"
              autoComplete="off"
              placeholder="Sri Balaji Developers"
              aria-required
              aria-invalid={errors.name != null}
              {...form.register("name")}
            />
            <FieldError message={errors.name?.message} />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="client-contact">Contact person</Label>
            <Input
              id="client-contact"
              className="h-10"
              autoComplete="off"
              aria-invalid={errors.contactPerson != null}
              {...form.register("contactPerson")}
            />
            <FieldError message={errors.contactPerson?.message} />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="client-mobile">Mobile</Label>
            <MobileField
              id="client-mobile"
              aria-invalid={errors.mobile != null}
              {...form.register("mobile")}
            />
            <FieldError message={errors.mobile?.message} />
          </div>
          <div className="min-w-0 space-y-1.5 sm:col-span-2">
            <Label htmlFor="client-email">Email</Label>
            <Input
              id="client-email"
              type="email"
              className="h-10"
              autoComplete="off"
              aria-invalid={errors.email != null}
              {...form.register("email")}
            />
            <FieldError message={errors.email?.message} />
          </div>
        </div>
      </section>

      <section aria-labelledby="client-billing" className="space-y-4">
        <div className="space-y-1">
          <h2 id="client-billing" className="font-semibold">
            Billing
          </h2>
          <p className="text-muted-foreground text-sm">
            Printed on the tax invoices you send this Client.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="min-w-0 space-y-1.5 sm:col-span-2 lg:col-span-2">
            <Label htmlFor="client-address">Billing address</Label>
            <Textarea
              id="client-address"
              rows={2}
              aria-invalid={errors.address != null}
              {...form.register("address")}
            />
            <FieldError message={errors.address?.message} />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="client-pin">PIN code</Label>
            <Input
              id="client-pin"
              className="h-10"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={7}
              aria-invalid={errors.pinCode != null}
              {...form.register("pinCode")}
            />
            <FieldError message={errors.pinCode?.message} />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="client-gstin">GSTIN</Label>
            <Input
              id="client-gstin"
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
            <Label htmlFor="client-state">GST state</Label>
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
                      id="client-state"
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
            <Label htmlFor="client-pan">PAN</Label>
            <Input
              id="client-pan"
              className="h-10 uppercase"
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={10}
              aria-invalid={errors.pan != null}
              {...form.register("pan")}
            />
            <FieldError message={errors.pan?.message} />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="client-tan">TAN</Label>
            <Input
              id="client-tan"
              className="h-10 uppercase"
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={10}
              aria-invalid={errors.tan != null}
              aria-describedby="client-tan-hint"
              {...form.register("tan")}
            />
            <p id="client-tan-hint" className="text-muted-foreground text-xs">
              When the Client deducts TDS from your bills.
            </p>
            <FieldError message={errors.tan?.message} />
          </div>
        </div>
      </section>

      <Controller
        name="isActive"
        control={form.control}
        render={({ field }) => (
          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div className="min-w-0 space-y-0.5">
              <Label htmlFor="client-active">Active</Label>
              <p
                id="client-active-hint"
                className="text-muted-foreground text-xs"
              >
                Inactive Clients stay on their Projects but are not offered for
                new ones.
              </p>
            </div>
            <Switch
              id="client-active"
              aria-describedby="client-active-hint"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          </div>
        )}
      />

      <FormAlert message={errors.root?.message} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Link
          href={CLIENTS_PATH}
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
          back={{ label: "Clients", href: CLIENTS_PATH }}
          title={title}
        />
        {children}
      </div>
    </div>
  );
}

/** Master records → Clients → Add. */
export function NewClientScreen() {
  const create = useCreateClient();
  return (
    <FormPage title="Add Client">
      <ClientForm
        client={null}
        saving={create.isPending || create.isSuccess}
        onSave={(payload) => create.mutateAsync(payload)}
      />
    </FormPage>
  );
}

/** Master records → Clients → Edit; 409 when someone saved it since. */
export function EditClientScreen({ id }: { id: string }) {
  const { data } = useSuspenseQuery(clientQuery(id));
  const update = useUpdateClient(id);
  return (
    <FormPage title={`Edit ${data.name}`}>
      <ClientForm
        key={data.updatedAt}
        client={data}
        saving={update.isPending || update.isSuccess}
        onSave={(payload) =>
          update.mutateAsync({ ...payload, expectedUpdatedAt: data.updatedAt })
        }
      />
    </FormPage>
  );
}
