"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Label } from "@repo/ui/components/label";
import { Switch } from "@repo/ui/components/switch";

import { FormAlert } from "@/components/auth/form-alert";
import { PageHeader } from "@/components/app-shell/page-header";
import { fieldForCode } from "@/lib/server-errors";
import {
  grnFieldSettingQuery,
  updateGrnFieldSetting,
  type GrnFieldSettingData,
} from "@/src/queries/grn-fields";
import {
  GRN_FIELD_GROUP_LABELS,
  GRN_FIELD_GROUPS,
} from "@/src/shared-kernel/grn-fields";

const schema = z.object({ shown: z.record(z.string(), z.boolean()) });

type Values = z.infer<typeof schema>;

function toValues(setting: GrnFieldSettingData): Values {
  const hidden = new Set<string>(setting.hiddenFields);
  return {
    shown: Object.fromEntries(
      setting.fields.map((field) => [field.key, !hidden.has(field.key)]),
    ),
  };
}

/** Settings → GRN fields (CM-501): which optional Goods Receipt fields are shown and printed. */
export function GrnFieldsForm() {
  const { data } = useSuspenseQuery(grnFieldSettingQuery);
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: toValues(data),
  });
  const mutation = useMutation({ mutationFn: updateGrnFieldSetting });
  const errors = form.formState.errors;

  const submit = async (values: Values) => {
    setSaved(false);
    try {
      const next = await mutation.mutateAsync({
        hiddenFields: data.fields
          .filter((field) => values.shown[field.key] === false)
          .map((field) => field.key),
        expectedUpdatedAt: data.updatedAt,
      });
      queryClient.setQueryData(grnFieldSettingQuery.queryKey, next);
      form.reset(toValues(next));
      setSaved(true);
    } catch (error) {
      form.setError("root", { message: fieldForCode(error, {}).message });
    }
  };

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-8">
        <PageHeader
          back={{ label: "Settings", href: "/app/masters/settings" }}
          title="GRN fields"
          meta="Choose which optional fields a Goods Receipt shows. Hidden fields are neither shown on the form nor printed."
        />

        <form
          noValidate
          className="space-y-8"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit(submit)(event);
          }}
        >
          {GRN_FIELD_GROUPS.map((group) => {
            const fields = data.fields.filter((field) => field.group === group);
            if (fields.length === 0) return null;
            const headingId = `grn-group-${group}`;
            return (
              <section
                key={group}
                aria-labelledby={headingId}
                className="space-y-3"
              >
                <h2 id={headingId} className="text-base font-semibold">
                  {GRN_FIELD_GROUP_LABELS[group]}
                </h2>
                <ul className="divide-y rounded-xl border">
                  {fields.map((field) => {
                    const id = `grn-field-${field.key}`;
                    return (
                      <li
                        key={field.key}
                        className="flex items-center justify-between gap-4 px-4 py-3"
                      >
                        <Label htmlFor={id} className="min-w-0 font-normal">
                          {field.label}
                        </Label>
                        <Controller
                          name={`shown.${field.key}`}
                          control={form.control}
                          render={({ field: control }) => (
                            <div className="flex shrink-0 items-center gap-3">
                              <span
                                aria-hidden="true"
                                className="text-muted-foreground w-12 text-right text-sm"
                              >
                                {control.value ? "Shown" : "Hidden"}
                              </span>
                              <Switch
                                id={id}
                                checked={control.value}
                                onCheckedChange={(checked) => {
                                  control.onChange(checked);
                                }}
                              />
                            </div>
                          )}
                        />
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}

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
      </div>
    </div>
  );
}
