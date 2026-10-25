"use client";

import { useActiveCompany } from "@repo/auth/construction/react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useMutation,
  useQueryClient,
  useSuspenseQueries,
} from "@tanstack/react-query";
import {
  FolderKanban,
  KeyRound,
  Send,
  ShieldCheck,
  UserRound,
} from "lucide-react";
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
import { paiseToRupees } from "@/components/money/money-input";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import { STAFF_PATH } from "@/lib/staff-roles-nav";
import { ROLES_KEY, rolesQuery } from "@/src/queries/roles";
import {
  TEAM_MEMBERS_KEY,
  designationOptionsQuery,
  resendTeamMemberInvite,
  setTeamMemberRole,
  teamMemberQuery,
  updateTeamMember,
  type PasswordOutcome,
  type TeamMember,
} from "@/src/queries/team-members";

import { MemberStatusBadge } from "./member-status-badge";
import { TeamMemberProjectsTab } from "./projects-step";
import { RoleField } from "./role-field";
import { SetPasswordDialog } from "./set-password-dialog";
import { ShareInviteDialog } from "./share-invite-dialog";
import { signInWays } from "./sign-in-options";
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
    monthlySalary: paiseToRupees(member.monthlySalary),
  };
}

/** What the last sign-in action did, for the line under the header. */
type Notice = { tone: "status" | "alert"; text: string };

function passwordNotice(outcome: TeamMember & PasswordOutcome): Notice {
  if (outcome.passwordIgnored === "existing_account")
    return {
      tone: "alert",
      text: `${outcome.name} already has an account, so we did not set the password. They got a Join Request instead.`,
    };
  return {
    tone: "status",
    text: `Password set. ${outcome.name} signs in with ${signInWays(outcome)} and that password, and must change it the next time they sign in.`,
  };
}

/**
 * Edit Staff (CM-111, ADR CM-0030): Details, Projects and Role tabs, and
 * from the header Set a new password and the invitation.
 */
export function EditTeamMember({
  id,
  canSeeSalary,
}: {
  id: string;
  /** Financial on Staff (ADR CM-0032). */
  canSeeSalary: boolean;
}) {
  const [{ data: member }, { data: designations }, { data: roles }] =
    useSuspenseQueries({
      queries: [teamMemberQuery(id), designationOptionsQuery, rolesQuery],
    });
  const { company } = useActiveCompany();
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
        detailsInput(values, { keepIdentifiersWhenBlank: true, canSeeSalary }),
      ),
    onSuccess: async (updated) => {
      await saved(updated);
      form.reset(valuesOf(updated));
    },
  });

  const [roleId, setRoleId] = useState<string | null>(member.role?.id ?? null);
  const role = useMutation({
    mutationFn: (next: string) => setTeamMemberRole(id, next),
    onSuccess: async (updated) => {
      await saved(updated);
      // Both Roles' staff counts changed.
      await queryClient.invalidateQueries({ queryKey: ROLES_KEY });
    },
  });

  const [notice, setNotice] = useState<Notice | null>(null);
  const [settingPassword, setSettingPassword] = useState(false);
  const [sharing, setSharing] = useState(false);
  const invite = useMutation({
    mutationFn: () => resendTeamMemberInvite(id),
    onSuccess: async (updated) => {
      await saved(updated);
      setNotice(null);
      setSharing(true);
    },
  });

  const canInvite =
    !member.isOwner && member.status !== "active" && member.email != null;
  const roleChanged = roleId != null && roleId !== member.role?.id;

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Staff", href: STAFF_PATH }}
          title={member.name}
          meta={
            <span className="inline-flex flex-wrap items-center gap-2">
              {[
                member.designation.name,
                member.role == null ? null : `Role: ${member.role.name}`,
              ]
                .filter(Boolean)
                .join(" · ")}
              <MemberStatusBadge status={member.status} />
            </span>
          }
          actions={
            member.canSetPassword || canInvite ? (
              <>
                {canInvite && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={invite.isPending}
                    onClick={() => {
                      invite.mutate();
                    }}
                  >
                    <Send aria-hidden="true" />
                    {member.status === "rejected"
                      ? "Invite again"
                      : "Send invitation"}
                  </Button>
                )}
                {member.canSetPassword && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setNotice(null);
                      setSettingPassword(true);
                    }}
                  >
                    <KeyRound aria-hidden="true" />
                    Set a new password
                  </Button>
                )}
              </>
            ) : null
          }
        />
        {notice != null &&
          (notice.tone === "alert" ? (
            <p
              role="alert"
              className="bg-card rounded-lg border px-4 py-3 text-sm"
            >
              {notice.text}
            </p>
          ) : (
            <p
              role="status"
              className="bg-card text-muted-foreground rounded-lg border px-4 py-3 text-sm"
            >
              {notice.text}
            </p>
          ))}
        <FormAlert
          message={
            invite.error == null
              ? undefined
              : fieldForCode(invite.error, {}).message
          }
        />
        <Tabs defaultValue="details" className="gap-6">
          <TabsList>
            <TabsTrigger value="details">
              <UserRound aria-hidden="true" />
              Details
            </TabsTrigger>
            {member.memberType === "normal" && (
              <TabsTrigger value="projects">
                <FolderKanban aria-hidden="true" />
                Projects
              </TabsTrigger>
            )}
            <TabsTrigger value="role">
              <ShieldCheck aria-hidden="true" />
              Role
            </TabsTrigger>
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
                canSeeSalary={canSeeSalary}
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

          <TabsContent value="role" className="space-y-4">
            {member.isOwner ? (
              <p className="text-muted-foreground text-sm">
                The Owner can do everything, so they have no Role.
              </p>
            ) : (
              <>
                <RoleField
                  id="member-role"
                  roles={roles}
                  value={roleId}
                  onChange={(next) => {
                    setRoleId(next);
                    role.reset();
                  }}
                />
                <FormAlert
                  message={
                    role.error == null
                      ? undefined
                      : fieldForCode(role.error, {}).message
                  }
                />
                {role.isSuccess && (
                  <p role="status" className="text-muted-foreground text-sm">
                    Role saved. It applies from their next request.
                  </p>
                )}
                <div className="flex justify-end">
                  <Button
                    type="button"
                    disabled={!roleChanged || role.isPending}
                    onClick={() => {
                      if (roleId != null) role.mutate(roleId);
                    }}
                  >
                    {role.isPending ? "Saving…" : "Save Role"}
                  </Button>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
      {member.canSetPassword && (
        <SetPasswordDialog
          member={member}
          open={settingPassword}
          onOpenChange={setSettingPassword}
          onDone={(outcome) => {
            setSettingPassword(false);
            setNotice(passwordNotice(outcome));
          }}
        />
      )}
      {member.invitePath != null && member.email != null && (
        <ShareInviteDialog
          open={sharing}
          onOpenChange={setSharing}
          memberName={member.name}
          companyName={company?.name ?? "our Company"}
          email={member.email}
          invitePath={member.invitePath}
        />
      )}
    </div>
  );
}
