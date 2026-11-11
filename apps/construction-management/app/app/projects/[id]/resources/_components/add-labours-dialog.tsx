"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Suspense, useDeferredValue, useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@repo/ui/components/input-group";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  projectLabourOptionsQuery,
  useAddProjectLabours,
  type ProjectLabourOption,
} from "@/src/queries/project-resources";

import { ResourcePickerSkeleton } from "./resources-skeletons";
import { labourDetail } from "./labour-lines";

const schema = z.object({
  from: z.string().min(1, "Enter the date they start on this Project"),
  remark: z.string().trim().max(500, "Use at most 500 characters"),
});

type Values = z.infer<typeof schema>;

const SERVER_FIELDS: Record<string, keyof Values> = {
  FROM_DATE_INVALID: "from",
  FROM_BEFORE_JOINING_DATE: "from",
  TRANSFER_BEFORE_LAST_TRANSFER: "from",
  REMARK_TOO_LONG: "remark",
};

function Choices({
  projectId,
  search,
  chosen,
  onToggle,
}: {
  projectId: string;
  search: string;
  chosen: ReadonlyMap<string, ProjectLabourOption>;
  onToggle: (item: ProjectLabourOption, checked: boolean) => void;
}) {
  const { data } = useSuspenseQuery(
    projectLabourOptionsQuery(projectId, search),
  );
  return (
    <>
      <ul
        aria-label="Labours not on this Project"
        className="bg-card -mx-1 max-h-64 divide-y overflow-y-auto rounded-lg border"
      >
        {data.items.map((item) => {
          const id = `add-labour-${item.id}`;
          const detail = labourDetail(item);
          return (
            <li key={item.id}>
              <label
                htmlFor={id}
                className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 px-3 py-2.5"
              >
                <Checkbox
                  id={id}
                  checked={chosen.has(item.id)}
                  onCheckedChange={(checked) => {
                    onToggle(item, checked);
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {item.name}
                  </span>
                  {detail != null && (
                    <span className="text-muted-foreground block truncate text-xs">
                      {detail}
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
        {data.items.length === 0 && (
          <li className="text-muted-foreground px-3 py-6 text-center text-sm">
            {search.trim() === ""
              ? "Every active Labour is on this Project already."
              : `No Labours match “${search.trim()}”.`}
          </li>
        )}
      </ul>
      {data.hasMore && (
        <p className="text-muted-foreground text-xs">
          Showing the first {data.items.length}. Search by name, Labour Id or
          phone to find others.
        </p>
      )}
    </>
  );
}

/**
 * Add Labours to a Project (ADR CM-0038 §2): tick active Labours not on
 * it (search by name, Labour Id or phone; ticks survive a new search),
 * choose the From date (the Company's today unless changed) and an
 * optional remark, and save them together. All or none: a refusal names
 * the Labour, and a date problem shows on the From field.
 */
export function AddLaboursDialog({
  projectId,
  today,
  open,
  onOpenChange,
}: {
  projectId: string;
  /** The Company's today, `YYYY-MM-DD`. */
  today: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const id = useId();
  const add = useAddProjectLabours(projectId);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [chosen, setChosen] = useState<
    ReadonlyMap<string, ProjectLabourOption>
  >(() => new Map());
  const [pickError, setPickError] = useState<string | undefined>();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { from: today, remark: "" },
  });
  const errors = form.formState.errors;

  const close = () => {
    form.reset({ from: today, remark: "" });
    setSearch("");
    setChosen(new Map());
    setPickError(undefined);
    add.reset();
    onOpenChange(false);
  };

  const submit = form.handleSubmit(async (values) => {
    if (chosen.size === 0) {
      setPickError("Tick at least one Labour.");
      return;
    }
    try {
      await add.mutateAsync({
        labourIds: [...chosen.keys()],
        from: values.from,
        remark: values.remark === "" ? null : values.remark,
      });
      close();
    } catch (error) {
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
      form.setError(field ?? "root", { message });
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else close();
      }}
    >
      <DialogContent className="grid-cols-1 sm:max-w-lg">
        <form
          noValidate
          className="flex min-w-0 flex-col gap-4"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>Add Labours</DialogTitle>
            <DialogDescription>
              From the date you choose they are on this Project and its
              attendance sheet. Their other Projects stay.
            </DialogDescription>
          </DialogHeader>
          <fieldset className="min-w-0 space-y-2">
            <legend className="sr-only">Labours</legend>
            <InputGroup>
              <InputGroupAddon>
                <Search aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                aria-label="Search Labours"
                placeholder="Search name, Labour Id or phone"
                value={search}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.preventDefault();
                }}
                onChange={(event) => {
                  setSearch(event.target.value);
                }}
              />
            </InputGroup>
            {open && (
              <Suspense fallback={<ResourcePickerSkeleton label="Labours" />}>
                <Choices
                  projectId={projectId}
                  search={deferredSearch}
                  chosen={chosen}
                  onToggle={(item, checked) => {
                    setPickError(undefined);
                    setChosen((was) => {
                      const next = new Map(was);
                      if (checked) next.set(item.id, item);
                      else next.delete(item.id);
                      return next;
                    });
                  }}
                />
              </Suspense>
            )}
            <p className="text-muted-foreground text-sm" aria-live="polite">
              {chosen.size} selected
            </p>
            <FieldError message={pickError} />
          </fieldset>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor={`${id}-from`} required>
                From
              </Label>
              <Input
                id={`${id}-from`}
                type="date"
                className="h-10"
                aria-required
                aria-invalid={errors.from != null}
                aria-describedby={`${id}-from-hint`}
                {...form.register("from")}
              />
              <p
                id={`${id}-from-hint`}
                className="text-muted-foreground text-xs"
              >
                Their first day on this Project.
              </p>
              <FieldError message={errors.from?.message} />
            </div>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={`${id}-remark`}>Remark (optional)</Label>
            <Textarea
              id={`${id}-remark`}
              rows={2}
              maxLength={500}
              aria-invalid={errors.remark != null}
              {...form.register("remark")}
            />
            <FieldError message={errors.remark?.message} />
          </div>
          <FormAlert message={errors.root?.message} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={add.isPending}>
              {add.isPending
                ? "Adding…"
                : chosen.size > 1
                  ? `Add ${String(chosen.size)} Labours`
                  : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
