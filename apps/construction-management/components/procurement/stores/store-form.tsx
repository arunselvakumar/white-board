"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
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
import { fieldForCode } from "@/lib/server-errors";
import { GST_STATES } from "@/src/shared-kernel/gst-states";
import {
  storeFormOptionsQuery,
  useCreateStore,
  useUpdateStore,
  type Store,
} from "@/src/queries/stores";

import { centralStoreHref, NamedMultiSelect } from "./central-store-parts";

const NO_STATE = "none";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter the store name.")
    .max(120, "Use at most 120 characters."),
  address: z.string().max(500, "Use at most 500 characters."),
  stateCode: z.string(),
  projectIds: z.array(z.string()).min(1, "Choose at least one Project."),
  keeperIds: z.array(z.string()),
  supplierIds: z.array(z.string()),
});

type Values = z.infer<typeof schema>;

const SERVER_FIELDS = {
  STORE_NAME_TAKEN: "name",
  STORE_NAME_REQUIRED: "name",
  STORE_NAME_TOO_LONG: "name",
  STORE_ADDRESS_TOO_LONG: "address",
  STORE_STATE_INVALID: "stateCode",
  STORE_PROJECTS_REQUIRED: "projectIds",
  STORE_PROJECT_IN_USE: "projectIds",
  PROJECT_NOT_FOUND: "projectIds",
  TEAM_MEMBER_NOT_FOUND: "keeperIds",
  SUPPLIER_NOT_FOUND: "supplierIds",
  SUPPLIER_INACTIVE: "supplierIds",
} as const;

const STATE_ITEMS = [
  { value: NO_STATE, label: "Not set" },
  ...GST_STATES.map((state) => ({
    value: state.code,
    label: `${state.name} (${state.code})`,
  })),
];

/**
 * Add store / Edit store (CM-508): name, address and GST state, the
 * Projects it serves (at least one), its store keepers and Suppliers.
 */
export function StoreForm({ store }: { store?: Store }) {
  const router = useRouter();
  const { data: options } = useSuspenseQuery(storeFormOptionsQuery);
  const create = useCreateStore();
  const update = useUpdateStore(store?.id ?? "");
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: store?.name ?? "",
      address: store?.address ?? "",
      stateCode: store?.stateCode ?? NO_STATE,
      projectIds: store?.projects.map((item) => item.id) ?? [],
      keeperIds: store?.keepers.map((item) => item.id) ?? [],
      supplierIds: store?.suppliers.map((item) => item.id) ?? [],
    },
  });
  const errors = form.formState.errors;
  // Rows already on the store stay pickable even if they left the options.
  const withKept = (
    list: readonly { id: string; name: string }[],
    kept: readonly { id: string; name: string }[] = [],
  ) => [...list, ...kept.filter((item) => !list.some((row) => row.id === item.id))];

  const submit = async (values: Values) => {
    const input = {
      name: values.name,
      address: values.address.trim() === "" ? null : values.address,
      stateCode: values.stateCode === NO_STATE ? null : values.stateCode,
      projectIds: values.projectIds,
      keeperIds: values.keeperIds,
      supplierIds: values.supplierIds,
    };
    try {
      const saved =
        store == null
          ? await create.mutateAsync(input)
          : await update.mutateAsync({
              ...input,
              expectedUpdatedAt: store.updatedAt,
            });
      router.push(centralStoreHref.store(saved.id));
    } catch (error) {
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
      form.setError(field ?? "root", { message });
    }
  };

  const back =
    store == null
      ? { label: "Central Store", href: centralStoreHref.stores }
      : { label: store.name, href: centralStoreHref.store(store.id) };

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader back={back} title={store == null ? "Add store" : "Edit store"} />
        <form
          noValidate
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit(submit)(event);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="store-name">Store name</Label>
              <Input
                id="store-name"
                className="h-10"
                autoComplete="off"
                aria-invalid={errors.name != null}
                {...form.register("name")}
              />
              <FieldError message={errors.name?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="store-state">GST state</Label>
              <Controller
                name="stateCode"
                control={form.control}
                render={({ field }) => (
                  <Select
                    items={STATE_ITEMS}
                    value={field.value}
                    onValueChange={(value) => {
                      if (value != null) field.onChange(value);
                    }}
                  >
                    <SelectTrigger
                      id="store-state"
                      size="lg"
                      className="w-full min-w-0"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent
                      align="start"
                      alignItemWithTrigger={false}
                      aria-label="GST states"
                    >
                      {STATE_ITEMS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-muted-foreground text-sm">
                Purchase Orders to this store split GST by it.
              </p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="store-address">Store address</Label>
              <Textarea
                id="store-address"
                rows={2}
                aria-invalid={errors.address != null}
                {...form.register("address")}
              />
              <FieldError message={errors.address?.message} />
            </div>
          </div>

          <section className="space-y-4">
            <h2 className="font-semibold">Assignments</h2>
            <div className="space-y-1.5">
              <Label htmlFor="store-projects">Projects</Label>
              <Controller
                name="projectIds"
                control={form.control}
                render={({ field }) => (
                  <NamedMultiSelect
                    id="store-projects"
                    label="Projects"
                    items={withKept(options.projects, store?.projects)}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Choose the Projects this store serves"
                    invalid={errors.projectIds != null}
                  />
                )}
              />
              <FieldError message={errors.projectIds?.message} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="store-keepers">Store keepers</Label>
                <Controller
                  name="keeperIds"
                  control={form.control}
                  render={({ field }) => (
                    <NamedMultiSelect
                      id="store-keepers"
                      label="Team Members"
                      items={withKept(options.teamMembers, store?.keepers)}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Choose Team Members"
                      invalid={errors.keeperIds != null}
                    />
                  )}
                />
                <FieldError message={errors.keeperIds?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="store-suppliers">Suppliers</Label>
                <Controller
                  name="supplierIds"
                  control={form.control}
                  render={({ field }) => (
                    <NamedMultiSelect
                      id="store-suppliers"
                      label="Suppliers"
                      items={withKept(options.suppliers, store?.suppliers)}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Choose Suppliers"
                      invalid={errors.supplierIds != null}
                    />
                  )}
                />
                <FieldError message={errors.supplierIds?.message} />
              </div>
            </div>
          </section>

          <FormAlert message={errors.root?.message} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting
                ? "Saving…"
                : store == null
                  ? "Add store"
                  : "Save"}
            </Button>
            <Link href={back.href} className={buttonVariants({ variant: "outline" })}>
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
