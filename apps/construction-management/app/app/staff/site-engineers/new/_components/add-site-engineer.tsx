"use client";

import { useActiveCompany } from "@repo/auth/construction/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Info, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Button, buttonVariants } from "@repo/ui/components/button";

import { PageHeader } from "@/app/app/_components/app-shell/page-header";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import { SITE_ENGINEERS_PATH } from "@/lib/staff-nav";
import {
  useCreateSiteEngineer,
  type SiteEngineerCreated,
} from "@/src/queries/site-engineers";

import { ShareInviteDialog } from "@/app/app/staff/office-staff/_components/share-invite-dialog";
import { signInWays } from "@/app/app/staff/office-staff/_components/sign-in-options";
import {
  createSiteEngineerPayload,
  inviteAvailable,
  siteEngineerDefaults,
  siteEngineerErrorFields,
  siteEngineerSchema,
  type SiteEngineerFormMode,
  type SiteEngineerFormValues,
} from "@/app/app/staff/site-engineers/_components/site-engineer-form-schema";
import { SiteEngineerFields } from "@/app/app/staff/site-engineers/_components/site-engineer-fields";
import { SignInChoice } from "@/app/app/staff/site-engineers/_components/site-engineer-sign-in";

/**
 * Add Site Engineer (ADR CM-0037): one page of cards and one button. Every
 * new Site Engineer signs in on the Site Engineer Role, invited or with a
 * Temporary Password.
 */
export function AddSiteEngineer({
  canSeeSalary,
}: {
  /** Financial on Labours: the Salary and Bank cards. */
  canSeeSalary: boolean;
}) {
  const { company } = useActiveCompany();
  const companyName = company?.name ?? "your Company";
  const mode: SiteEngineerFormMode = {
    financial: canSeeSalary,
    signIn: true,
    membership: true,
  };
  const form = useForm<SiteEngineerFormValues>({
    resolver: zodResolver(siteEngineerSchema(mode)),
    defaultValues: siteEngineerDefaults(null),
  });
  const [email, password, invite] = useWatch({
    control: form.control,
    name: ["email", "password", "invite"],
  });
  const inviting = inviteAvailable({ email, password }) && invite;
  const create = useCreateSiteEngineer();
  const [created, setCreated] = useState<SiteEngineerCreated | null>(null);

  // Client checks focus (and so scroll to) the first field in error.
  const submit = form.handleSubmit(async (values) => {
    try {
      setCreated(
        await create.mutateAsync(
          createSiteEngineerPayload(values, canSeeSalary),
        ),
      );
    } catch (error) {
      const { field, message } = fieldForCode(
        error,
        siteEngineerErrorFields(values, mode),
      );
      if (field == null) form.setError("root", { message });
      else form.setError(field, { message }, { shouldFocus: true });
    }
  });

  if (created != null)
    return <AddedSiteEngineer created={created} companyName={companyName} />;

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Site Engineers", href: SITE_ENGINEERS_PATH }}
          title="Add Site Engineer"
        />
        <form
          noValidate
          className="space-y-6"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <SiteEngineerFields
            form={form}
            mode={mode}
            signIn={<SignInChoice form={form} companyName={companyName} />}
          />
          <FormAlert message={form.formState.errors.root?.message} />
          <div className="flex flex-wrap justify-end gap-3">
            <Link
              href={SITE_ENGINEERS_PATH}
              className={buttonVariants({ variant: "outline" })}
            >
              Cancel
            </Link>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending
                ? "Adding…"
                : inviting
                  ? "Add and invite"
                  : "Add Site Engineer"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** What happened, in plain words: can sign in now, invited, or a Join Request. */
function AddedSiteEngineer({
  created,
  companyName,
}: {
  created: SiteEngineerCreated;
  companyName: string;
}) {
  const [sharing, setSharing] = useState(false);
  const invitePath =
    created.signIn.kind === "site_engineer" ? created.signIn.invitePath : null;
  const canShare = invitePath != null && created.email != null;

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
    text = `They sign in with ${signInWays(created)} and the password you set, on the Site Engineer Role, and must change it the first time they sign in.`;
  } else {
    title = `${created.name} is invited`;
    text =
      created.email == null
        ? "They show as Joining Pending until they accept the invitation."
        : `They show as Joining Pending until they sign in with ${created.email} and accept.`;
    share = canShare;
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
              href={SITE_ENGINEERS_PATH}
              className={buttonVariants({ variant: "outline" })}
            >
              Back to Site Engineers
            </Link>
          </div>
        </div>
        {share && invitePath != null && created.email != null && (
          <ShareInviteDialog
            open={sharing}
            onOpenChange={setSharing}
            memberName={created.name}
            companyName={companyName}
            email={created.email}
            invitePath={invitePath}
          />
        )}
      </div>
    </div>
  );
}
