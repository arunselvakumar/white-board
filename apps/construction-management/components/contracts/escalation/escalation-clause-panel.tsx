"use client";

import { useQuery } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
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

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import {
  MoneyInput,
  paiseToRupees,
  rupeesToPaise,
} from "@/components/money/money-input";
import {
  ESCALATION_COMPONENTS,
  type EscalationComponent,
} from "@/src/contracts/domain/contract-terms";
import {
  escalationClauseQuery,
  useEscalationClauseCommand,
  type EscalationClauseView,
  type EscalationScope,
} from "@/src/queries/contracts-escalation";
import { QueryHttpError } from "@/src/queries/http";

import {
  ESCALATION_COMPONENT_LABELS,
  moneyOrDash,
  monthText,
  percentText,
} from "./escalation-format";

const SERIES_SUGGESTIONS = [
  "WPI – All commodities",
  "CPI-IW",
  "WPI – Cement",
  "WPI – Steel",
  "WPI – Bitumen",
  "WPI – HSD (POL)",
];

/**
 * The escalation clause of a Work Order or of the client contract
 * (CM-1109, ADR CM-0023 §9): base month, non-escalable share and the
 * components with their weight (10CC) or base price (10CA) and index
 * series. Shown on the Work Order page and the Client Bills page. Editing
 * needs the side's Update and Financial; an approved escalation bill
 * locks it.
 */
export function EscalationClausePanel({ scope }: { scope: EscalationScope }) {
  const view = useQuery(escalationClauseQuery(scope)).data;
  const [editing, setEditing] = useState(false);
  const command = useEscalationClauseCommand(scope);
  if (view == null) return null;
  const clause = view.clause;
  return (
    <section
      aria-labelledby="escalation-clause-title"
      className="min-w-0 space-y-3 rounded-lg border p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id="escalation-clause-title" className="font-semibold">
            Escalation clause
          </h3>
          <p className="text-muted-foreground text-sm">
            {clause == null
              ? "No price variation: this contract is at fixed rates."
              : `Base month ${monthText(clause.baseMonth)} · non-escalable ${percentText(clause.nonEscalablePercent)}`}
          </p>
        </div>
        {view.canEdit ? (
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing(true);
              }}
            >
              {clause == null ? (
                <Plus aria-hidden="true" />
              ) : (
                <Pencil aria-hidden="true" />
              )}
              {clause == null ? "Add clause" : "Edit"}
            </Button>
            {clause != null ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label="Remove escalation clause"
                disabled={command.isPending}
                onClick={() => {
                  command.mutate({
                    kind: "delete",
                    id: clause.id,
                    expectedUpdatedAt: clause.updatedAt,
                  });
                }}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {clause != null ? (
        <ul aria-label="Components" className="grid gap-2 sm:grid-cols-2">
          {clause.components.map((row) => (
            <li
              key={row.component}
              className="bg-muted/40 min-w-0 rounded-md px-3 py-2 text-sm"
            >
              <p className="font-medium">
                {ESCALATION_COMPONENT_LABELS[row.component]}{" "}
                <span className="text-muted-foreground font-normal">
                  {row.basis === "quantity"
                    ? `· 10CA at ${moneyOrDash(row.basePrice)} a unit`
                    : `· ${percentText(row.weightPercent)}`}
                </span>
              </p>
              <p className="text-muted-foreground text-xs break-words">
                {row.series}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      {view.approvedBills > 0 ? (
        <p className="text-muted-foreground text-xs">
          Locked: {view.approvedBills} approved escalation{" "}
          {view.approvedBills === 1 ? "bill uses" : "bills use"} it.
        </p>
      ) : null}
      {command.error != null ? (
        <FormAlert message={command.error.message} />
      ) : null}
      <EscalationClauseDialog
        scope={scope}
        view={view}
        open={editing}
        onOpenChange={setEditing}
      />
    </section>
  );
}

type Row = {
  component: EscalationComponent;
  basis: "weighted" | "quantity";
  weight: string;
  basePrice: string;
  series: string;
};

function rowsOf(view: EscalationClauseView): Row[] {
  return (
    view.clause?.components.map((row) => ({
      component: row.component,
      basis: row.basis,
      weight: row.weightPercent?.replace(/\.?0+$/, "") ?? "",
      basePrice: row.basePrice == null ? "" : paiseToRupees(row.basePrice),
      series: row.series,
    })) ?? [
      {
        component: "labour",
        basis: "weighted",
        weight: "",
        basePrice: "",
        series: "CPI-IW",
      },
      {
        component: "material",
        basis: "weighted",
        weight: "",
        basePrice: "",
        series: "WPI – All commodities",
      },
    ]
  );
}

/** Σ weighted weights, as typed. */
export function weightTotal(rows: readonly Row[]): number {
  return rows
    .filter((row) => row.basis === "weighted")
    .reduce((sum, row) => sum + (Number(row.weight) || 0), 0);
}

function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof QueryHttpError)) return {};
  const details = error.details as { field?: string } | null | undefined;
  return details?.field == null ? {} : { [details.field]: error.message };
}

/** Add or edit the clause: weights must add up to 100. */
export function EscalationClauseDialog({
  scope,
  view,
  open,
  onOpenChange,
}: {
  scope: EscalationScope;
  view: EscalationClauseView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const command = useEscalationClauseCommand(scope);
  const [baseMonth, setBaseMonth] = useState(
    view.clause?.baseMonth.slice(0, 7) ?? "",
  );
  const [nonEscalable, setNonEscalable] = useState(
    view.clause?.nonEscalablePercent?.replace(/\.?0+$/, "") ?? "15",
  );
  const [rows, setRows] = useState<Row[]>(() => rowsOf(view));
  const total = weightTotal(rows);
  const errors = fieldErrors(command.error);
  const unused = ESCALATION_COMPONENTS.filter(
    (component) => !rows.some((row) => row.component === component),
  );
  const change = (index: number, patch: Partial<Row>) => {
    setRows((current) =>
      current.map((row, at) => (at === index ? { ...row, ...patch } : row)),
    );
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setRows(rowsOf(view));
          setBaseMonth(view.clause?.baseMonth.slice(0, 7) ?? "");
        } else command.reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="grid-cols-1 sm:max-w-2xl">
        <form
          noValidate
          className="flex min-w-0 flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            const components = rows.map((row) => ({
              component: row.component,
              basis: row.basis,
              weightPercent: row.basis === "weighted" ? row.weight : null,
              basePrice:
                row.basis === "quantity" ? rupeesToPaise(row.basePrice) : null,
              series: row.series,
            }));
            const terms = {
              baseMonth,
              nonEscalablePercent: nonEscalable,
              components,
            };
            const done = {
              onSuccess: () => {
                onOpenChange(false);
              },
            };
            if (view.clause == null)
              command.mutate(
                {
                  kind: "create",
                  input: {
                    projectId: scope.projectId,
                    workOrderId: scope.workOrderId,
                    ...terms,
                  },
                },
                done,
              );
            else
              command.mutate(
                {
                  kind: "update",
                  id: view.clause.id,
                  input: { ...terms, expectedUpdatedAt: view.clause.updatedAt },
                },
                done,
              );
          }}
        >
          <DialogHeader>
            <DialogTitle>Escalation clause</DialogTitle>
            <DialogDescription>
              CPWD 10CC: each component&apos;s share of the escalable value
              moves with its index from the base month. Cement and steel may use
              10CA instead: quantity × base price × the index change.
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="clause-base-month" required>
                Base month
              </Label>
              <Input
                id="clause-base-month"
                type="month"
                value={baseMonth}
                onChange={(event) => {
                  setBaseMonth(event.currentTarget.value);
                }}
                aria-required
                aria-invalid={errors["baseMonth"] != null}
              />
              <FieldError message={errors["baseMonth"]} />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="clause-non-escalable">Non-escalable %</Label>
              <Input
                id="clause-non-escalable"
                inputMode="decimal"
                value={nonEscalable}
                onChange={(event) => {
                  setNonEscalable(event.currentTarget.value);
                }}
                aria-invalid={errors["nonEscalablePercent"] != null}
              />
              <FieldError message={errors["nonEscalablePercent"]} />
            </div>
          </div>
          <ul aria-label="Clause components" className="min-w-0 space-y-3">
            {rows.map((row, index) => {
              const prefix = `components.${String(index)}`;
              const quantityAllowed =
                row.component === "cement" || row.component === "steel";
              return (
                <li
                  key={`${row.component}-${String(index)}`}
                  className="grid min-w-0 gap-2 rounded-md border p-3 sm:grid-cols-[10rem_minmax(0,1fr)_8rem_auto]"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs font-medium">Component</p>
                    <Select
                      items={ESCALATION_COMPONENTS.filter(
                        (component) =>
                          component === row.component ||
                          unused.includes(component),
                      ).map((component) => ({
                        value: component,
                        label: ESCALATION_COMPONENT_LABELS[component],
                      }))}
                      value={row.component}
                      onValueChange={(value) => {
                        const component = ESCALATION_COMPONENTS.find(
                          (item) => item === value,
                        );
                        if (component == null) return;
                        change(index, {
                          component,
                          basis:
                            component === "cement" || component === "steel"
                              ? row.basis
                              : "weighted",
                        });
                      }}
                    >
                      <SelectTrigger
                        aria-label={`Component ${String(index + 1)}`}
                        className="w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ESCALATION_COMPONENTS.filter(
                          (component) =>
                            component === row.component ||
                            unused.includes(component),
                        ).map((component) => (
                          <SelectItem key={component} value={component}>
                            {ESCALATION_COMPONENT_LABELS[component]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {quantityAllowed ? (
                      <label className="flex items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          checked={row.basis === "quantity"}
                          onChange={(event) => {
                            change(index, {
                              basis: event.currentTarget.checked
                                ? "quantity"
                                : "weighted",
                            });
                          }}
                        />
                        By quantity (10CA)
                      </label>
                    ) : null}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <Label
                      className="text-xs"
                      htmlFor={`${prefix}.series`}
                      required
                    >
                      Index series
                    </Label>
                    <Input
                      id={`${prefix}.series`}
                      list="clause-series-options"
                      value={row.series}
                      onChange={(event) => {
                        change(index, { series: event.currentTarget.value });
                      }}
                      aria-required
                      aria-invalid={errors[`${prefix}.series`] != null}
                    />
                    <FieldError message={errors[`${prefix}.series`]} />
                  </div>
                  <div className="min-w-0 space-y-1">
                    {row.basis === "quantity" ? (
                      <>
                        <Label
                          className="text-xs"
                          htmlFor={`${prefix}.basePrice`}
                          required
                        >
                          Base price (₹ a unit)
                        </Label>
                        <MoneyInput
                          id={`${prefix}.basePrice`}
                          value={row.basePrice}
                          onChange={(event) => {
                            change(index, {
                              basePrice: event.currentTarget.value,
                            });
                          }}
                          aria-required
                          aria-invalid={errors[`${prefix}.basePrice`] != null}
                        />
                        <FieldError message={errors[`${prefix}.basePrice`]} />
                      </>
                    ) : (
                      <>
                        <Label
                          className="text-xs"
                          htmlFor={`${prefix}.weight`}
                          required
                        >
                          Weight %
                        </Label>
                        <Input
                          id={`${prefix}.weight`}
                          inputMode="decimal"
                          value={row.weight}
                          onChange={(event) => {
                            change(index, {
                              weight: event.currentTarget.value,
                            });
                          }}
                          aria-required
                          aria-invalid={
                            errors[`${prefix}.weightPercent`] != null
                          }
                        />
                        <FieldError
                          message={errors[`${prefix}.weightPercent`]}
                        />
                      </>
                    )}
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Remove ${ESCALATION_COMPONENT_LABELS[row.component]}`}
                      onClick={() => {
                        setRows((current) =>
                          current.filter((_, at) => at !== index),
                        );
                      }}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          <datalist id="clause-series-options">
            {SERIES_SUGGESTIONS.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={unused.length === 0}
              onClick={() => {
                const component = unused[0];
                if (component == null) return;
                setRows((current) => [
                  ...current,
                  {
                    component,
                    basis: "weighted",
                    weight: "",
                    basePrice: "",
                    series: "",
                  },
                ]);
              }}
            >
              <Plus aria-hidden="true" />
              Add component
            </Button>
            <p
              className={total === 100 ? "text-sm" : "text-destructive text-sm"}
              aria-live="polite"
            >
              Weights add up to {total.toLocaleString("en-IN")} %
              {total === 100 ? "" : " (must be 100 %)"}
            </p>
          </div>
          <FieldError message={errors["components"]} />
          <FormAlert
            message={
              command.error != null && Object.keys(errors).length === 0
                ? command.error.message
                : undefined
            }
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={command.isPending}>
              {command.isPending ? "Saving…" : "Save clause"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
