"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link2, TrendingUp, XIcon } from "lucide-react";
import { useState } from "react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@repo/ui/components/combobox";
import {
  InputGroupAddon,
  InputGroupButton,
} from "@repo/ui/components/input-group";
import Link from "next/link";
import { Label } from "@repo/ui/components/label";

import { FieldError } from "@/components/auth/field-error";
import { trackingRecordPath } from "@/lib/tracking-paths";
import {
  worksheetTaskOptionsQuery,
  type Worksheet,
  type WorksheetTaskOption,
} from "@/src/queries/worksheets";

/** The sheet's Task as the form holds it (CM-806). */
export type WorksheetTaskChoice = Pick<
  WorksheetTaskOption,
  "id" | "taskNo" | "name" | "unitId" | "unitName"
>;

/** "T-7 First floor slab". */
export function taskChoiceLabel(
  task: Pick<WorksheetTaskChoice, "taskNo" | "name">,
) {
  return `T-${String(task.taskNo)} ${task.name}`;
}

/**
 * What saving the sheet does with its task (ADR CM-0019 §6): posts the
 * Approx Work Done when it is in the task's unit, else only links it and
 * says why.
 */
export function taskHint(
  task: Pick<WorksheetTaskChoice, "taskNo" | "unitId" | "unitName">,
  work: { quantity: string; unitId: string },
): { posts: boolean; text: string } {
  const label = `T-${String(task.taskNo)}`;
  if (task.unitId == null)
    return { posts: false, text: "Linked only — the task tracks percent" };
  const quantity = work.quantity.trim();
  if (quantity === "" || work.unitId === "")
    return {
      posts: false,
      text: `Linked only — enter Approx Work Done in ${task.unitName ?? "the task's unit"} to add to ${label}'s progress`,
    };
  if (work.unitId !== task.unitId)
    return {
      posts: false,
      text: `Linked only — the unit differs from the task's (${task.unitName ?? "another unit"})`,
    };
  return {
    posts: true,
    text: `Will add ${quantity} ${task.unitName ?? ""} to ${label}'s progress`.replace(
      "  ",
      " ",
    ),
  };
}

/**
 * The Daily Worksheet's optional **Task** (CM-806): live leaf tasks of the
 * Project, searched by Task No. or name. Under it, whether the sheet will
 * post progress or is only linked, and why.
 */
export function WorksheetTaskPicker({
  id,
  projectId,
  value,
  onChange,
  work,
  error,
  disabled = false,
}: {
  id: string;
  projectId: string;
  value: WorksheetTaskChoice | null;
  onChange: (task: WorksheetTaskChoice | null) => void;
  /** The sheet's Approx Work Done, for the hint. */
  work: { quantity: string; unitId: string };
  error?: string;
  disabled?: boolean;
}) {
  const valueLabel = value == null ? "" : taskChoiceLabel(value);
  const [search, setSearch] = useState(valueLabel);
  // A value set from outside (a reset) shows its label.
  const [shownFor, setShownFor] = useState(valueLabel);
  if (shownFor !== valueLabel) {
    setShownFor(valueLabel);
    setSearch(valueLabel);
  }
  const typed =
    value != null && search === taskChoiceLabel(value) ? "" : search;
  const { data } = useQuery({
    ...worksheetTaskOptionsQuery(projectId, typed),
    placeholderData: keepPreviousData,
  });
  const found: WorksheetTaskChoice[] = data?.items ?? [];
  const items =
    value != null && !found.some((item) => item.id === value.id)
      ? [value, ...found]
      : found;
  const hint = value == null ? null : taskHint(value, work);
  const hintId = `${id}-hint`;

  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>Task</Label>
      <Combobox
        items={items}
        value={value}
        disabled={disabled}
        inputValue={search}
        onInputValueChange={(next: string) => {
          setSearch(next);
        }}
        filter={null}
        itemToStringLabel={(item: WorksheetTaskChoice) => taskChoiceLabel(item)}
        isItemEqualToValue={(a: WorksheetTaskChoice, b: WorksheetTaskChoice) =>
          a.id === b.id
        }
        onValueChange={(next: WorksheetTaskChoice | null) => {
          setSearch(next == null ? "" : taskChoiceLabel(next));
          onChange(next);
        }}
      >
        <ComboboxInput
          id={id}
          placeholder="Search by T-number or name"
          autoComplete="off"
          aria-invalid={error != null}
          aria-describedby={hint == null ? undefined : hintId}
          showTrigger={false}
          className="w-full min-w-0"
        >
          {/* The kit's own trigger and clear have no names; these do. */}
          <InputGroupAddon align="inline-end">
            {value != null && !disabled ? (
              <InputGroupButton
                size="icon-xs"
                variant="ghost"
                aria-label="Clear task"
                onClick={() => {
                  setSearch("");
                  onChange(null);
                }}
              >
                <XIcon className="pointer-events-none" />
              </InputGroupButton>
            ) : (
              <InputGroupButton
                size="icon-xs"
                variant="ghost"
                render={<ComboboxTrigger />}
                aria-label="Show tasks"
                disabled={disabled}
                className="data-pressed:bg-transparent"
              />
            )}
          </InputGroupAddon>
        </ComboboxInput>
        <ComboboxContent>
          <ComboboxEmpty>No tasks found.</ComboboxEmpty>
          <ComboboxList aria-label="Tasks">
            {(item: WorksheetTaskChoice) => (
              <ComboboxItem key={item.id} value={item}>
                <span className="text-muted-foreground mr-1 text-xs tabular-nums">
                  T-{item.taskNo}
                </span>
                {item.name}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {hint != null && (
        <p
          id={hintId}
          className={
            hint.posts
              ? "flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400"
              : "text-muted-foreground flex items-center gap-1.5 text-xs"
          }
        >
          {hint.posts ? (
            <TrendingUp aria-hidden="true" className="size-3.5 shrink-0" />
          ) : (
            <Link2 aria-hidden="true" className="size-3.5 shrink-0" />
          )}
          {hint.text}
        </p>
      )}
      <FieldError message={error} />
    </div>
  );
}

const POSTING_TEXT: Record<
  NonNullable<NonNullable<Worksheet["task"]>["posting"]>,
  string
> = {
  quantity: "adds to its progress",
  linked_unit: "linked only, another unit",
  linked_percent: "linked only, the task tracks percent",
  linked_no_quantity: "linked only, no work done entered",
};

/** The sheet's Task as a link to its page, with whether it posts progress. */
export function WorksheetTaskLink({
  projectId,
  task,
  detail = false,
}: {
  projectId: string;
  task: NonNullable<Worksheet["task"]>;
  /** Say what the sheet does with it. */
  detail?: boolean;
}) {
  if (task.taskNo == null || task.name == null)
    return <span className="text-muted-foreground">Task not available</span>;
  return (
    <span>
      <Link
        href={trackingRecordPath(projectId, "task", task.id)}
        className="hover:underline"
      >
        T-{task.taskNo} {task.name}
      </Link>
      {detail && task.posting != null && (
        <span className="text-muted-foreground">
          {" "}
          · {POSTING_TEXT[task.posting]}
        </span>
      )}
    </span>
  );
}
