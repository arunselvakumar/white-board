"use client";

import { useActiveCompany } from "@repo/auth/construction/react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useMutation,
  useQueryClient,
  useSuspenseQueries,
} from "@tanstack/react-query";
import { CheckCircle2, Info, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Button, buttonVariants } from "@repo/ui/components/button";

import { PageHeader } from "@/components/app-shell/page-header";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import { STAFF_PATH } from "@/lib/staff-roles-nav";
import { QueryHttpError } from "@/src/queries/http";
import { ROLES_KEY, rolesQuery } from "@/src/queries/roles";
import {
  TEAM_MEMBERS_KEY,
  createTeamMember,
  designationOptionsQuery,
  type PasswordOutcome,
  type TeamMember,
} from "@/src/queries/team-members";

import { ProjectsStep } from "./projects-step";
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
  DETAIL_ERROR_FIELDS,
  EMPTY_DETAILS,
  TeamMemberDetailsFields,
  detailsInput,
} from "./team-member-details-fields";

type Step = "details" | "projects" | "role";

const STEP_LABELS: Record<Step, string> = {
  details: "Details",
  projects: "Select Projects",
  role: "Role",
};

const EMPTY: AddStaffValues = { ...EMPTY_DETAILS, invite: true, password: "" };

/** Server codes the Sign-in section owns, beyond the detail fields'. */
const ERROR_FIELDS: Record<string, keyof AddStaffValues> = {
  ...DETAIL_ERROR_FIELDS,
  MEMBER_EMAIL_REQUIRED: "email",
  PASSWORD_TOO_SHORT: "password",
  PASSWORD_TOO_LONG: "password",
};

/** Server codes about the Role, shown on the Role step. */
const ROLE_ERRORS = new Set(["ROLE_NOT_FOUND", "ROLE_REQUIRED"]);

type Created = TeamMember &
  PasswordOutcome & { passwordSet: boolean; invited: boolean };

/**
 * Add Staff (CM-111, ADR CM-0030 §6): details with how they sign in →
 * Projects → Role. HRMS members skip Projects and start on HRMS Staff.
 */
export function AddTeamMemberWizard({
  canSeeSalary,
}: {
  /** Financial on Staff (ADR CM-0032). */
  canSeeSalary: boolean;
}) {
  const [{ data: designations }, { data: roles }] = useSuspenseQueries({
    queries: [designationOptionsQuery, rolesQuery],
  });
  const { company } = useActiveCompany();
  const companyName = company?.name ?? "your Company";
  const queryClient = useQueryClient();
  const form = useForm<AddStaffValues>({
    resolver: zodResolver(addStaffSchema),
    defaultValues: EMPTY,
  });
  const [memberType, email, password, invite] = useWatch({
    control: form.control,
    name: ["memberType", "email", "password", "invite"],
  });
  const [step, setStep] = useState<Step>("details");
  const [chosenRoleId, setChosenRoleId] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | undefined>();
  const [created, setCreated] = useState<Created | null>(null);
  const [projectIds, setProjectIds] = useState<string[]>([]);

  // HRMS Team Members start on HRMS Staff until another Role is picked.
  const roleId =
    chosenRoleId ?? (memberType === "hrms" ? hrmsStaffRoleId(roles) : null);
  const inviting = inviteAvailable({ email, password }) && invite;

  const steps: Step[] =
    memberType === "hrms"
      ? ["details", "role"]
      : ["details", "projects", "role"];
  const index = Math.max(0, steps.indexOf(step));

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

  const next = async () => {
    if (step === "details" && !(await form.trigger())) return;
    const following = steps[index + 1];
    if (following != null) setStep(following);
  };

  const submit = form.handleSubmit(async (values) => {
    if (roleId == null) {
      setRoleError("Choose a Role");
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
        setRoleError(error.message);
        return;
      }
      const { field, message } = fieldForCode(error, ERROR_FIELDS);
      if (field == null) {
        form.setError("root", { message });
        return;
      }
      form.setError(field, { message });
      setStep("details");
    }
  });

  if (created != null)
    return <AddedUser created={created} companyName={companyName} />;

  const last = index === steps.length - 1;

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Staff", href: STAFF_PATH }}
          title="Add Staff"
          meta={`Step ${String(index + 1)} of ${String(steps.length)}: ${STEP_LABELS[step]}`}
        />
        <ol className="flex gap-1.5" aria-label="Steps">
          {steps.map((item, position) => (
            <li
              key={item}
              aria-current={item === step ? "step" : undefined}
              className={`h-1 flex-1 rounded-full ${position <= index ? "bg-primary" : "bg-border"}`}
            >
              <span className="sr-only">{STEP_LABELS[item]}</span>
            </li>
          ))}
        </ol>

        <form
          noValidate
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (last) void submit(event);
            else void next();
          }}
        >
          {step === "details" && (
            <TeamMemberDetailsFields
              form={form}
              designations={designations}
              canSeeSalary={canSeeSalary}
              signIn={<SignInOptions form={form} companyName={companyName} />}
            />
          )}
          {step === "projects" && (
            <ProjectsStep value={projectIds} onChange={setProjectIds} />
          )}
          {step === "role" && (
            <RoleField
              id="member-role"
              roles={roles}
              value={roleId}
              onChange={(value) => {
                setChosenRoleId(value);
                setRoleError(undefined);
              }}
              error={roleError}
            />
          )}

          <FormAlert message={form.formState.errors.root?.message} />

          <div className="flex justify-between gap-3">
            {index > 0 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const previous = steps[index - 1];
                  if (previous != null) setStep(previous);
                }}
              >
                Back
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={mutation.isPending}>
              {!last
                ? "Continue"
                : mutation.isPending
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
