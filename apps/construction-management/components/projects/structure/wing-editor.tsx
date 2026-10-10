"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "@repo/ui/components/badge";
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
import { cn } from "@repo/ui/lib/utils";

import { FieldError } from "@/components/auth/field-error";
import {
  WING_FLOOR_NAME_MAX,
  WING_UNIT_NAME_MAX,
  wingLayout,
  type FloorKind,
  type WingType,
} from "@/src/projects/domain/wing-generator";

import { NameDialog } from "./name-dialog";
import {
  addNamedFloor,
  addUnit,
  defaultFloorIndex,
  editorTotals,
  floorNameFree,
  removeFloor,
  removeUnit,
  renameFloor,
  renameUnit,
  unitNameFree,
  type EditorFloor,
  type EditorUnit,
} from "./wing-editor-state";

const KIND_LABELS: Partial<Record<FloorKind, string>> = {
  terrace: "Terrace",
  basement: "Basement",
  other: "Named floor",
};

/** Which row Save refused, to outline it. */
export type EditorProblem = { floorIndex?: number; unitIndex?: number };

type Editing =
  | { kind: "floor"; floor: EditorFloor }
  | { kind: "unit"; floor: EditorFloor; unit: EditorUnit }
  | { kind: "add-floor" }
  | null;

function AddFloorDialog({
  floors,
  onAdd,
  onClose,
}: {
  floors: readonly EditorFloor[];
  onAdd: (name: string, index: number) => void;
  onClose: () => void;
}) {
  const positions = [
    ...floors.map((floor, index) => ({
      value: String(index),
      label: `Above ${floor.name}`,
    })),
    { value: String(floors.length), label: "At the bottom" },
  ];
  const schema = z.object({
    name: z
      .string()
      .trim()
      .min(1, "Enter the floor name")
      .max(
        WING_FLOOR_NAME_MAX,
        `Use at most ${String(WING_FLOOR_NAME_MAX)} characters`,
      )
      .refine((name) => floorNameFree(floors, name), {
        message: "A floor already has this name",
      }),
    position: z.string(),
  });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", position: String(defaultFloorIndex(floors)) },
  });
  const errors = form.formState.errors;
  const submit = form.handleSubmit(({ name, position }) => {
    onAdd(name, Number(position));
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="space-y-5"
          onSubmit={(event) => {
            // Rendered inside Edit Wing's form: keep the submit to this one.
            event.stopPropagation();
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>Add floor</DialogTitle>
            <DialogDescription>
              A stilt, podium or mezzanine floor. Add its units after.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="add-floor-name">Floor name</Label>
            <Input
              id="add-floor-name"
              className="h-10"
              autoComplete="off"
              placeholder="Stilt Floor"
              aria-invalid={errors.name != null}
              {...form.register("name")}
            />
            <FieldError message={errors.name?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-floor-position">Where</Label>
            <Controller
              control={form.control}
              name="position"
              render={({ field }) => (
                <Select
                  items={positions}
                  value={field.value}
                  onValueChange={(value) => {
                    if (value != null) field.onChange(value);
                  }}
                >
                  <SelectTrigger
                    id="add-floor-position"
                    ref={field.ref}
                    size="lg"
                    className="w-full min-w-0"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    align="start"
                    alignItemWithTrigger={false}
                    aria-label="Positions"
                  >
                    {positions.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Add floor</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UnitChip({
  unit,
  invalid,
  onRename,
  onRemove,
}: {
  unit: EditorUnit;
  invalid: boolean;
  onRename: () => void;
  onRemove: () => void;
}) {
  return (
    <li
      className={cn(
        "bg-card inline-flex h-8 max-w-full items-center rounded-lg border",
        invalid && "border-destructive ring-destructive/20 ring-3",
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onRename}
        aria-label={`Rename unit ${unit.name}`}
        className="h-full min-w-0 justify-start truncate rounded-r-none px-2.5 text-sm tabular-nums"
      >
        {unit.name}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Remove unit ${unit.name}`}
        className="text-muted-foreground hover:text-destructive mr-0.5"
        onClick={onRemove}
      >
        <X />
      </Button>
    </li>
  );
}

/**
 * The floor and unit editor (CM-402): floors top to bottom, each with its
 * units as chips. Rename a floor; rename, remove or "+ Add" a unit; add a
 * named floor at a position. A scheme shows only its one row of plots or
 * bungalows. Changes stay on screen until the screen saves them.
 */
export function WingEditor({
  type,
  floors,
  onChange,
  problem,
}: {
  type: WingType;
  floors: readonly EditorFloor[];
  onChange: (floors: EditorFloor[]) => void;
  problem?: EditorProblem | null;
}) {
  const [editing, setEditing] = useState<Editing>(null);
  const scheme = wingLayout(type) === "scheme";
  const close = () => {
    setEditing(null);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium tabular-nums" aria-live="polite">
        {editorTotals(type, floors)}
      </p>
      <ol aria-label="Floors" className="space-y-3">
        {floors.map((floor, floorIndex) => {
          const floorInvalid =
            problem?.floorIndex === floorIndex && problem.unitIndex == null;
          const kindLabel = KIND_LABELS[floor.kind];
          return (
            <li
              key={floor.key}
              aria-label={scheme ? undefined : floor.name}
              className={cn(
                "bg-muted/30 space-y-3 rounded-xl border p-3 sm:p-4",
                floorInvalid && "border-destructive",
              )}
            >
              {scheme ? null : (
                <div className="flex min-w-0 items-center gap-2">
                  <h3 className="min-w-0 truncate text-sm font-semibold">
                    {floor.name}
                  </h3>
                  {kindLabel == null ? null : (
                    <Badge variant="outline">{kindLabel}</Badge>
                  )}
                  <span className="text-muted-foreground ml-auto shrink-0 text-xs tabular-nums">
                    {floor.units.length === 1
                      ? "1 unit"
                      : `${String(floor.units.length)} units`}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Rename ${floor.name}`}
                    onClick={() => {
                      setEditing({ kind: "floor", floor });
                    }}
                  >
                    <Pencil />
                  </Button>
                  {floor.kind === "other" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${floor.name}`}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        onChange(removeFloor(floors, floor.key));
                      }}
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </div>
              )}
              <ul
                aria-label={`Units on ${floor.name}`}
                className="flex flex-wrap gap-2"
              >
                {floor.units.map((unit, unitIndex) => (
                  <UnitChip
                    key={unit.key}
                    unit={unit}
                    invalid={
                      problem?.floorIndex === floorIndex &&
                      problem.unitIndex === unitIndex
                    }
                    onRename={() => {
                      setEditing({ kind: "unit", floor, unit });
                    }}
                    onRemove={() => {
                      onChange(removeUnit(floors, unit.key));
                    }}
                  />
                ))}
                <li>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 border-dashed"
                    aria-label={`Add a unit to ${floor.name}`}
                    onClick={() => {
                      onChange(addUnit(floors, floor.key));
                    }}
                  >
                    <Plus aria-hidden="true" />
                    Add
                  </Button>
                </li>
              </ul>
            </li>
          );
        })}
      </ol>
      {scheme ? null : (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setEditing({ kind: "add-floor" });
          }}
        >
          <Plus aria-hidden="true" />
          Add floor
        </Button>
      )}

      {editing?.kind === "floor" ? (
        <NameDialog
          title={`Rename ${editing.floor.name}`}
          label="Floor name"
          initial={editing.floor.name}
          max={WING_FLOOR_NAME_MAX}
          check={(name) =>
            floorNameFree(floors, name, editing.floor.key)
              ? null
              : "A floor already has this name"
          }
          onSave={(name) => {
            onChange(renameFloor(floors, editing.floor.key, name));
            close();
          }}
          onClose={close}
        />
      ) : null}
      {editing?.kind === "unit" ? (
        <NameDialog
          title={`Rename unit ${editing.unit.name}`}
          description={
            scheme
              ? undefined
              : `On ${editing.floor.name}. Unit names are unique in the Wing.`
          }
          label="Unit name"
          initial={editing.unit.name}
          max={WING_UNIT_NAME_MAX}
          check={(name) =>
            unitNameFree(floors, name, editing.unit.key)
              ? null
              : "Another unit in this Wing has this name"
          }
          onSave={(name) => {
            onChange(renameUnit(floors, editing.unit.key, name));
            close();
          }}
          onClose={close}
        />
      ) : null}
      {editing?.kind === "add-floor" ? (
        <AddFloorDialog
          floors={floors}
          onAdd={(name, index) => {
            onChange(addNamedFloor(floors, name, index));
            close();
          }}
          onClose={close}
        />
      ) : null}
    </div>
  );
}
