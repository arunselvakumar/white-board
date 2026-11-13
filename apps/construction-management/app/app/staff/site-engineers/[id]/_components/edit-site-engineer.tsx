"use client";

import { useActiveCompany } from "@repo/auth/construction/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";

import { PageHeader } from "@/app/app/_components/app-shell/page-header";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import { SITE_ENGINEERS_PATH } from "@/lib/staff-nav";
import { QueryHttpError } from "@/src/queries/http";
import {
  siteEngineerQueries,
  useResendSiteEngineerInvite,
  useUpdateSiteEngineer,
  type SiteEngineer,
  type SiteEngineerPasswordOutcome,
} from "@/src/queries/site-engineers";

import { ShareInviteDialog } from "@/app/app/staff/office-staff/_components/share-invite-dialog";
import { signInWays } from "@/app/app/staff/office-staff/_components/sign-in-options";
import {
  siteEngineerDefaults,
  siteEngineerErrorFields,
  siteEngineerSchema,
  updateSiteEngineerPayload,
  type SiteEngineerFormMode,
  type SiteEngineerFormValues,
} from "@/app/app/staff/site-engineers/_components/site-engineer-form-schema";
import { SiteEngineerFields } from "@/app/app/staff/site-engineers/_components/site-engineer-fields";
import {
  OfficeStaffSignIn,
  SignInChoice,
  SignInStatus,
} from "@/app/app/staff/site-engineers/_components/site-engineer-sign-in";
import { SignInBadge } from "@/app/app/staff/site-engineers/_components/sign-in-badge";
import { SetPasswordDialog } from "./set-password-dialog";

/** What the last action did, for the line under the header. */
type Notice = { tone: "status" | "alert"; text: string };

function passwordNotice(outcome: SiteEngineerPasswordOutcome): Notice {
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

function modeOf(
  engineer: SiteEngineer,
  canSeeSalary: boolean,
): SiteEngineerFormMode {
  return {
    financial: canSeeSalary,
    signIn: engineer.signIn.kind === "none",
    membership: engineer.signIn.kind !== "office_staff",
  };
}

/**
 * Edit Site Engineer (ADR CM-0037): Add's cards, the sign-in status in
 * place of the Sign-in choice once they have one, and one Save. One who is
 * Office Staff keeps their email, KYC, salary and Projects there.
 */
export function EditSiteEngineer({
  id,
  canSeeSalary,
}: {
  id: string;
  /** Financial on Labours: the Salary and Bank cards. */
  canSeeSalary: boolean;
}) {
  const { data: engineer } = useSuspenseQuery(siteEngineerQueries.detail(id));
  // Kept here: adding a sign-in starts the form over.
  const [saved, setSaved] = useState(false);

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Site Engineers", href: SITE_ENGINEERS_PATH }}
          title={engineer.name}
          watermark="Site Engineers"
          meta={
            <span className="inline-flex flex-wrap items-center gap-2">
              Site Engineer
              <SignInBadge signIn={engineer.signIn} />
              {engineer.disabled ? (
                <Badge variant="outline">Disabled</Badge>
              ) : null}
            </span>
          }
        />
        {/* A new sign-in changes which cards show, so the form starts over. */}
        <EditSiteEngineerForm
          key={engineer.signIn.kind}
          engineer={engineer}
          canSeeSalary={canSeeSalary}
          saved={saved}
          onSaved={setSaved}
        />
      </div>
    </div>
  );
}

function NoticeLine({ notice }: { notice: Notice }) {
  return notice.tone === "alert" ? (
    <p role="alert" className="bg-card rounded-lg border px-4 py-3 text-sm">
      {notice.text}
    </p>
  ) : (
    <p
      role="status"
      className="bg-card text-muted-foreground rounded-lg border px-4 py-3 text-sm"
    >
      {notice.text}
    </p>
  );
}

function EditSiteEngineerForm({
  engineer,
  canSeeSalary,
  saved,
  onSaved,
}: {
  engineer: SiteEngineer;
  canSeeSalary: boolean;
  /** The last Save went through; shown until the form is changed. */
  saved: boolean;
  onSaved: (saved: boolean) => void;
}) {
  const { company } = useActiveCompany();
  const companyName = company?.name ?? "your Company";
  const queryClient = useQueryClient();
  const mode = modeOf(engineer, canSeeSalary);
  const form = useForm<SiteEngineerFormValues>({
    resolver: zodResolver(siteEngineerSchema(mode)),
    defaultValues: siteEngineerDefaults(engineer),
  });
  const update = useUpdateSiteEngineer(engineer.id);
  const resend = useResendSiteEngineerInvite(engineer.id);
  const [stale, setStale] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const [settingPassword, setSettingPassword] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const submit = form.handleSubmit(async (values) => {
    onSaved(false);
    try {
      const updated = await update.mutateAsync(
        updateSiteEngineerPayload(values, mode, engineer.updatedAt),
      );
      form.reset(siteEngineerDefaults(updated));
      onSaved(true);
    } catch (error) {
      if (
        error instanceof QueryHttpError &&
        error.code === "SUPERVISOR_CHANGED"
      ) {
        setStale(error.message);
        return;
      }
      const { field, message } = fieldForCode(
        error,
        siteEngineerErrorFields(values, mode),
      );
      if (field == null) form.setError("root", { message });
      else form.setError(field, { message }, { shouldFocus: true });
    }
  });

  // Someone else saved first: load theirs, dropping what was typed here.
  const reload = async () => {
    setReloading(true);
    try {
      const fresh = await queryClient.query({
        ...siteEngineerQueries.detail(engineer.id),
        staleTime: 0,
      });
      form.reset(siteEngineerDefaults(fresh));
      setStale(null);
    } finally {
      setReloading(false);
    }
  };

  const signIn = engineer.signIn;
  const invitePath = signIn.kind === "site_engineer" ? signIn.invitePath : null;
  const canShare = invitePath != null && engineer.email != null;

  return (
    <>
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
          mobileLocked={engineer.mobileLocked}
          masked={{
            aadhaar: engineer.aadhaarMasked,
            pan: engineer.panMasked,
            accountLast4: engineer.bank?.accountLast4 ?? null,
          }}
          signIn={
            signIn.kind === "none" ? (
              <SignInChoice form={form} companyName={companyName} />
            ) : signIn.kind === "office_staff" ? (
              <OfficeStaffSignIn signIn={signIn} />
            ) : (
              <div className="space-y-3">
                <SignInStatus
                  signIn={signIn}
                  contact={engineer}
                  canShare={canShare}
                  resending={resend.isPending}
                  onResend={() => {
                    setNotice(null);
                    resend.mutate(undefined, {
                      onSuccess: (updated) => {
                        setNotice({
                          tone: "status",
                          text:
                            updated.email == null
                              ? `We sent ${updated.name} the invitation again.`
                              : `We sent the invitation to ${updated.email} again.`,
                        });
                      },
                    });
                  }}
                  onSetPassword={() => {
                    setNotice(null);
                    setSettingPassword(true);
                  }}
                  onShare={() => {
                    setSharing(true);
                  }}
                />
                {notice != null && <NoticeLine notice={notice} />}
                <FormAlert
                  message={
                    resend.error == null
                      ? undefined
                      : fieldForCode(resend.error, {}).message
                  }
                />
              </div>
            )
          }
        />

        {stale != null && (
          <div
            role="alert"
            className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm"
          >
            <span>{stale}</span>
            <Button
              type="button"
              variant="outline"
              disabled={reloading}
              onClick={() => {
                void reload();
              }}
            >
              {reloading ? "Reloading…" : "Reload"}
            </Button>
          </div>
        )}
        <FormAlert message={form.formState.errors.root?.message} />
        {saved && !form.formState.isDirty && (
          <p role="status" className="text-muted-foreground text-sm">
            Saved.
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <Link
            href={SITE_ENGINEERS_PATH}
            className={buttonVariants({ variant: "outline" })}
          >
            Cancel
          </Link>
          <Button type="submit" disabled={update.isPending || stale != null}>
            {update.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>

      {signIn.kind === "site_engineer" && signIn.canSetPassword && (
        <SetPasswordDialog
          engineer={engineer}
          open={settingPassword}
          onOpenChange={setSettingPassword}
          onDone={(outcome) => {
            setSettingPassword(false);
            setNotice(passwordNotice(outcome));
          }}
        />
      )}
      {invitePath != null && engineer.email != null && (
        <ShareInviteDialog
          open={sharing}
          onOpenChange={setSharing}
          memberName={engineer.name}
          companyName={companyName}
          email={engineer.email}
          invitePath={invitePath}
        />
      )}
    </>
  );
}
