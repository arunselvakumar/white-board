"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Hash, Plus } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

import { FormAlert } from "@/components/auth/form-alert";
import { PageHeader } from "@/components/app-shell/page-header";
import { QueryHttpError } from "@/src/queries/http";
import { projectOptionsQuery } from "@/src/queries/projects";
import {
  deleteSequenceRule,
  sequenceRulesQuery,
  type SequenceRuleItem,
} from "@/src/queries/settings";
import { todayIn } from "@/src/shared-kernel/calendar-date";
import {
  SEQUENCE_MODULES,
  fiscalYearOf,
  formatSequenceNumber,
  sequenceModule,
  standardSequenceSettings,
  type SequenceModuleKey,
} from "@/src/shared-kernel/sequence";

import { SequenceRuleDialog } from "./sequence-rule-dialog";

const MODULE_ITEMS = SEQUENCE_MODULES.map((item) => ({
  value: item.key,
  label: item.label,
}));

function browserToday(): string {
  return todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone);
}

/** Manage Sequence IDs (CM-114): one module at a time, its rules and their format. */
export function SequenceIdsManager({
  today = browserToday(),
}: {
  today?: string;
}) {
  const { data } = useSuspenseQuery(sequenceRulesQuery);
  const { data: projectOptions } = useSuspenseQuery(projectOptionsQuery);
  const queryClient = useQueryClient();
  const [module, setModule] = useState<SequenceModuleKey>("purchase_request");
  const [editing, setEditing] = useState<SequenceRuleItem | "new" | null>(null);
  const [deleting, setDeleting] = useState<SequenceRuleItem | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const fiscalYear = fiscalYearOf(today);
  const rules = data.items.filter((rule) => rule.module === module);
  const hasDefault = rules.some((rule) => rule.isDefault);
  const projectName = new Map(
    projectOptions.items.map((project) => [project.id, project.name]),
  );
  // Projects that may still get their own rule for this module.
  const withRule = new Set(rules.map((rule) => rule.projectId));
  const openProjects = projectOptions.items.filter(
    (project) => !withRule.has(project.id),
  );
  const canAdd = !hasDefault || openProjects.length > 0;
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: sequenceRulesQuery.queryKey });
  const remove = useMutation({ mutationFn: deleteSequenceRule });

  const addButton = (
    <Button
      type="button"
      disabled={!canAdd}
      onClick={() => {
        setError(undefined);
        setEditing("new");
      }}
    >
      <Plus aria-hidden="true" />
      Add rule
    </Button>
  );

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Settings", href: "/app/masters/settings" }}
          title="Sequence IDs"
          meta="How document numbers look. Numbers restart every 1 April when the fiscal year is part of them."
        />

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="w-full max-w-sm space-y-1.5">
            <Label htmlFor="sequence-module">Module</Label>
            <Select
              items={MODULE_ITEMS}
              value={module}
              onValueChange={(value) => {
                if (value == null) return;
                setError(undefined);
                setModule(value);
              }}
            >
              <SelectTrigger
                id="sequence-module"
                size="lg"
                className="w-full min-w-0"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                align="start"
                alignItemWithTrigger={false}
                aria-label="Modules"
              >
                {MODULE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {rules.length > 0 && addButton}
        </div>

        {rules.length > 0 && hasDefault && (
          <p className="text-muted-foreground text-sm">
            {openProjects.length > 0
              ? "This module has its rule for All projects. Add a rule for a single Project to number its documents its own way."
              : "This module has its rule for All projects, and every Project has its own rule."}
          </p>
        )}

        <FormAlert message={error} />

        {rules.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Hash />
              </EmptyMedia>
              <EmptyTitle>
                No rule for {sequenceModule(module).label}
              </EmptyTitle>
              <EmptyDescription>
                Numbers use the standard format{" "}
                <span className="font-mono">
                  {formatSequenceNumber(
                    standardSequenceSettings(module),
                    fiscalYear,
                    1,
                  )}
                </span>{" "}
                until you add a rule.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>{addButton}</EmptyContent>
          </Empty>
        ) : (
          <ul
            aria-label={`${sequenceModule(module).label} rules`}
            className="divide-y rounded-xl border"
          >
            {rules.map((rule) => (
              <li
                key={rule.id}
                className="flex flex-wrap items-center justify-between gap-4 px-4 py-3"
              >
                <div className="min-w-0 space-y-1">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {rule.isDefault
                      ? "All projects (default)"
                      : (projectName.get(rule.projectId ?? "") ??
                        "A Project you cannot see")}
                    {rule.issued && <Badge variant="secondary">In use</Badge>}
                  </p>
                  <p className="font-mono text-base">
                    {formatSequenceNumber(rule, fiscalYear, rule.startNumber)}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    Starts at {rule.startNumber}
                    {rule.fiscalYearToken
                      ? " each fiscal year"
                      : ", never restarts"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setError(undefined);
                      setEditing(rule);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={rule.issued}
                    title={
                      rule.issued
                        ? "Numbers have been issued from this rule"
                        : undefined
                    }
                    onClick={() => {
                      setError(undefined);
                      setDeleting(rule);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {editing != null && (
          <SequenceRuleDialog
            module={module}
            rule={editing === "new" ? null : editing}
            projects={
              editing === "new"
                ? openProjects
                : projectOptions.items.filter(
                    (project) => project.id === editing.projectId,
                  )
            }
            canAddDefault={!hasDefault}
            today={today}
            onClose={() => {
              setEditing(null);
            }}
            onSaved={() => {
              setEditing(null);
              void refresh();
            }}
          />
        )}

        <AlertDialog
          open={deleting != null}
          onOpenChange={(open) => {
            if (!open) setDeleting(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this rule?</AlertDialogTitle>
              <AlertDialogDescription>
                New {sequenceModule(module).label} numbers go back to the
                standard format.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const target = deleting;
                  setDeleting(null);
                  if (target == null) return;
                  remove.mutate(target.id, {
                    onSuccess: () => void refresh(),
                    onError: (cause) => {
                      setError(
                        cause instanceof QueryHttpError
                          ? cause.message
                          : "Something went wrong. Please try again.",
                      );
                      void refresh();
                    },
                  });
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
