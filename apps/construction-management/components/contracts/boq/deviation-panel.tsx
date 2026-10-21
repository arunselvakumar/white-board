"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { CircleCheck } from "lucide-react";
import { useId, useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@repo/ui/components/input-group";
import { Label } from "@repo/ui/components/label";

import { FieldError } from "@/components/auth/field-error";
import { fieldForCode } from "@/lib/server-errors";
import { deviationLimit } from "@/src/contracts/domain/deviation";
import {
  boqDeviationsQuery,
  boqSettingsQuery,
  useUpdateBoqSettings,
  type BoqDeviation,
} from "@/src/queries/contracts-boq";

import { quantity, quantityInput } from "./boq-format";
import type { VariationPrefill } from "./variation-dialog";

function validLimit(text: string): boolean {
  try {
    deviationLimit(text.trim());
    return true;
  } catch {
    return false;
  }
}

const percentText = (value: string) => value.replace(/\.?0+$/, "");

/**
 * The Company's deviation limit (CM-1103): shown to every BOQ viewer and
 * changed by a holder of BOQ Edit. It applies to every Project.
 */
export function DeviationLimitControl() {
  const id = useId();
  const { data } = useSuspenseQuery(boqSettingsQuery());
  const save = useUpdateBoqSettings();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(data.deviationLimitPercent);
  const [error, setError] = useState<string | undefined>();
  if (!editing)
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Deviation limit</span>
        <span className="font-medium tabular-nums">
          {percentText(data.deviationLimitPercent)} %
        </span>
        <span className="text-muted-foreground">for every Project</span>
        {data.canUpdate ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setValue(percentText(data.deviationLimitPercent));
              setError(undefined);
              setEditing(true);
            }}
          >
            Change
          </Button>
        ) : null}
      </div>
    );
  return (
    <form
      noValidate
      className="flex flex-wrap items-start gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!validLimit(value)) {
          setError("0 to 100, with at most two decimals.");
          return;
        }
        save.mutate(value.trim(), {
          onSuccess: () => {
            setEditing(false);
          },
          onError: (failure) => {
            setError(fieldForCode(failure, {}).message);
          },
        });
      }}
    >
      <div className="space-y-1">
        <Label htmlFor={`${id}-limit`} className="sr-only">
          Deviation limit
        </Label>
        <InputGroup className="h-9 w-32">
          <InputGroupInput
            id={`${id}-limit`}
            inputMode="decimal"
            autoComplete="off"
            value={value}
            aria-invalid={error != null}
            onChange={(event) => {
              setValue(event.target.value);
            }}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupText>%</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
        <FieldError message={error} />
      </div>
      <Button type="submit" size="sm" disabled={save.isPending}>
        Save
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => {
          setEditing(false);
        }}
      >
        Cancel
      </Button>
    </form>
  );
}

/**
 * Items whose checked measured quantity is beyond the deviation limit over
 * their current quantity (CM-1103, ADR CM-0023 §4). Each needs a Variation:
 * "Raise variation" opens a quantity change filled with what was measured.
 */
export function DeviationPanel({
  projectId,
  canRaise,
  onRaise,
}: {
  projectId: string;
  canRaise: boolean;
  onRaise: (prefill: VariationPrefill) => void;
}) {
  const { data } = useSuspenseQuery(boqDeviationsQuery(projectId));
  const raise = (row: BoqDeviation) => {
    onRaise({
      kind: "quantity",
      boqItemId: row.boqItemId,
      newQuantity: quantityInput(row.measuredQuantity),
    });
  };
  return (
    <div className="min-w-0 space-y-4">
      <DeviationLimitControl />
      {data.items.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CircleCheck />
            </EmptyMedia>
            <EmptyTitle>No deviations</EmptyTitle>
            <EmptyDescription>
              No item is measured more than{" "}
              {percentText(data.deviationLimitPercent)} % over its quantity.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul aria-label="Deviations" className="space-y-3">
          {data.items.map((row) => (
            <li
              key={row.boqItemId}
              className="bg-card flex min-w-0 flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <p className="min-w-0 text-sm break-words">
                  <span className="font-semibold tabular-nums">
                    {row.itemNo}
                  </span>{" "}
                  {row.description}
                </p>
                <p className="text-muted-foreground text-xs">
                  {row.sectionTitle}
                </p>
                <p className="text-sm tabular-nums">
                  Measured {quantity(row.measuredQuantity)} {row.uomName} of{" "}
                  {quantity(row.quantity)}
                  {row.percentOver == null ? null : (
                    <Badge variant="destructive" className="ml-2">
                      {percentText(row.percentOver)} % over
                    </Badge>
                  )}
                </p>
              </div>
              {row.pendingVariation != null ? (
                <Badge
                  variant="secondary"
                  className="self-start sm:self-center"
                >
                  {row.pendingVariation.number} pending
                </Badge>
              ) : canRaise ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="self-start sm:self-center"
                  aria-label={`Raise variation for ${row.itemNo}`}
                  onClick={() => {
                    raise(row);
                  }}
                >
                  Raise variation
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
