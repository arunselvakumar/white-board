"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@repo/ui/components/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";

import { PageHeader } from "@/components/app-shell/page-header";
import { FormAlert } from "@/components/auth/form-alert";
import { PermissionMatrix } from "@/components/permissions/permission-matrix";
import { fieldForCode } from "@/lib/server-errors";
import { QueryHttpError } from "@/src/queries/http";
import {
  TEAM_MEMBERS_KEY,
  designationOptionsQuery,
  setTeamMemberPermissions,
  teamMemberQuery,
  updateTeamMember,
  type TeamMember,
} from "@/src/queries/team-members";
import type { PermissionGrants } from "@/src/shared-kernel/access";

import { MemberStatusBadge } from "./member-status-badge";
import { TeamMemberProjectsTab } from "./projects-step";
import {
  DETAIL_ERROR_FIELDS,
  TeamMemberDetailsFields,
  detailsInput,
  teamMemberDetailsSchema,
  type TeamMemberDetailsValues,
} from "./team-member-details-fields";

function valuesOf(member: TeamMember): TeamMemberDetailsValues {
  return {
    memberType: member.memberType,
    name: member.name,
    designationId: member.designation.id,
    mobile: member.mobile?.replace(/^\+91/, "") ?? "",
    email: member.email ?? "",
    address: member.address ?? "",
    aadhaar: "",
    pan: "",
    emergencyContact: member.emergencyContact ?? "",
  };
}

function errorMessage(error: unknown): string | undefined {
  if (error == null) return undefined;
  return error instanceof QueryHttpError
    ? error.message
    : "Something went wrong. Please try again.";
}

/** Edit a Team Member (CM-111): Details, Projects and Permission Matrix tabs. */
export function EditTeamMember({ id }: { id: string }) {
  const { data: member } = useSuspenseQuery(teamMemberQuery(id));
  const { data: designations } = useSuspenseQuery(designationOptionsQuery);
  const queryClient = useQueryClient();
  const saved = async (updated: TeamMember) => {
    queryClient.setQueryData(teamMemberQuery(id).queryKey, updated);
    await queryClient.invalidateQueries({ queryKey: TEAM_MEMBERS_KEY });
  };

  const form = useForm<TeamMemberDetailsValues>({
    resolver: zodResolver(teamMemberDetailsSchema),
    defaultValues: valuesOf(member),
  });
  const details = useMutation({
    mutationFn: (values: TeamMemberDetailsValues) =>
      updateTeamMember(
        id,
        detailsInput(values, { keepIdentifiersWhenBlank: true }),
      ),
    onSuccess: async (updated) => {
      await saved(updated);
      form.reset(valuesOf(updated));
    },
  });

  const [grants, setGrants] = useState<PermissionGrants>(member.permissions);
  const permissions = useMutation({
    mutationFn: () => setTeamMemberPermissions(id, grants),
    onSuccess: saved,
  });

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Team Members", href: "/app/masters/team-members" }}
          title={member.name}
          meta={
            <span className="inline-flex flex-wrap items-center gap-2">
              {member.designation.name}
              <MemberStatusBadge status={member.status} />
            </span>
          }
        />
        <Tabs defaultValue="details" className="gap-6">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            {member.memberType === "normal" && (
              <TabsTrigger value="projects">Projects</TabsTrigger>
            )}
            <TabsTrigger value="permissions">Permission Matrix</TabsTrigger>
          </TabsList>

          <TabsContent value="details">
            <form
              noValidate
              className="space-y-6"
              onSubmit={(event) => {
                void form.handleSubmit(async (values) => {
                  try {
                    await details.mutateAsync(values);
                  } catch (error) {
                    const { field, message } = fieldForCode(
                      error,
                      DETAIL_ERROR_FIELDS,
                    );
                    if (field == null) form.setError("root", { message });
                    else form.setError(field, { message });
                  }
                })(event);
              }}
            >
              <TeamMemberDetailsFields
                form={form}
                designations={designations}
                masked={{
                  aadhaar: member.aadhaarMasked,
                  pan: member.panMasked,
                }}
                mobileLocked={member.mobileLocked}
              />
              <FormAlert message={form.formState.errors.root?.message} />
              {details.isSuccess && !form.formState.isDirty && (
                <p role="status" className="text-muted-foreground text-sm">
                  Saved.
                </p>
              )}
              <div className="flex justify-end">
                <Button type="submit" disabled={details.isPending}>
                  {details.isPending ? "Saving…" : "Save details"}
                </Button>
              </div>
            </form>
          </TabsContent>

          {member.memberType === "normal" && (
            <TabsContent value="projects">
              <TeamMemberProjectsTab member={member} />
            </TabsContent>
          )}

          <TabsContent value="permissions" className="space-y-4">
            {member.isOwner ? (
              <p className="text-muted-foreground text-sm">
                The Owner can do everything; their Permission Matrix cannot be
                changed.
              </p>
            ) : (
              <>
                <PermissionMatrix value={grants} onChange={setGrants} />
                <FormAlert message={errorMessage(permissions.error)} />
                {permissions.isSuccess && (
                  <p role="status" className="text-muted-foreground text-sm">
                    Permission Matrix saved.
                  </p>
                )}
                <div className="flex justify-end">
                  <Button
                    disabled={permissions.isPending}
                    onClick={() => {
                      permissions.mutate();
                    }}
                  >
                    {permissions.isPending
                      ? "Saving…"
                      : "Save Permission Matrix"}
                  </Button>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
