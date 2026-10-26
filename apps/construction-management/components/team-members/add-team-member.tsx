"use client";

import { useActiveCompany } from "@repo/auth/construction/react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { CheckCircle2, Info, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm, useWatch, type FieldPath } from "react-hook-form";
import { Button, buttonVariants } from "@repo/ui/components/button";

import { PageHeader } from "@/components/app-shell/page-header";
import { FormAlert } from "@/components/auth/form-alert";
import { FormSection } from "@/components/forms/form-section";
import { fieldForCode } from "@/lib/server-errors";
import { STAFF_PATH } from "@/lib/staff-roles-nav";
import { QueryHttpError } from "@/src/queries/http";
import { ROLES_KEY, rolesQuery } from "@/src/queries/roles";
import {
  TEAM_MEMBERS_KEY,
  createTeamMember,
  type PasswordOutcome,
  type TeamMember,
} from "@/src/queries/team-members";

import { ProjectsField } from "./projects-field";
import { RoleField, hrmsStaffRoleId } from "./role-field";
import { ShareInviteDialog } from "./share-invite-dialog";
import {
  SignInOptions,
  addStaffSchema,
  inviteAvailable,
  signInWays,
  type AddStaffValues,
} from "./sign-in-options";
import {
  EMPTY_DETAILS,
  TeamMemberDetailsFields,
  detailErrorFields,
  detailsInput,
} from "./team-member-details-fields";

const EMPTY: AddStaffValues = { ...EMPTY_DETAILS, invite: true, password: "" };

/** Server codes the Sign-in card owns, beyond the detail fields'. */
const SIGN_IN_ERROR_FIELDS: Record<string, FieldPath<AddStaffValues>> = {
  MEMBER_EMAIL_REQUIRED: "email",
  PASSWORD_TOO_SHORT: "password",
  PASSWORD_TOO_LONG: "password",
};

const ROLE_FIELD_ID = "member-role";

/** Server codes about the Role, shown on the Role card. */
const ROLE_ERRORS = new Set(["ROLE_NOT_FOUND", "ROLE_REQUIRED"]);

type Created = TeamMember &
  PasswordOutcome & { passwordSet: boolean; invited: boolean };

/**
 * Add Staff (CM-111, ADR CM-0033 §1): one page of cards, Details, Salary,
 * Projects, Role and Sign-in, with one button. HRMS members have no
 * Projects card and start on HRMS Staff.
 */
export function AddTeamMember({
  canSeeSalary,
}: {
  /** Financial on Staff (ADR CM-0032). */
  canSeeSalary: boolean;
}) {
  const { data: roles } = useSuspenseQuery(rolesQuery);
  const { company } = useActiveCompany();
  const companyName = company?.name ?? "your Company";
  const queryClient = useQueryClient();
  const form = useForm<AddStaffValues>({
    resolver: zodResolver(addStaffSchema(canSeeSalary)),
    defaultValues: EMPTY,
  });
  const [memberType, email, password, invite] = useWatch({
    control: form.control,
    name: ["memberType", "email", "password", "invite"],
  });
  const [chosenRoleId, setChosenRoleId] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | undefined>();
  const [created, setCreated] = useState<Created | null>(null);
  const [projectIds, setProjectIds] = useState<string[]>([]);

  // HRMS Team Members start on HRMS Staff until another Role is picked.
  const roleId =
    chosenRoleId ?? (memberType === "hrms" ? hrmsStaffRoleId(roles) : null);
  const inviting = inviteAvailable({ email, password }) && invite;

  const mutation = useMutation({
    mutationFn: createTeamMember,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: TEAM_MEMBERS_KEY }),
        // The Role's staff count changed.
        queryClient.invalidateQueries({ queryKey: ROLES_KEY }),
      ]);
    },
  });

  const showRoleError = (message: string) => {
    setRoleError(message);
    const trigger = document.getElementById(ROLE_FIELD_ID);
    trigger?.scrollIntoView({ block: "center" });
    trigger?.focus({ preventScroll: true });
  };

  // Client checks focus (and so scroll to) the first field in error.
  const submit = form.handleSubmit(async (values) => {
    if (roleId == null) {
      showRoleError("Choose a Role");
      return;
    }
    setRoleError(undefined);
    const temporary = values.password === "" ? null : values.password;
    const sendInvite = inviteAvailable(values) && values.invite;
    try {
      const member = await mutation.mutateAsync({
        ...detailsInput(values, {
          keepIdentifiersWhenBlank: false,
          canSeeSalary,
        }),
        projectIds: memberType === "hrms" ? [] : projectIds,
        roleId,
        invite: sendInvite,
        password: temporary,
      });
      setCreated({
        ...member,
        passwordSet: temporary != null,
        invited: sendInvite,
      });
    } catch (error) {
      if (error instanceof QueryHttpError && ROLE_ERRORS.has(error.code)) {
        showRoleError(error.message);
        return;
      }
      const { field, message } = fieldForCode(error, {
        ...detailErrorFields(values),
        ...SIGN_IN_ERROR_FIELDS,
      });
      if (field == null) {
        form.setError("root", { message });
        return;
      }
      // A server error lands on its field, wherever its card is.
      form.setError(field, { message }, { shouldFocus: true });
    }
  });

  if (created != null)
    return <AddedUser created={created} companyName={companyName} />;

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Staff", href: STAFF_PATH }}
          title="Add Staff"
        />

        <form
          noValidate
          className="space-y-6"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <TeamMemberDetailsFields
            form={form}
            canSeeSalary={canSeeSalary}
            signIn={<SignInOptions form={form} companyName={companyName} />}
          >
            {memberType !== "hrms" && (
              <FormSection title="Projects">
                <ProjectsField value={projectIds} onChange={setProjectIds} />
              </FormSection>
            )}
            <RoleField
              id={ROLE_FIELD_ID}
              roles={roles}
              value={roleId}
              onChange={(value) => {
                setChosenRoleId(value);
                setRoleError(undefined);
              }}
              error={roleError}
              previewOpen={false}
            />
          </TeamMemberDetailsFields>

          <FormAlert message={form.formState.errors.root?.message} />

          <div className="flex justify-end gap-3">
            <Link
              href={STAFF_PATH}
              className={buttonVariants({ variant: "outline" })}
            >
              Cancel
            </Link>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending
                ? "Adding…"
                : inviting
                  ? "Add and invite"
                  : "Add Staff"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** What happened, in plain words: signed up, invited, or a record. */
function AddedUser({
  created,
  companyName,
}: {
  created: Created;
  companyName: string;
}) {
  const [sharing, setSharing] = useState(false);
  const canShare = created.invitePath != null && created.email != null;

  let icon: LucideIcon = CheckCircle2;
  let title: string;
  let text: string;
  let share = false;
  if (created.passwordIgnored === "existing_account") {
    icon = Info;
    title = `${created.name} already has an account`;
    text =
      created.email == null
        ? "So we did not set the password. They got a Join Request instead: they sign in with their own password and accept it."
        : `So we did not set the password. They got a Join Request instead, and an invitation at ${created.email}. They show as Joining Pending until they accept.`;
    share = canShare;
  } else if (created.passwordSet) {
    title = `${created.name} can sign in now`;
    text = `They sign in with ${signInWays(created)} and the password you set, and must change it the first time they sign in.`;
  } else if (created.invited && created.email != null) {
    title = `${created.name} is invited`;
    text = `They show as Joining Pending until they sign in with ${created.email} and accept.`;
    share = canShare;
  } else {
    title = `${created.name} is added`;
    text =
      "They are a record until you invite them or set a password. You can do either from Edit Staff.";
  }
  const Icon = icon;

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <div className="bg-card space-y-4 rounded-lg border p-8 text-center">
          <Icon aria-hidden="true" className="text-primary mx-auto size-10" />
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground mx-auto max-w-prose text-sm">
            {text}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {share && (
              <Button
                onClick={() => {
                  setSharing(true);
                }}
              >
                Share invite link
              </Button>
            )}
            <Link
              href={STAFF_PATH}
              className={buttonVariants({ variant: "outline" })}
            >
              Back to Staff
            </Link>
          </div>
        </div>
        {share && created.invitePath != null && created.email != null && (
          <ShareInviteDialog
            open={sharing}
            onOpenChange={setSharing}
            memberName={created.name}
            companyName={companyName}
            email={created.email}
            invitePath={created.invitePath}
          />
        )}
      </div>
    </div>
  );
}
