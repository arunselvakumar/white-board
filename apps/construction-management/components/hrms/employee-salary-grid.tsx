"use client";

import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { IdCard, Search, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type FieldPath,
} from "react-hook-form";
import { z } from "zod";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { Input } from "@repo/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@repo/ui/components/input-group";
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
import {
  isRupees,
  MoneyInput,
  paiseToRupees,
  rupeesToPaise,
} from "@/components/money/money-input";
import { todayIn } from "@/src/shared-kernel/calendar-date";
import {
  employeeSalariesQuery,
  useSaveEmployeeSalaries,
  type EmployeeSalariesModel,
  type EmployeeSalaryRowModel,
} from "@/src/queries/hrms-salary-setup";
import { QueryHttpError } from "@/src/queries/http";

import { SALARY_STRUCTURES_PATH } from "./salary-structure-form";

const NO_GENDER = "none";
const PERCENT_OVERRIDE_RE = /^\d{1,3}(\.\d{1,2})?%$/;

const GENDER_ITEMS = [
  { value: NO_GENDER, label: "Not recorded" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

type RowValues = {
  memberId: string;
  structureId: string;
  base: string;
  gender: string;
  uan: string;
  esiIpNumber: string;
  effectiveFrom: string;
  /** Component id → "1600" (rupees) or "12.5%"; "" = the structure's own. */
  overrides: Record<string, string>;
};

type Values = { rows: RowValues[] };

type RowField = Exclude<keyof RowValues, "memberId" | "overrides">;

/** The fields Save All checks on a changed row, before the server checks again. */
function rowSchema(input: { financial: boolean; configured: boolean }) {
  return z.object({
    structureId: z.string().min(1, "Choose a salary structure"),
    base:
      input.financial || !input.configured
        ? z
            .string()
            .refine(
              (value) => isRupees(value),
              "Enter the base salary in rupees",
            )
        : z.string(),
    uan: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || /^\d{12}$/.test(value),
        "A UAN is 12 digits",
      ),
    esiIpNumber: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || /^\d{10}$/.test(value),
        "An ESI IP number is 10 digits",
      ),
    effectiveFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the date this salary starts"),
    overrides: z.record(
      z.string(),
      z
        .string()
        .trim()
        .refine(
          (value) =>
            value === "" || isRupees(value) || PERCENT_OVERRIDE_RE.test(value),
          "Enter rupees, like 1600, or a percentage, like 12.5%",
        ),
    ),
  });
}

const SERVER_FIELDS: Record<string, RowField> = {
  structureId: "structureId",
  baseMonthly: "base",
  gender: "gender",
  uan: "uan",
  esiIpNumber: "esiIpNumber",
  effectiveFrom: "effectiveFrom",
};

function overridesToValues(
  overrides: Record<string, { amount?: number; percent?: string }> | null,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [id, override] of Object.entries(overrides ?? {}))
    values[id] =
      override.percent != null
        ? `${override.percent}%`
        : paiseToRupees(override.amount ?? 0);
  return values;
}

function toRow(item: EmployeeSalaryRowModel, today: string): RowValues {
  const config = item.config;
  return {
    memberId: item.memberId,
    structureId: config?.structureId ?? "",
    base: paiseToRupees(config?.baseMonthly ?? null),
    gender: config?.gender ?? NO_GENDER,
    uan: config?.uan ?? "",
    esiIpNumber: config?.esiIpNumber ?? "",
    effectiveFrom: config?.effectiveFrom ?? `${today.slice(0, 7)}-01`,
    overrides: overridesToValues(config?.componentOverrides ?? null),
  };
}

function anyTrue(value: unknown): boolean {
  if (value === true) return true;
  if (value != null && typeof value === "object")
    return Object.values(value).some(anyTrue);
  return false;
}

function blankToNull(value: string): string | null {
  const text = value.trim();
  return text.length === 0 ? null : text;
}

function overridesToRequest(
  overrides: Record<string, string>,
): Record<string, { amount: number } | { percent: string }> {
  const request: Record<string, { amount: number } | { percent: string }> = {};
  for (const [id, raw] of Object.entries(overrides)) {
    const value = raw.trim();
    if (value === "") continue;
    request[id] = PERCENT_OVERRIDE_RE.test(value)
      ? { percent: value.slice(0, -1) }
      : { amount: rupeesToPaise(value) ?? 0 };
  }
  return request;
}

/**
 * Configuration → Employees (CM-315): every Team Member, Normal and HRMS,
 * with their salary structure and base salary, Configured or Not Set.
 * Save All sends only the members changed here, each with the version it
 * loaded; a member someone else saved meanwhile is named, not overwritten.
 * Without Financial, amounts stay hidden and only the other fields change.
 */
export function EmployeeSalaryGrid() {
  const { data } = useSuspenseQuery(employeeSalariesQuery);
  const queryClient = useQueryClient();
  const save = useSaveEmployeeSalaries();
  const today = todayIn("Asia/Kolkata");
  const [items, setItems] = useState(data.items);
  const form = useForm<Values>({
    defaultValues: { rows: items.map((item) => toRow(item, today)) },
  });
  const rows = useFieldArray({ control: form.control, name: "rows" });
  const [query, setQuery] = useState("");
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [saved, setSaved] = useState<string | null>(null);
  const [overridesFor, setOverridesFor] = useState<number | null>(null);

  const dirtyRows = form.formState.dirtyFields.rows ?? [];
  const dirtyIndexes = items
    .map((_, index) => index)
    .filter((index) => anyTrue(dirtyRows[index]));
  const configured = items.filter(
    (item) => item.status === "configured",
  ).length;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items
      .map((item, index) => ({ item, index }))
      .filter(
        ({ item }) =>
          needle === "" ||
          item.name.toLowerCase().includes(needle) ||
          (item.designationName ?? "").toLowerCase().includes(needle),
      );
  }, [items, query]);

  const reload = async () => {
    const fresh = await queryClient.query({
      ...employeeSalariesQuery,
      staleTime: 0,
    });
    setItems(fresh.items);
    form.reset({ rows: fresh.items.map((item) => toRow(item, today)) });
    setRowErrors({});
    setFormError(undefined);
  };

  const saveAll = async () => {
    setSaved(null);
    setFormError(undefined);
    setRowErrors({});
    form.clearErrors();
    const values = form.getValues("rows");
    let valid = true;
    for (const index of dirtyIndexes) {
      const item = items[index];
      const row = values[index];
      if (item == null || row == null) continue;
      const result = rowSchema({
        financial: data.financial,
        configured: item.config != null,
      }).safeParse(row);
      if (result.success) continue;
      valid = false;
      for (const issue of result.error.issues)
        form.setError(
          `rows.${index}.${issue.path.join(".")}` as FieldPath<Values>,
          { message: issue.message },
        );
    }
    if (!valid) {
      setFormError("Fix the highlighted members, then save again.");
      return;
    }
    const indexOf = new Map(items.map((item, index) => [item.memberId, index]));
    try {
      const response = await save.mutateAsync({
        rows: dirtyIndexes.map((index) => {
          const item = items[index];
          const row = values[index];
          if (item == null || row == null) throw new Error("unreachable");
          const overridesDirty = anyTrue(dirtyRows[index]?.overrides);
          const structureChanged = row.structureId !== item.config?.structureId;
          return {
            memberId: item.memberId,
            structureId: row.structureId,
            baseMonthly: data.financial ? rupeesToPaise(row.base) : null,
            componentOverrides:
              data.financial && (overridesDirty || structureChanged)
                ? overridesToRequest(row.overrides)
                : null,
            gender:
              row.gender === NO_GENDER
                ? null
                : (row.gender as "male" | "female" | "other"),
            uan: blankToNull(row.uan),
            esiIpNumber: blankToNull(row.esiIpNumber),
            effectiveFrom: row.effectiveFrom,
            expectedUpdatedAt: item.config?.updatedAt ?? null,
          };
        }),
      });
      const byId = new Map(response.items.map((item) => [item.memberId, item]));
      const next = items.map((item) => byId.get(item.memberId) ?? item);
      setItems(next);
      queryClient.setQueryData<EmployeeSalariesModel>(
        employeeSalariesQuery.queryKey,
        { ...data, items: next },
      );
      form.reset({ rows: next.map((item) => toRow(item, today)) });
      setSaved(
        `Saved ${String(response.items.length)} ${response.items.length === 1 ? "member" : "members"}.`,
      );
    } catch (error) {
      if (!(error instanceof QueryHttpError)) {
        setFormError("Something went wrong. Please try again.");
        return;
      }
      const details = (error.details ?? {}) as {
        memberId?: string;
        memberIds?: string[];
        field?: string;
      };
      if (error.code === "EMPLOYEE_SALARY_CHANGED") {
        const stale: Record<string, string> = {};
        for (const memberId of details.memberIds ?? [])
          stale[memberId] =
            "Someone else changed this member after you opened the screen.";
        setRowErrors(stale);
        setFormError(error.message);
        return;
      }
      const index =
        details.memberId == null ? undefined : indexOf.get(details.memberId);
      const field =
        details.field == null ? undefined : SERVER_FIELDS[details.field];
      if (index != null && field != null)
        form.setError(`rows.${index}.${field}`, { message: error.message });
      else if (details.memberId != null)
        setRowErrors({ [details.memberId]: error.message });
      setFormError(
        index != null
          ? `Fix ${items[index]?.name ?? "the highlighted member"}, then save again.`
          : error.message,
      );
    }
  };

  const overridesRow = overridesFor == null ? null : items[overridesFor];

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-6xl space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">Employees</h2>
          <p className="text-muted-foreground text-sm">
            Each member&apos;s salary structure and base salary.{" "}
            {String(configured)} of {String(items.length)} configured.
          </p>
        </div>

        {data.structures.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IdCard />
              </EmptyMedia>
              <EmptyTitle>Add a salary structure first</EmptyTitle>
              <EmptyDescription>
                Members are paid by a salary structure. Add one, then come back
                to give each member theirs.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Link
                href={`${SALARY_STRUCTURES_PATH}/new`}
                className={buttonVariants()}
              >
                Add salary structure
              </Link>
            </EmptyContent>
          </Empty>
        ) : (
          <form
            noValidate
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void saveAll();
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <InputGroup className="sm:max-w-xs">
                <InputGroupAddon>
                  <Search aria-hidden="true" />
                </InputGroupAddon>
                <InputGroupInput
                  type="search"
                  aria-label="Search members"
                  placeholder="Search members"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                  }}
                />
              </InputGroup>
              <div className="flex flex-wrap items-center gap-3">
                <p role="status" className="text-muted-foreground text-sm">
                  {dirtyIndexes.length > 0
                    ? `${String(dirtyIndexes.length)} changed`
                    : (saved ?? "")}
                </p>
                <Button
                  type="submit"
                  disabled={dirtyIndexes.length === 0 || save.isPending}
                >
                  {save.isPending ? "Saving…" : "Save All"}
                </Button>
              </div>
            </div>
            {data.financial ? null : (
              <p className="text-muted-foreground text-sm">
                Salary amounts are hidden. You can change structures, start
                dates and statutory details of configured members.
              </p>
            )}
            {formError == null ? null : (
              <div className="flex flex-wrap items-center gap-3">
                <FormAlert message={formError} />
                {Object.keys(rowErrors).length > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void reload();
                    }}
                  >
                    Reload
                  </Button>
                ) : null}
              </div>
            )}
            {visible.length === 0 ? (
              <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
                No member matches “{query.trim()}”.
              </p>
            ) : (
              <ul aria-label="Members" className="space-y-3">
                {visible.map(({ item, index }) => (
                  <MemberRow
                    key={rows.fields[index]?.id ?? item.memberId}
                    index={index}
                    item={item}
                    form={form}
                    structures={data.structures}
                    financial={data.financial}
                    dirty={anyTrue(dirtyRows[index])}
                    rowError={rowErrors[item.memberId]}
                    onOverrides={() => {
                      setOverridesFor(index);
                    }}
                  />
                ))}
              </ul>
            )}
          </form>
        )}
      </div>
      <OverridesDialog
        index={overridesFor}
        item={overridesRow ?? null}
        form={form}
        structures={data.structures}
        onClose={() => {
          setOverridesFor(null);
        }}
      />
    </div>
  );
}

type FormApi = ReturnType<typeof useForm<Values>>;

function MemberRow({
  index,
  item,
  form,
  structures,
  financial,
  dirty,
  rowError,
  onOverrides,
}: {
  index: number;
  item: EmployeeSalaryRowModel;
  form: FormApi;
  structures: EmployeeSalariesModel["structures"];
  financial: boolean;
  dirty: boolean;
  rowError: string | undefined;
  onOverrides: () => void;
}) {
  const errors = form.formState.errors.rows?.[index];
  const prefix = `employee-${item.memberId}`;
  // Without Financial a Not Set member cannot be given a base salary.
  const locked = !financial && item.config == null;
  const structureItems = structures
    .filter(
      (structure) =>
        structure.isActive || structure.id === item.config?.structureId,
    )
    .map((structure) => ({ value: structure.id, label: structure.name }));
  const overrideCount = Object.values(
    useWatch({ control: form.control, name: `rows.${index}.overrides` }),
  ).filter((value) => value.trim() !== "").length;
  return (
    <li
      aria-label={item.name}
      className="bg-card space-y-4 rounded-xl border p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="font-medium">{item.name}</p>
          <p className="text-muted-foreground text-sm">
            {item.designationName ?? "No designation"}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {item.memberType === "hrms" ? (
            <Badge variant="outline">HRMS</Badge>
          ) : null}
          {item.active ? null : (
            <Badge variant="outline">Joining Pending</Badge>
          )}
          {dirty ? <Badge variant="secondary">Changed</Badge> : null}
          <Badge
            variant={item.status === "configured" ? "default" : "secondary"}
          >
            {item.status === "configured" ? "Configured" : "Not Set"}
          </Badge>
        </div>
      </div>
      {locked ? (
        <p className="text-muted-foreground text-sm">
          Not set. Someone with Financial access on Employee Management sets the
          first salary.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${prefix}-structure`}>Salary structure</Label>
            <Controller
              name={`rows.${index}.structureId`}
              control={form.control}
              render={({ field }) => (
                <Select
                  items={structureItems}
                  value={field.value === "" ? null : field.value}
                  onValueChange={(value) => {
                    if (value == null) return;
                    field.onChange(value);
                    // Overrides belong to a structure's components.
                    form.setValue(
                      `rows.${index}.overrides`,
                      {},
                      {
                        shouldDirty: true,
                      },
                    );
                  }}
                >
                  <SelectTrigger
                    id={`${prefix}-structure`}
                    size="lg"
                    className="w-full min-w-0"
                    aria-invalid={errors?.structureId != null}
                  >
                    <SelectValue placeholder="Choose" />
                  </SelectTrigger>
                  <SelectContent
                    align="start"
                    alignItemWithTrigger={false}
                    aria-label="Salary structures"
                  >
                    {structureItems.map((structure) => (
                      <SelectItem key={structure.value} value={structure.value}>
                        {structure.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError message={errors?.structureId?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${prefix}-base`}>Base salary a month</Label>
            {financial ? (
              <div className="flex gap-2">
                <MoneyInput
                  id={`${prefix}-base`}
                  className="min-w-0 flex-1"
                  aria-invalid={errors?.base != null}
                  {...form.register(`rows.${index}.base`)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-10"
                  aria-label={`Component amounts for ${item.name}`}
                  onClick={onOverrides}
                >
                  <SlidersHorizontal />
                </Button>
              </div>
            ) : (
              <Input
                id={`${prefix}-base`}
                className="h-10"
                value="Hidden"
                disabled
              />
            )}
            {overrideCount > 0 ? (
              <p className="text-muted-foreground text-xs">
                {String(overrideCount)} component{" "}
                {overrideCount === 1 ? "amount" : "amounts"} of their own
              </p>
            ) : null}
            <FieldError message={errors?.base?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${prefix}-from`}>Starts on</Label>
            <Input
              id={`${prefix}-from`}
              type="date"
              className="h-10"
              aria-invalid={errors?.effectiveFrom != null}
              {...form.register(`rows.${index}.effectiveFrom`)}
            />
            <FieldError message={errors?.effectiveFrom?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${prefix}-gender`}>Gender</Label>
            <Controller
              name={`rows.${index}.gender`}
              control={form.control}
              render={({ field }) => (
                <Select
                  items={GENDER_ITEMS}
                  value={field.value}
                  onValueChange={(value) => {
                    if (value != null) field.onChange(value);
                  }}
                >
                  <SelectTrigger
                    id={`${prefix}-gender`}
                    size="lg"
                    className="w-full min-w-0"
                    aria-describedby={`${prefix}-gender-hint`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    align="start"
                    alignItemWithTrigger={false}
                    aria-label="Genders"
                  >
                    {GENDER_ITEMS.map((gender) => (
                      <SelectItem key={gender.value} value={gender.value}>
                        {gender.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <p
              id={`${prefix}-gender-hint`}
              className="text-muted-foreground text-xs"
            >
              For professional tax slabs that differ for women.
            </p>
            <FieldError message={errors?.gender?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${prefix}-uan`}>UAN</Label>
            <Input
              id={`${prefix}-uan`}
              inputMode="numeric"
              className="h-10"
              placeholder="12 digits"
              aria-invalid={errors?.uan != null}
              {...form.register(`rows.${index}.uan`)}
            />
            <FieldError message={errors?.uan?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${prefix}-esi`}>ESI IP number</Label>
            <Input
              id={`${prefix}-esi`}
              inputMode="numeric"
              className="h-10"
              placeholder="10 digits"
              aria-invalid={errors?.esiIpNumber != null}
              {...form.register(`rows.${index}.esiIpNumber`)}
            />
            <FieldError message={errors?.esiIpNumber?.message} />
          </div>
        </div>
      )}
      <FormAlert message={rowError} />
    </li>
  );
}

/** A member's own amount for each component of their structure (CM-315). */
function OverridesDialog({
  index,
  item,
  form,
  structures,
  onClose,
}: {
  index: number | null;
  item: EmployeeSalaryRowModel | null;
  form: FormApi;
  structures: EmployeeSalariesModel["structures"];
  onClose: () => void;
}) {
  const structureId = useWatch({
    control: form.control,
    name: `rows.${index ?? 0}.structureId`,
  });
  const structure = structures.find(
    (candidate) => candidate.id === structureId,
  );
  const errors =
    index == null ? undefined : form.formState.errors.rows?.[index];
  return (
    <Dialog
      open={index != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Component amounts</DialogTitle>
          <DialogDescription>
            {item?.name ?? "This member"}&apos;s own amount for a component, in
            rupees or as a percentage of their base salary (like 12.5%). Leave
            it empty to use {structure?.name ?? "the structure"}.
          </DialogDescription>
        </DialogHeader>
        {index == null || structure == null ? (
          <p className="text-muted-foreground text-sm">
            Choose a salary structure first.
          </p>
        ) : (
          <ul className="space-y-3">
            {structure.components.map((component) => (
              <li key={component.id} className="space-y-1.5">
                <Label htmlFor={`override-${component.id}`}>
                  {component.name}
                </Label>
                {component.isBalancing ? (
                  <p className="text-muted-foreground text-sm">
                    Balancing: what is left of the base salary.
                  </p>
                ) : (
                  <>
                    <Input
                      id={`override-${component.id}`}
                      className="h-10"
                      inputMode="decimal"
                      placeholder="From the structure"
                      aria-invalid={errors?.overrides?.[component.id] != null}
                      {...form.register(
                        `rows.${index}.overrides.${component.id}`,
                      )}
                    />
                    <FieldError
                      message={errors?.overrides?.[component.id]?.message}
                    />
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
