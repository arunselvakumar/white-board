"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import {
  useActiveCompany,
  useCompanyAuth,
} from "@repo/auth/construction/react";
import { DatabaseBackup, Lock, UsersRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Checkbox } from "@repo/ui/components/checkbox";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";

import { ActionCodeStep } from "@/components/account/action-code-step";
import { PageHeader } from "@/components/app-shell/page-header";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";

import { FieldError } from "@/components/auth/field-error";
import {
  backupQueries,
  useRequestBackup,
  type Backup,
} from "@/src/queries/backups";

import { BackupModulePicker } from "./backup-module-picker";
import { BackupProgress } from "./backup-progress";
import { BackupModulesSkeleton } from "./backups-skeletons";

const schema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
  includeMedia: z.boolean(),
});

type Values = z.input<typeof schema>;
type Parsed = z.output<typeof schema>;

const SERVER_FIELDS: Record<string, keyof Values> = {
  ACTION_CODE_INVALID: "code",
  ACTION_CODE_EXPIRED: "code",
  ACTION_CODE_NOT_FOUND: "code",
  ACTION_CODE_LOCKED: "code",
};

function FullBackupForm({ companyName }: { companyName: string }) {
  const request = useRequestBackup();
  const [requested, setRequested] = useState<Backup | null>(null);
  const form = useForm<Values, unknown, Parsed>({
    resolver: zodResolver(schema),
    defaultValues: { code: "", includeMedia: false },
  });
  const errors = form.formState.errors;

  const submit = async (values: Parsed) => {
    try {
      setRequested(
        await request.mutateAsync({
          scope: "company",
          code: values.code,
          includeMedia: values.includeMedia,
        }),
      );
    } catch (error) {
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
      form.setError(field ?? "root", { message });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DatabaseBackup aria-hidden="true" className="size-5" />
          Full Company backup
        </CardTitle>
        <CardDescription>
          Every module of every Project, the master records, HRMS and the
          Company&apos;s settings of {companyName}, with amounts, as one ZIP of
          CSV and JSON files. We email you the link too; it works for 7 days,
          for you only.
        </CardDescription>
      </CardHeader>
      {requested != null ? (
        <CardContent>
          <BackupProgress backupId={requested.id} initial={requested} />
        </CardContent>
      ) : (
        <form
          noValidate
          aria-label="Full Company backup"
          className="min-w-0"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit(submit)(event);
          }}
        >
          <CardContent className="min-w-0 space-y-5">
            <Controller
              name="includeMedia"
              control={form.control}
              render={({ field }) => (
                <label
                  htmlFor="company-backup-media"
                  className="flex min-w-0 cursor-pointer gap-3"
                >
                  <Checkbox
                    id="company-backup-media"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    className="mt-0.5"
                  />
                  <span className="min-w-0 space-y-0.5">
                    <span className="block text-sm font-medium">
                      Include media
                    </span>
                    <span className="text-muted-foreground block text-sm">
                      Photos, drawings and receipts. A backup over 512 MB fails;
                      leave this off for a data-only copy.
                    </span>
                  </span>
                </label>
              )}
            />
            <Controller
              name="code"
              control={form.control}
              render={({ field }) => (
                <ActionCodeStep
                  id="company-backup-code"
                  purpose="company_backup"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  error={errors.code?.message}
                />
              )}
            />
            <FormAlert message={errors.root?.message} />
          </CardContent>
          <CardFooter className="pt-5">
            <Button type="submit" disabled={request.isPending}>
              {request.isPending ? "Generating…" : "Generate backup"}
            </Button>
          </CardFooter>
        </form>
      )}
    </Card>
  );
}

const hrmsSchema = z.object({
  modules: z.array(z.string()).min(1, "Choose at least one HRMS module"),
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

type HrmsValues = z.input<typeof hrmsSchema>;
type HrmsParsed = z.output<typeof hrmsSchema>;

const HRMS_SERVER_FIELDS: Record<string, keyof HrmsValues> = {
  ACTION_CODE_INVALID: "code",
  ACTION_CODE_EXPIRED: "code",
  ACTION_CODE_NOT_FOUND: "code",
  ACTION_CODE_LOCKED: "code",
  BACKUP_MODULE_UNKNOWN: "modules",
};

/** HRMS alone (CM-906): chosen HRMS modules, behind the same code. */
function HrmsBackupForm() {
  const options = useQuery(backupQueries.options("hrms"));
  const request = useRequestBackup();
  const [requested, setRequested] = useState<Backup | null>(null);
  const form = useForm<HrmsValues, unknown, HrmsParsed>({
    resolver: zodResolver(hrmsSchema),
    defaultValues: { modules: [], code: "" },
  });
  const errors = form.formState.errors;

  const submit = async (values: HrmsParsed) => {
    try {
      setRequested(
        await request.mutateAsync({
          scope: "company",
          code: values.code,
          modules: values.modules,
        }),
      );
    } catch (error) {
      const { field, message } = fieldForCode(error, HRMS_SERVER_FIELDS);
      form.setError(field ?? "root", { message });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UsersRound aria-hidden="true" className="size-5" />
          HRMS backup
        </CardTitle>
        <CardDescription>
          Only the HRMS records you choose: employees&apos; HR data, shifts,
          holidays, staff attendance, leave and salary. The full Company backup
          above already holds all of them.
        </CardDescription>
      </CardHeader>
      {requested != null ? (
        <CardContent>
          <BackupProgress backupId={requested.id} initial={requested} />
        </CardContent>
      ) : (
        <form
          noValidate
          aria-label="HRMS backup"
          className="min-w-0"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit(submit)(event);
          }}
        >
          <CardContent className="min-w-0 space-y-5">
            {options.isError ? (
              <FormAlert message={fieldForCode(options.error, {}).message} />
            ) : options.data == null ? (
              <BackupModulesSkeleton />
            ) : (
              <Controller
                name="modules"
                control={form.control}
                render={({ field }) => (
                  <BackupModulePicker
                    modules={options.data.modules}
                    value={field.value}
                    onChange={field.onChange}
                    invalid={errors.modules != null}
                  />
                )}
              />
            )}
            <FieldError message={errors.modules?.message} />
            <Controller
              name="code"
              control={form.control}
              render={({ field }) => (
                <ActionCodeStep
                  id="hrms-backup-code"
                  purpose="company_backup"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  error={errors.code?.message}
                />
              )}
            />
            <FormAlert message={errors.root?.message} />
          </CardContent>
          <CardFooter className="pt-5">
            <Button type="submit" disabled={request.isPending}>
              {request.isPending ? "Generating…" : "Generate HRMS backup"}
            </Button>
          </CardFooter>
        </form>
      )}
    </Card>
  );
}

/**
 * Masters → Settings → Backup & export (CM-906, ADR CM-0021 §8): the full
 * Company backup and an HRMS-only backup, the Owner's alone, behind a
 * code.
 */
export function CompanyBackupScreen() {
  const { role } = useCompanyAuth();
  const { company } = useActiveCompany();
  const companyName = company?.name ?? "this Company";
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Settings", href: "/app/settings" }}
          title="Backup & export"
          meta={
            <>
              Your backups and exports are also in{" "}
              <Link href="/app/downloads" className="underline">
                Downloads
              </Link>
              .
            </>
          }
        />
        {role === "owner" ? (
          <>
            <FullBackupForm companyName={companyName} />
            <HrmsBackupForm />
          </>
        ) : (
          <Empty className="bg-card border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Lock />
              </EmptyMedia>
              <EmptyTitle>Only the Owner can do this</EmptyTitle>
              <EmptyDescription>
                A full backup of {companyName} is the Owner&apos;s alone. You
                can back up a Project from its options menu, or master records
                from Masters.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </div>
  );
}
