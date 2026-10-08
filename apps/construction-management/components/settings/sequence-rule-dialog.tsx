"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
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
import { fieldForCode } from "@/lib/server-errors";
import {
  createSequenceRule,
  updateSequenceRule,
  type SequenceRuleItem,
} from "@/src/queries/settings";
import {
  SEQUENCE_LIMITS,
  fiscalYearOf,
  formatSequenceNumber,
  sequenceModule,
  standardSequenceSettings,
  type SequenceModuleKey,
  type SequenceSeparator,
} from "@/src/shared-kernel/sequence";

const TOKEN_RE = /^[A-Za-z0-9/_.-]*$/;
const tokenMessage = `Use up to ${String(SEQUENCE_LIMITS.tokenLength)} letters, digits and / - _ .`;

const schema = z.object({
  /** "default" for All projects, else a Project id. */
  projectId: z.string().min(1, "Choose a Project"),
  prefix: z
    .string()
    .trim()
    .max(SEQUENCE_LIMITS.tokenLength, tokenMessage)
    .regex(TOKEN_RE, tokenMessage),
  projectToken: z
    .string()
    .trim()
    .max(SEQUENCE_LIMITS.tokenLength, tokenMessage)
    .regex(TOKEN_RE, tokenMessage),
  startNumber: z
    .number({ error: "Enter a start number of 1 or more" })
    .int("Use a whole number")
    .min(1, "Enter a start number of 1 or more")
    .max(SEQUENCE_LIMITS.maxStartNumber, "That number is too large"),
  padding: z
    .number({ error: "Enter how many digits" })
    .int("Use a whole number")
    .min(SEQUENCE_LIMITS.minPadding, "Use 1 to 10 digits")
    .max(SEQUENCE_LIMITS.maxPadding, "Use 1 to 10 digits"),
  separator: z.enum(["/", "-", "_", ".", "none"]),
  fiscalYearToken: z.boolean(),
});

type Values = z.infer<typeof schema>;

const DEFAULT_ITEM = { value: "default", label: "All projects (default)" };

const SEPARATOR_ITEMS = [
  { value: "/", label: "/ (slash)" },
  { value: "-", label: "- (hyphen)" },
  { value: "_", label: "_ (underscore)" },
  { value: ".", label: ". (dot)" },
  { value: "none", label: "None" },
];

const SERVER_FIELDS: Record<string, keyof Values> = {
  SEQUENCE_PREFIX_INVALID: "prefix",
  SEQUENCE_PROJECT_TOKEN_INVALID: "projectToken",
  SEQUENCE_START_NUMBER_INVALID: "startNumber",
  SEQUENCE_PADDING_INVALID: "padding",
  SEQUENCE_RULE_EXISTS: "projectId",
  PROJECT_NOT_FOUND: "projectId",
};

function separatorOf(value: Values["separator"]): SequenceSeparator {
  return value === "none" ? "" : value;
}

/** Add or edit one module's rule, with a live preview of the first number. */
export function SequenceRuleDialog({
  module,
  rule,
  projects,
  canAddDefault,
  today,
  onSaved,
  onClose,
}: {
  module: SequenceModuleKey;
  /** Null to add a rule: the module's default or one Project's. */
  rule: SequenceRuleItem | null;
  /**
   * Projects a new rule may be for (those without one for this module);
   * when editing, the rule's own Project for its label.
   */
  projects: readonly { id: string; name: string }[];
  /** Whether the module still has no rule for All projects. */
  canAddDefault: boolean;
  /** `YYYY-MM-DD`; picks the fiscal year shown in the preview. */
  today: string;
  onSaved: () => void;
  onClose: () => void;
}) {
  const start = rule ?? standardSequenceSettings(module);
  const projectItems = [
    ...(rule?.isDefault === true || (rule == null && canAddDefault)
      ? [DEFAULT_ITEM]
      : []),
    ...projects.map((project) => ({ value: project.id, label: project.name })),
  ];
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      projectId:
        rule == null
          ? (projectItems[0]?.value ?? "")
          : (rule.projectId ?? "default"),
      prefix: start.prefix,
      projectToken: start.projectToken,
      startNumber: start.startNumber,
      padding: start.padding,
      separator: start.separator === "" ? "none" : start.separator,
      fiscalYearToken: start.fiscalYearToken,
    },
  });
  const mutation = useMutation({
    mutationFn: (values: Values) => {
      const settings = {
        prefix: values.prefix,
        projectToken: values.projectToken,
        startNumber: values.startNumber,
        padding: values.padding,
        separator: separatorOf(values.separator),
        fiscalYearToken: values.fiscalYearToken,
      };
      return rule == null
        ? createSequenceRule({
            module,
            projectId: values.projectId === "default" ? null : values.projectId,
            ...settings,
          })
        : updateSequenceRule(rule.id, {
            ...settings,
            expectedUpdatedAt: rule.updatedAt,
          });
    },
  });
  const watched = useWatch({ control: form.control });
  const fiscalYear = fiscalYearOf(today);
  const preview = formatSequenceNumber(
    {
      prefix: (watched.prefix ?? "").trim(),
      projectToken: (watched.projectToken ?? "").trim(),
      startNumber: 1,
      padding:
        Number.isInteger(watched.padding) &&
        (watched.padding ?? 0) >= SEQUENCE_LIMITS.minPadding &&
        (watched.padding ?? 0) <= SEQUENCE_LIMITS.maxPadding
          ? (watched.padding ?? SEQUENCE_LIMITS.defaultPadding)
          : SEQUENCE_LIMITS.defaultPadding,
      separator: separatorOf(watched.separator ?? "/"),
      fiscalYearToken: watched.fiscalYearToken ?? true,
    },
    fiscalYear,
    Number.isInteger(watched.startNumber) && (watched.startNumber ?? 0) >= 1
      ? (watched.startNumber ?? 1)
      : 1,
  );
  const errors = form.formState.errors;

  const submit = async (values: Values) => {
    try {
      await mutation.mutateAsync(values);
      onSaved();
    } catch (error) {
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
      form.setError(field ?? "root", { message });
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <form
          noValidate
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit(submit)(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {rule == null ? "Add rule" : "Edit rule"} ·{" "}
              {sequenceModule(module).label}
            </DialogTitle>
            <DialogDescription>
              New documents get the next number in this format. Numbers already
              issued do not change.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="sequence-project">Project</Label>
            <Controller
              name="projectId"
              control={form.control}
              render={({ field }) => (
                <Select
                  items={projectItems}
                  value={field.value}
                  disabled={rule != null}
                  onValueChange={(value) => {
                    if (value != null) field.onChange(value);
                  }}
                >
                  <SelectTrigger
                    id="sequence-project"
                    size="lg"
                    className="w-full min-w-0"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    align="start"
                    alignItemWithTrigger={false}
                    aria-label="Projects"
                  >
                    {projectItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError message={errors.projectId?.message} />
            <p className="text-muted-foreground text-sm">
              A Project&apos;s own rule replaces the default for that Project.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sequence-prefix">Prefix</Label>
              <Input
                id="sequence-prefix"
                placeholder="PR"
                className="h-10"
                {...form.register("prefix")}
              />
              <FieldError message={errors.prefix?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sequence-project-token">Project token</Label>
              <Input
                id="sequence-project-token"
                placeholder="P1"
                className="h-10"
                {...form.register("projectToken")}
              />
              <FieldError message={errors.projectToken?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sequence-start">Start number</Label>
              <Input
                id="sequence-start"
                type="number"
                inputMode="numeric"
                min={1}
                className="h-10"
                {...form.register("startNumber", { valueAsNumber: true })}
              />
              <FieldError message={errors.startNumber?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sequence-padding">Digits</Label>
              <Input
                id="sequence-padding"
                type="number"
                inputMode="numeric"
                min={SEQUENCE_LIMITS.minPadding}
                max={SEQUENCE_LIMITS.maxPadding}
                className="h-10"
                {...form.register("padding", { valueAsNumber: true })}
              />
              <FieldError message={errors.padding?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sequence-separator">Separator</Label>
              <Controller
                name="separator"
                control={form.control}
                render={({ field }) => (
                  <Select
                    items={SEPARATOR_ITEMS}
                    value={field.value}
                    onValueChange={(value) => {
                      if (value != null) field.onChange(value);
                    }}
                  >
                    <SelectTrigger
                      id="sequence-separator"
                      size="lg"
                      className="w-full min-w-0"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent
                      align="start"
                      alignItemWithTrigger={false}
                      aria-label="Separators"
                    >
                      {SEPARATOR_ITEMS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="flex items-center gap-3 self-end pb-2">
              <Controller
                name="fiscalYearToken"
                control={form.control}
                render={({ field }) => (
                  <Switch
                    id="sequence-fiscal-year"
                    checked={field.value}
                    onCheckedChange={(checked) => {
                      field.onChange(checked);
                    }}
                  />
                )}
              />
              <Label htmlFor="sequence-fiscal-year" className="font-normal">
                Add the fiscal year ({fiscalYear.label}) and restart every 1
                April
              </Label>
            </div>
          </div>

          <div className="bg-muted/50 rounded-lg border px-4 py-3">
            <p className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase">
              Preview
            </p>
            <output
              aria-label="Preview"
              aria-live="polite"
              className="font-mono text-lg"
            >
              {preview}
            </output>
          </div>

          <FormAlert message={errors.root?.message} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save rule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
