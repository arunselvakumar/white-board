"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { WING_NAME_MAX } from "@/src/projects/domain/wing";
import { cleanWingFloors } from "@/src/projects/domain/wing-floors";
import {
  wingTypeLabel,
  type WingConfig,
} from "@/src/projects/domain/wing-generator";
import {
  useUpdateWing,
  wingQuery,
  wingsQuery,
  type WingResponse,
} from "@/src/queries/project-structure";

import { SectionHeader, saveProblem, wingPath } from "./structure-parts";
import { configSummary } from "./wing-details-schema";
import { WingEditor, type EditorProblem } from "./wing-editor";
import {
  editorFromSaved,
  toFloorInputs,
  type EditorFloor,
} from "./wing-editor-state";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter the Wing name")
    .max(WING_NAME_MAX, `Use at most ${String(WING_NAME_MAX)} characters`),
  phaseId: z.string(),
});

type Values = z.infer<typeof schema>;

function EditWingForm({
  projectId,
  wing,
}: {
  projectId: string;
  wing: WingResponse;
}) {
  const router = useRouter();
  const { data: overview } = useSuspenseQuery(wingsQuery(projectId));
  const update = useUpdateWing(projectId, wing.id);
  const [floors, setFloors] = useState<EditorFloor[]>(() =>
    editorFromSaved(wing.floors),
  );
  const [problem, setProblem] = useState<EditorProblem | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: wing.name, phaseId: wing.phaseId },
  });
  const errors = form.formState.errors;
  const phases = overview.phases.map((phase) => ({
    value: phase.id,
    label: phase.name,
  }));
  const chart = wingPath(projectId, wing.id);

  const submit = form.handleSubmit(async (values) => {
    setProblem(null);
    try {
      cleanWingFloors(wing.type, toFloorInputs(floors));
      await update.mutateAsync({
        name: values.name,
        phaseId: values.phaseId,
        floors: toFloorInputs(floors),
        expectedUpdatedAt: wing.updatedAt,
      });
      router.push(chart);
    } catch (error) {
      const refused = saveProblem(error);
      if (refused.code === "WING_NAME_IN_USE") {
        form.setError("name", { message: refused.message });
        return;
      }
      setProblem(refused.row);
      form.setError("root", { message: refused.message });
    }
  });

  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <section className="bg-card space-y-5 rounded-xl border p-4 sm:p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="edit-wing-name">Wing Name</Label>
            <Input
              id="edit-wing-name"
              className="h-10"
              autoComplete="off"
              aria-invalid={errors.name != null}
              {...form.register("name")}
            />
            <FieldError message={errors.name?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-wing-phase">Phase</Label>
            <Controller
              control={form.control}
              name="phaseId"
              render={({ field }) => (
                <Select
                  items={phases}
                  value={field.value}
                  onValueChange={(value) => {
                    if (value != null) field.onChange(value);
                  }}
                >
                  <SelectTrigger
                    id="edit-wing-phase"
                    ref={field.ref}
                    size="lg"
                    className="w-full min-w-0"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    align="start"
                    alignItemWithTrigger={false}
                    aria-label="Phases"
                  >
                    {phases.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>
        <p className="text-muted-foreground text-sm">
          {wingTypeLabel(wing.type)} · generated from{" "}
          {configSummary(wing.type, wing.config as WingConfig)}
        </p>
      </section>

      <WingEditor
        type={wing.type}
        floors={floors}
        onChange={(next) => {
          setFloors(next);
          setProblem(null);
          form.clearErrors("root");
        }}
        problem={problem}
      />
      <FormAlert message={errors.root?.message} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            router.push(chart);
          }}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save Wing"}
        </Button>
      </div>
    </form>
  );
}

/**
 * Edit Wing (CM-402): name, Phase and the same floor and unit editor as
 * Add Wing, loaded with the saved floors and units. Save keeps their ids;
 * a save after someone else's is refused (409 `WING_CHANGED`).
 */
export function EditWingScreen({
  projectId,
  wingId,
}: {
  projectId: string;
  wingId: string;
}) {
  const { data: wing } = useSuspenseQuery(wingQuery(projectId, wingId));
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <SectionHeader
          back={{ label: wing.name, href: wingPath(projectId, wing.id) }}
          title={`Edit ${wing.name}`}
        />
        <EditWingForm key={wing.updatedAt} projectId={projectId} wing={wing} />
      </div>
    </div>
  );
}
