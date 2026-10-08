"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  useMutation,
  useQueryClient,
  useSuspenseQueries,
} from "@tanstack/react-query";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

import type { GetConstructionOrganizationBackdatedEntryPolicyResponseModel } from "@/app/api/construction/organization/settings/backdated-entry/get-backdated-entry-policy-response-model";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { PageHeader } from "@/components/app-shell/page-header";
import { fieldForCode } from "@/lib/server-errors";
import {
  backdatedEntryPolicyQuery,
  designationOptionsQuery,
  updateBackdatedEntryPolicy,
} from "@/src/queries/settings";
import {
  BACKDATED_MODULE_GROUPS,
  BACKDATED_MODULES,
  type BackdatedModuleKey,
} from "@/src/shared-kernel/backdated-policy";
import { isCalendarDate } from "@/src/shared-kernel/calendar-date";

import { BackdatedLimitFields, limitSchema } from "./backdated-limit-fields";
import {
  BackdatedModuleDialog,
  moduleSettingSchema,
  moduleSummary,
} from "./backdated-module-dialog";

const schema = z.object({
  create: limitSchema,
  edit: limitSchema,
  financialClosingDate: z
    .string()
    .refine((value) => value === "" || isCalendarDate(value), {
      message: "Enter a valid date",
    }),
  modules: z.record(z.string(), moduleSettingSchema),
});

type Values = z.infer<typeof schema>;

const SERVER_FIELDS: Record<string, "financialClosingDate"> = {
  FINANCIAL_CLOSING_DATE_INVALID: "financialClosingDate",
};

function toValues(
  policy: GetConstructionOrganizationBackdatedEntryPolicyResponseModel,
): Values {
  return {
    create: policy.create,
    edit: policy.edit,
    financialClosingDate: policy.financialClosingDate ?? "",
    modules: Object.fromEntries(
      policy.modules.map((item) => [
        item.key,
        { mode: item.mode, create: item.create, edit: item.edit },
      ]),
    ),
  };
}

const MODULE_LABELS = new Map<string, string>(
  BACKDATED_MODULES.map((item) => [item.key, item.label]),
);

/** Back-dated Entry settings (CM-113): default limits, module overrides, Financial Closing Date. */
export function BackdatedEntryForm() {
  const [{ data: policy }, { data: designations }] = useSuspenseQueries({
    queries: [backdatedEntryPolicyQuery, designationOptionsQuery],
  });
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<BackdatedModuleKey | null>(null);
  const [saved, setSaved] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: toValues(policy),
  });
  const mutation = useMutation({ mutationFn: updateBackdatedEntryPolicy });
  const [create, edit, modules] = useWatch({
    control: form.control,
    name: ["create", "edit", "modules"],
  });
  const defaults = { create, edit };
  const errors = form.formState.errors;

  const submit = async (values: Values) => {
    setSaved(false);
    try {
      const next = await mutation.mutateAsync({
        create: values.create,
        edit: values.edit,
        financialClosingDate:
          values.financialClosingDate === ""
            ? null
            : values.financialClosingDate,
        modules: BACKDATED_MODULES.flatMap((item) => {
          const setting = values.modules[item.key];
          return setting == null ? [] : [{ key: item.key, ...setting }];
        }),
        expectedUpdatedAt: policy.updatedAt,
      });
      queryClient.setQueryData(backdatedEntryPolicyQuery.queryKey, next);
      form.reset(toValues(next));
      setSaved(true);
    } catch (error) {
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
      form.setError(field ?? "root", { message });
    }
  };

  const editingSetting = editing == null ? null : modules[editing];

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-8">
        <PageHeader
          back={{ label: "Settings", href: "/app/masters/settings" }}
          title="Back-dated Entry"
          meta="How far back your team may date new entries and edit old ones. 0 days means no limit; the Owner is never limited by days."
        />

        <form
          noValidate
          className="space-y-8"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit(submit)(event);
          }}
        >
          <section
            aria-labelledby="backdated-defaults"
            className="space-y-4 rounded-xl border p-6"
          >
            <div className="space-y-1">
              <h2 id="backdated-defaults" className="text-lg font-semibold">
                Default limits
              </h2>
              <p className="text-muted-foreground text-sm">
                Apply to every module set to Global. With no override
                Designations, the limit is a hard block for everyone but the
                Owner.
              </p>
            </div>
            <BackdatedLimitFields
              idPrefix="default"
              control={form.control}
              register={form.register}
              errors={errors}
              designations={designations}
            />
          </section>

          <section
            aria-labelledby="backdated-modules"
            className="space-y-4 rounded-xl border p-6"
          >
            <div className="space-y-1">
              <h2 id="backdated-modules" className="text-lg font-semibold">
                Module overrides
              </h2>
              <p className="text-muted-foreground text-sm">
                Give a module its own limits. The date checked is the
                entry&apos;s own date, not when it was typed in.
              </p>
            </div>
            <div className="space-y-6">
              {BACKDATED_MODULE_GROUPS.map((group) => (
                <div key={group.key} className="space-y-2">
                  <h3 className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase">
                    {group.label}
                  </h3>
                  <ul className="divide-y rounded-lg border">
                    {BACKDATED_MODULES.filter(
                      (item) => item.group === group.key,
                    ).map((item) => {
                      const setting = modules[item.key];
                      return (
                        <li
                          key={item.key}
                          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{item.label}</p>
                            <p className="text-muted-foreground text-sm">
                              {setting == null
                                ? null
                                : moduleSummary(setting, defaults)}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-label={`Override ${item.label}`}
                            onClick={() => {
                              setEditing(item.key);
                            }}
                          >
                            {setting?.mode === "custom" ? "Edit" : "Override"}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section
            aria-labelledby="backdated-closing"
            className="space-y-4 rounded-xl border p-6"
          >
            <div className="space-y-1">
              <h2 id="backdated-closing" className="text-lg font-semibold">
                Financial closing date
              </h2>
              <p className="text-muted-foreground text-sm">
                Locks the books: entries dated on or before this date cannot be
                created or edited by anyone, the Owner included.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="financial-closing-date">Closed up to</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="financial-closing-date"
                  type="date"
                  className="h-10 w-48"
                  {...form.register("financialClosingDate")}
                />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    form.setValue("financialClosingDate", "", {
                      shouldDirty: true,
                    });
                  }}
                >
                  Clear
                </Button>
              </div>
              <FieldError message={errors.financialClosingDate?.message} />
            </div>
          </section>

          <FormAlert message={errors.root?.message} />

          <div className="flex flex-wrap items-center justify-end gap-3">
            <p role="status" className="text-muted-foreground text-sm">
              {saved && !form.formState.isDirty ? "Changes saved." : ""}
            </p>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>

        {editing != null && editingSetting != null && (
          <BackdatedModuleDialog
            label={MODULE_LABELS.get(editing) ?? editing}
            setting={editingSetting}
            defaults={defaults}
            designations={designations}
            onClose={() => {
              setEditing(null);
            }}
            onApply={(setting) => {
              form.setValue(`modules.${editing}`, setting, {
                shouldDirty: true,
              });
              setEditing(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
