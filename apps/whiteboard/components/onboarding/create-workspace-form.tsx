"use client";

import { useAuth, useOrganizationList } from "@clerk/nextjs";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
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

import { AuthHeading } from "@/components/auth/auth-heading";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { LoadingScreen } from "@/components/auth/loading-screen";
import {
  INSTITUTION_TYPES,
  INSTITUTION_TYPE_VALUES,
  type InstitutionType,
} from "@/lib/institution-type";
import { postWorkspacePath } from "@/lib/safe-redirect";

const schema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Workspace name is required")
      .max(100, "Workspace name must be 100 characters or fewer"),
    institutionType: z.enum(INSTITUTION_TYPE_VALUES, {
      error: "Select an institution type",
    }),
    institutionTypeOther: z.string().trim(),
  })
  .superRefine((data, ctx) => {
    if (data.institutionType !== "other") {
      return;
    }
    if (data.institutionTypeOther.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["institutionTypeOther"],
        message: "Describe the institution type",
      });
      return;
    }
    if (data.institutionTypeOther.length > 100) {
      ctx.addIssue({
        code: "custom",
        path: ["institutionTypeOther"],
        message: "Description must be 100 characters or fewer",
      });
    }
  });

type FormValues = z.infer<typeof schema>;

export type CreateWorkspaceResult =
  | { ok: true; id: string }
  | { ok: false; message: string };

export type CreateWorkspaceFn = (input: {
  name: string;
  institutionType: InstitutionType;
  institutionTypeOther?: string;
}) => Promise<CreateWorkspaceResult>;

export function CreateWorkspaceForm({
  redirectUrl,
  createWorkspace,
}: {
  redirectUrl: string;
  createWorkspace: CreateWorkspaceFn;
}) {
  const router = useRouter();
  const { orgId } = useAuth();
  const { isLoaded, setActive, userMemberships } = useOrganizationList({
    userMemberships: true,
  });
  const destination = postWorkspacePath(redirectUrl);

  const {
    register,
    control,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      institutionType: null as unknown as InstitutionType,
      institutionTypeOther: "",
    },
  });

  const institutionType = watch("institutionType");

  const membershipCount = userMemberships.count ?? 0;

  useEffect(() => {
    if (!isLoaded || userMemberships.isLoading) {
      return;
    }
    if (orgId != null || membershipCount > 0) {
      router.replace(destination);
    }
  }, [
    destination,
    isLoaded,
    membershipCount,
    orgId,
    router,
    userMemberships.isLoading,
  ]);

  const onSubmit = async (values: FormValues) => {
    if (!isLoaded) {
      return;
    }
    try {
      const result = await createWorkspace(
        values.institutionType === "other"
          ? {
              name: values.name,
              institutionType: values.institutionType,
              institutionTypeOther: values.institutionTypeOther,
            }
          : {
              name: values.name,
              institutionType: values.institutionType,
            },
      );
      if (!result.ok) {
        setError("root", { message: result.message });
        return;
      }
      await setActive({ organization: result.id });
      router.replace(destination);
    } catch {
      setError("root", {
        message: "Could not create your workspace. Please try again.",
      });
    }
  };

  if (
    !isLoaded ||
    userMemberships.isLoading ||
    orgId != null ||
    membershipCount > 0
  ) {
    return <LoadingScreen />;
  }

  return (
    <>
      <AuthHeading
        title="Create your workspace"
        description="Name the workspace you'll work in"
      />
      <form
        onSubmit={(event) => {
          void handleSubmit(onSubmit)(event);
        }}
        className="space-y-4"
        noValidate
      >
        <div className="space-y-1.5">
          <Label htmlFor="name">Workspace name</Label>
          <Input
            id="name"
            autoComplete="organization"
            autoFocus
            placeholder="e.g. Riverside School"
            className="h-10"
            {...register("name")}
          />
          <FieldError message={errors.name?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="institutionType">
            What kind of institution is this?
          </Label>
          <Controller
            name="institutionType"
            control={control}
            render={({ field }) => (
              <Select
                items={INSTITUTION_TYPES}
                value={field.value}
                onValueChange={(value) => {
                  if (value == null) {
                    return;
                  }
                  field.onChange(value);
                }}
              >
                <SelectTrigger
                  id="institutionType"
                  aria-invalid={errors.institutionType != null}
                  className="h-10 w-full min-w-0"
                >
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  {INSTITUTION_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError message={errors.institutionType?.message} />
        </div>
        {institutionType === "other" ? (
          <div className="space-y-1.5">
            <Label htmlFor="institutionTypeOther">
              Describe the institution type
            </Label>
            <Input
              id="institutionTypeOther"
              autoFocus
              placeholder="e.g. Language school"
              className="h-10"
              {...register("institutionTypeOther")}
            />
            <FieldError message={errors.institutionTypeOther?.message} />
          </div>
        ) : null}
        <FormAlert message={errors.root?.message} />
        <Button
          type="submit"
          disabled={isSubmitting}
          className="mt-4 h-10 w-full"
        >
          {isSubmitting ? "Creating…" : "Create workspace"}
        </Button>
      </form>
    </>
  );
}
