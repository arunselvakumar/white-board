"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Controller,
  useForm,
  useWatch,
  type FieldErrors,
} from "react-hook-form";
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
import { Switch } from "@repo/ui/components/switch";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { cleanWingFloors } from "@/src/projects/domain/wing-floors";
import {
  generateWingFloors,
  isWingType,
  wingConfig,
  wingLayout,
  wingTypeLabel,
  type WingType,
} from "@/src/projects/domain/wing-generator";
import { DomainError } from "@/src/shared-kernel/domain-error";
import {
  useCreateWing,
  wingsQuery,
  type PhaseWithWings,
} from "@/src/queries/project-structure";

import { SectionHeader, saveProblem, wingsPath } from "./structure-parts";
import {
  FIELD_BOUNDS,
  LAYOUT_FIELDS,
  WING_TYPE_ITEMS,
  configInput,
  detailsForType,
  emptyDetails,
  fieldLabel,
  wingDetailsSchema,
  type ConfigNumberField,
  type WingDetailsValues,
} from "./wing-details-schema";
import { WingEditor, type EditorProblem } from "./wing-editor";
import {
  editorFromGenerated,
  toFloorInputs,
  type EditorFloor,
} from "./wing-editor-state";

function phaseItems(phases: readonly PhaseWithWings[]) {
  return phases.map((phase) => ({ value: phase.id, label: phase.name }));
}

/** Add Wing step 1: Phase, Wing Type, Wing Name and the configuration. */
function WingDetailsForm({
  phases,
  initial,
  regenerates,
  onContinue,
  cancelHref,
  serverErrors,
}: {
  phases: readonly PhaseWithWings[];
  initial: WingDetailsValues;
  /** Floors were edited already: Continue starts them over. */
  regenerates: boolean;
  onContinue: (
    values: WingDetailsValues,
    type: WingType,
  ) => { field: keyof WingDetailsValues | null; message: string } | null;
  cancelHref: string;
  /** A refused Save's name error (409 `WING_NAME_IN_USE`); stable identity. */
  serverErrors?: FieldErrors<WingDetailsValues>;
}) {
  const router = useRouter();
  const form = useForm<WingDetailsValues>({
    resolver: zodResolver(wingDetailsSchema),
    defaultValues: initial,
    errors: serverErrors,
  });
  const errors = form.formState.errors;
  const type = useWatch({ control: form.control, name: "type" });
  const wingType = isWingType(type) ? type : null;
  const layout = wingType == null ? null : wingLayout(wingType);
  const phaseOptions = phaseItems(phases);

  const submit = form.handleSubmit((values) => {
    if (!isWingType(values.type)) return;
    const problem = onContinue(values, values.type);
    if (problem != null)
      form.setError(problem.field ?? "root", { message: problem.message });
  });

  const numberField = (field: ConfigNumberField) => {
    if (wingType == null) return null;
    const id = `wing-${field}`;
    const bounds = FIELD_BOUNDS[field];
    return (
      <div key={field} className="space-y-1.5">
        <Label htmlFor={id}>
          {fieldLabel(field, wingType)}
          {bounds.required ? null : (
            <span className="text-muted-foreground font-normal">
              {" "}
              (optional)
            </span>
          )}
        </Label>
        <Input
          id={id}
          className="h-10"
          inputMode="numeric"
          autoComplete="off"
          aria-invalid={errors[field] != null}
          {...form.register(field)}
        />
        <FieldError message={errors[field]?.message} />
      </div>
    );
  };

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
          {phaseOptions.length > 0 ? (
            <div className="space-y-1.5">
              <Label htmlFor="wing-phase">Phase</Label>
              <Controller
                control={form.control}
                name="phaseId"
                render={({ field }) => (
                  <Select
                    items={phaseOptions}
                    value={field.value}
                    onValueChange={(value) => {
                      if (value != null) field.onChange(value);
                    }}
                  >
                    <SelectTrigger
                      id="wing-phase"
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
                      {phaseOptions.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          ) : (
            <p className="text-muted-foreground text-sm sm:col-span-2">
              This is the Project&apos;s first Wing: it goes into Phase 1.
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="wing-type">Wing Type</Label>
            <Controller
              control={form.control}
              name="type"
              render={({ field }) => (
                <Select
                  items={WING_TYPE_ITEMS}
                  value={field.value === "" ? null : field.value}
                  onValueChange={(value) => {
                    if (value == null || !isWingType(value)) return;
                    field.onChange(value);
                    const defaults = detailsForType(value);
                    for (const [key, next] of Object.entries(defaults))
                      form.setValue(key as keyof typeof defaults, next);
                    form.clearErrors();
                  }}
                >
                  <SelectTrigger
                    id="wing-type"
                    ref={field.ref}
                    size="lg"
                    className="w-full min-w-0"
                    aria-invalid={errors.type != null}
                  >
                    <SelectValue placeholder="Choose a Wing Type" />
                  </SelectTrigger>
                  <SelectContent
                    align="start"
                    alignItemWithTrigger={false}
                    aria-label="Wing Types"
                  >
                    {WING_TYPE_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError message={errors.type?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wing-name">Wing Name</Label>
            <Input
              id="wing-name"
              className="h-10"
              autoComplete="off"
              placeholder="Wing A"
              aria-invalid={errors.name != null}
              {...form.register("name")}
            />
            <FieldError message={errors.name?.message} />
          </div>
        </div>
      </section>

      {wingType == null || layout == null ? null : (
        <section
          aria-label={`${wingTypeLabel(wingType)} configuration`}
          className="bg-card space-y-5 rounded-xl border p-4 sm:p-6"
        >
          <h3 className="font-semibold">Floors and units</h3>
          <div className="grid gap-5 sm:grid-cols-2">
            {LAYOUT_FIELDS[layout].map(numberField)}
          </div>
          {layout === "scheme" ? null : (
            <div className="flex items-center gap-3">
              <Controller
                control={form.control}
                name="terrace"
                render={({ field }) => (
                  <Switch
                    id="wing-terrace"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
              <Label htmlFor="wing-terrace">Terrace floor</Label>
            </div>
          )}
        </section>
      )}

      <FormAlert message={errors.root?.message} />
      {regenerates ? (
        <p className="text-muted-foreground text-sm">
          Continue to Units starts the floors over from these details.
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            router.push(cancelHref);
          }}
        >
          Cancel
        </Button>
        <Button type="submit">
          Continue to Units
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    </form>
  );
}

type Generated = {
  values: WingDetailsValues;
  type: WingType;
  floors: EditorFloor[];
};

/**
 * Add Wing (CM-402): details and configuration → Continue to Units → the
 * floor and unit editor → Save, which stores the Wing with its floors and
 * units in one request. The editor shows exactly what the server stores:
 * both run the same generator and checks.
 */
export function AddWingScreen({
  projectId,
  phaseId,
}: {
  projectId: string;
  /** Preselects this Phase (Add Wing from a Phase). */
  phaseId?: string;
}) {
  const router = useRouter();
  const { data } = useSuspenseQuery(wingsQuery(projectId));
  const create = useCreateWing(projectId);
  const back = wingsPath(projectId);
  const firstPhase =
    data.phases.find((phase) => phase.id === phaseId)?.id ??
    data.phases[0]?.id ??
    "";
  const [details, setDetails] = useState<WingDetailsValues>(() =>
    emptyDetails(firstPhase),
  );
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [step, setStep] = useState<"details" | "units">("details");
  const [problem, setProblem] = useState<{
    message: string;
    row: EditorProblem | null;
  } | null>(null);
  const [nameError, setNameError] = useState<
    FieldErrors<WingDetailsValues> | undefined
  >(undefined);

  const onContinue = (values: WingDetailsValues, type: WingType) => {
    try {
      const config = wingConfig(type, configInput(type, values));
      setDetails(values);
      setGenerated({
        values,
        type,
        floors: editorFromGenerated(generateWingFloors(type, config)),
      });
      setProblem(null);
      setNameError(undefined);
      setStep("units");
      return null;
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      const field = (error.details as { field?: string } | undefined)?.field;
      return {
        field:
          field != null && field in values
            ? (field as keyof WingDetailsValues)
            : null,
        message: error.message,
      };
    }
  };

  const save = async () => {
    if (generated == null) return;
    const { values, type, floors } = generated;
    setProblem(null);
    try {
      cleanWingFloors(type, toFloorInputs(floors));
      await create.mutateAsync({
        phaseId: values.phaseId === "" ? null : values.phaseId,
        type,
        name: values.name,
        config: configInput(type, values),
        floors: toFloorInputs(floors),
      });
      router.push(back);
    } catch (error) {
      const refused = saveProblem(error);
      if (refused.code === "WING_NAME_IN_USE") {
        setNameError({ name: { type: "server", message: refused.message } });
        setStep("details");
        return;
      }
      setProblem({ message: refused.message, row: refused.row });
    }
  };

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <SectionHeader
          back={{ label: "Wings", href: back }}
          title="Add Wing"
          meta={
            step === "details"
              ? "Step 1 of 2 · Wing details"
              : "Step 2 of 2 · Floors and units"
          }
        />
        {step === "details" || generated == null ? (
          <WingDetailsForm
            phases={data.phases}
            initial={details}
            regenerates={generated != null}
            onContinue={onContinue}
            cancelHref={back}
            serverErrors={nameError}
          />
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate font-semibold">
                  {generated.values.name.trim()}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {wingTypeLabel(generated.type)}
                  {data.phases.length > 0
                    ? ` · ${data.phases.find((phase) => phase.id === generated.values.phaseId)?.name ?? ""}`
                    : " · Phase 1"}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setStep("details");
                }}
              >
                <ArrowLeft aria-hidden="true" />
                Back to details
              </Button>
            </div>
            <WingEditor
              type={generated.type}
              floors={generated.floors}
              onChange={(floors) => {
                setGenerated({ ...generated, floors });
                setProblem(null);
              }}
              problem={problem?.row}
            />
            <FormAlert message={problem?.message} />
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  router.push(back);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={create.isPending}
                onClick={() => {
                  void save();
                }}
              >
                {create.isPending ? "Saving…" : "Save Wing"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
