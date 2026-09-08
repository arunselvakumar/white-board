"use client";

import { useAuth, useOrganizationList } from "@clerk/nextjs";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

import { AuthHeading } from "@/components/auth/auth-heading";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { LoadingScreen } from "@/components/auth/loading-screen";
import { postWorkspacePath } from "@/lib/safe-redirect";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Workspace name is required")
    .max(100, "Workspace name must be 100 characters or fewer"),
});

type FormValues = z.infer<typeof schema>;

export function CreateWorkspaceForm({ redirectUrl }: { redirectUrl: string }) {
  const router = useRouter();
  const { orgId } = useAuth();
  const { isLoaded, createOrganization, setActive, userMemberships } =
    useOrganizationList({ userMemberships: true });
  const destination = postWorkspacePath(redirectUrl);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

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
      const organization = await createOrganization({ name: values.name });
      await setActive({ organization: organization.id });
      router.replace(destination);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not create your workspace. Please try again.";
      setError("root", { message });
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
