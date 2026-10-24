"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import { RefreshCw, TriangleAlert, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Controller, useForm, type UseFormReturn } from "react-hook-form";
import { z } from "zod";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@repo/ui/components/alert";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";

import { PageHeader } from "@/components/app-shell/page-header";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { PermissionMatrix } from "@/components/permissions/permission-matrix";
import { fieldForCode } from "@/lib/server-errors";
import { ROLES_PATH } from "@/lib/users-roles-nav";
import { QueryHttpError } from "@/src/queries/http";
import {
  roleQuery,
  useCreateRole,
  useUpdateRole,
  type Role,
  type RoleInput,
} from "@/src/queries/roles";
import type { PermissionGrants } from "@/src/shared-kernel/access";

import { usersCount } from "./roles-list";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter the Role name")
    .max(100, "Use at most 100 characters"),
  description: z.string().trim().max(300, "Use at most 300 characters"),
  permissions: z.custom<PermissionGrants>(),
});

type Values = z.infer<typeof schema>;

const SERVER_FIELDS: Record<string, keyof Values> = {
  ROLE_NAME_REQUIRED: "name",
  ROLE_NAME_TOO_LONG: "name",
  ROLE_NAME_TAKEN: "name",
  ROLE_DESCRIPTION_TOO_LONG: "description",
};

function valuesOf(role: Role | null): Values {
  return {
    name: role?.name ?? "",
    description: role?.description ?? "",
    permissions: role?.permissions ?? {},
  };
}

function inputOf(values: Values): RoleInput {
  return {
    name: values.name,
    description: values.description === "" ? null : values.description,
    permissions: values.permissions,
  };
}

/** Name, description and the Permission Matrix; Save adds or updates. */
function RoleForm({
  role,
  readOnly,
  onSave,
  saving,
  banner,
  form,
}: {
  role: Role | null;
  readOnly: boolean;
  onSave: (input: RoleInput) => Promise<unknown>;
  saving: boolean;
  /** Above the actions: the stale-version notice on Edit. */
  banner?: ReactNode;
  form: UseFormReturn<Values>;
}) {
  const router = useRouter();
  const errors = form.formState.errors;

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSave(inputOf(values));
      router.push(ROLES_PATH);
    } catch (error) {
      if (error instanceof QueryHttpError && error.code === "STALE_ROLE")
        return;
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
      <div className="grid max-w-2xl gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="role-name" required>
            Role name
          </Label>
          <Input
            id="role-name"
            className="h-10"
            autoComplete="off"
            placeholder="Site Engineer"
            readOnly={readOnly}
            aria-required
            aria-invalid={errors.name != null}
            {...form.register("name")}
          />
          <FieldError message={errors.name?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="role-description">Description</Label>
          <Textarea
            id="role-description"
            rows={2}
            placeholder="What people on this Role do"
            readOnly={readOnly}
            aria-invalid={errors.description != null}
            {...form.register("description")}
          />
          <FieldError message={errors.description?.message} />
        </div>
      </div>
      <section aria-labelledby="role-permissions" className="space-y-2">
        <div className="space-y-1">
          <h2 id="role-permissions" className="font-semibold">
            Permission Matrix
          </h2>
          <p className="text-muted-foreground text-sm">
            {readOnly
              ? "What Users on this Role may do."
              : "Tick what Users on this Role may do. You can only give what you can do yourself."}
          </p>
        </div>
        <Controller
          name="permissions"
          control={form.control}
          render={({ field }) => (
            <PermissionMatrix
              value={field.value}
              onChange={field.onChange}
              readOnly={readOnly}
            />
          )}
        />
      </section>
      {banner}
      <FormAlert message={errors.root?.message} />
      <div className="flex flex-wrap gap-2">
        {readOnly ? null : (
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : role == null ? "Add Role" : "Save"}
          </Button>
        )}
        <Link
          href={ROLES_PATH}
          className={buttonVariants({ variant: "outline" })}
        >
          {readOnly ? "Back" : "Cancel"}
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
          back={{ label: "Role Management", href: ROLES_PATH }}
          title={title}
          meta={meta}
        />
        {children}
      </div>
    </div>
  );
}

/** Add Role (ADR CM-0030). */
export function NewRoleScreen() {
  const create = useCreateRole();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: valuesOf(null),
  });
  return (
    <FormPage
      title="Add Role"
      meta="Give it to Users on Add User or Edit User."
    >
      <RoleForm
        form={form}
        role={null}
        readOnly={false}
        saving={create.isPending}
        onSave={(input) => create.mutateAsync(input)}
      />
    </FormPage>
  );
}

/**
 * Edit Role. The save carries the version the form loaded; when someone
 * saved in between (409 STALE_ROLE) the form offers to reload theirs.
 */
export function EditRoleScreen({
  id,
  canUpdate,
}: {
  id: string;
  canUpdate: boolean;
}) {
  const { data, refetch, isRefetching } = useSuspenseQuery(roleQuery(id));
  const update = useUpdateRole(id);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: valuesOf(data),
  });
  const [stale, setStale] = useState(false);

  const reload = async () => {
    const fresh = await refetch();
    if (fresh.data == null) return;
    form.reset(valuesOf(fresh.data));
    setStale(false);
  };

  return (
    <FormPage
      title={canUpdate ? `Edit ${data.name}` : data.name}
      meta={
        <span className="inline-flex items-center gap-1.5">
          <Users aria-hidden="true" className="size-4" />
          {data.userCount === 0
            ? "No Users are on this Role yet."
            : canUpdate
              ? `Changes apply to the ${usersCount(data.userCount)} on this Role.`
              : `${usersCount(data.userCount)} on this Role.`}
        </span>
      }
    >
      <RoleForm
        form={form}
        role={data}
        readOnly={!canUpdate}
        saving={update.isPending}
        onSave={async (input) => {
          try {
            return await update.mutateAsync({
              ...input,
              updatedAt: data.updatedAt,
            });
          } catch (error) {
            if (error instanceof QueryHttpError && error.code === "STALE_ROLE")
              setStale(true);
            throw error;
          }
        }}
        banner={
          stale ? (
            <Alert variant="destructive">
              <TriangleAlert aria-hidden="true" />
              <AlertTitle>Someone else changed this Role</AlertTitle>
              <AlertDescription>
                They saved it while you were editing. Reload to see their
                changes, then make yours again.
              </AlertDescription>
              <AlertAction>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isRefetching}
                  onClick={() => {
                    void reload();
                  }}
                >
                  <RefreshCw aria-hidden="true" />
                  Reload
                </Button>
              </AlertAction>
            </Alert>
          ) : null
        }
      />
    </FormPage>
  );
}
