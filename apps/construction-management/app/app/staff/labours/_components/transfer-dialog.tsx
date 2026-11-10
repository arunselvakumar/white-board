"use client";

import { useQuery } from "@tanstack/react-query";
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
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import { useLabourCommand } from "@/src/queries/labours";
import { projectOptionsQuery } from "@/src/queries/projects";

import { projectsLabel } from "./labour-projects";

type ProjectRef = { id: string; name: string };

export type TransferTarget = {
  id: string;
  name: string;
  projects: ProjectRef[];
};

/** Today on this device, `YYYY-MM-DD`. */
export function localToday(now: Date = new Date()): string {
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/** The Projects every one of `labours` is on: where they can all move from. */
function sharedProjects(labours: readonly TransferTarget[]): ProjectRef[] {
  const [first, ...rest] = labours;
  return (first?.projects ?? []).filter((project) =>
    rest.every((labour) => labour.projects.some((p) => p.id === project.id)),
  );
}

function SelectField({
  id,
  label,
  choices,
  value,
  onChange,
  placeholder,
  error,
}: {
  id: string;
  label: string;
  choices: { value: string; label: string }[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder: string;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} required>
        {label}
      </Label>
      <Select items={choices} value={value} onValueChange={onChange}>
        <SelectTrigger
          id={id}
          className="w-full min-w-0"
          aria-required
          aria-invalid={error != null}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent
          align="start"
          alignItemWithTrigger={false}
          aria-label={label}
        >
          {choices.map((choice) => (
            <SelectItem key={choice.value} value={choice.value}>
              {choice.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError message={error} />
    </div>
  );
}

/**
 * Transfer one or many labourers from one Project to another from a date
 * (CM-206). The date is their first day on the new Project; their other
 * Projects stay (ADR CM-0033). `fromProjectId` picks the Project they
 * leave when they share it, e.g. the list's Project filter.
 */
export function TransferDialog({
  labours,
  fromProjectId = null,
  open,
  onOpenChange,
  onTransferred,
}: {
  labours: TransferTarget[];
  fromProjectId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTransferred?: () => void;
}) {
  const projects = useQuery({ ...projectOptionsQuery, enabled: open });
  const command = useLabourCommand();
  const [chosenFrom, setChosenFrom] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [date, setDate] = useState(localToday);
  const [remark, setRemark] = useState("");
  const [problem, setProblem] = useState<{
    field: "from" | "project" | "date" | null;
    message: string;
  } | null>(null);

  const single = labours.length === 1 ? labours[0] : undefined;
  const shared = sharedProjects(labours);
  const fromChoices = shared.map((project) => ({
    value: project.id,
    label: project.name,
  }));
  // The chosen Project, else the list's filter, else the only one shared.
  const from =
    chosenFrom ??
    (shared.some((project) => project.id === fromProjectId)
      ? fromProjectId
      : shared.length === 1
        ? (shared[0]?.id ?? null)
        : null);
  // A labourer cannot move to a Project they are already on.
  const taken = new Set(
    labours.flatMap((labour) => labour.projects.map((project) => project.id)),
  );
  const choices = (projects.data?.items ?? [])
    .filter((project) => !taken.has(project.id))
    .map((project) => ({ value: project.id, label: project.name }));

  const reset = () => {
    setChosenFrom(null);
    setProjectId(null);
    setDate(localToday());
    setRemark("");
    setProblem(null);
  };

  const submit = async () => {
    if (from == null) {
      setProblem({
        field: "from",
        message:
          shared.length === 0
            ? "These Labours share no Project. Transfer them from one Project at a time."
            : "Choose the Project they move from",
      });
      return;
    }
    if (projectId == null) {
      setProblem({ field: "project", message: "Choose the Project" });
      return;
    }
    if (date === "") {
      setProblem({ field: "date", message: "Enter the transfer date" });
      return;
    }
    setProblem(null);
    try {
      await command.mutateAsync({
        kind: "transfer",
        labourIds: labours.map((labour) => labour.id),
        fromProjectId: from,
        toProjectId: projectId,
        transferDate: date,
        remark: remark.trim() === "" ? null : remark.trim(),
      });
      reset();
      onOpenChange(false);
      onTransferred?.();
    } catch (error) {
      const { field, message } = fieldForCode(error, {
        TRANSFER_DATE_INVALID: "date",
        TRANSFER_BEFORE_ATTENDANCE: "date",
        TRANSFER_BEFORE_LAST_TRANSFER: "date",
        TRANSFER_SAME_PROJECT: "project",
        PROJECT_NOT_FOUND: "project",
        LABOUR_NOT_ON_PROJECT: "from",
        TRANSFER_FROM_PROJECT_REQUIRED: "from",
      } as const);
      setProblem({ field, message });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {single != null
              ? `Transfer ${single.name}`
              : `Transfer ${String(labours.length)} Labours`}
          </DialogTitle>
          <DialogDescription>
            {single != null
              ? `Now on ${projectsLabel(single.projects)}. Attendance from the transfer date is marked on the new Project; their balance moves with them and their other Projects stay.`
              : "Attendance from the transfer date is marked on the new Project; balances move with them and their other Projects stay."}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <SelectField
            id="transfer-from"
            label="From Project"
            choices={fromChoices}
            value={from}
            onChange={setChosenFrom}
            placeholder={
              shared.length === 0 ? "No shared Project" : "Select a Project"
            }
            error={problem?.field === "from" ? problem.message : undefined}
          />
          <SelectField
            id="transfer-project"
            label="To Project"
            choices={choices}
            value={projectId}
            onChange={setProjectId}
            placeholder={
              projects.isPending ? "Loading Projects…" : "Select a Project"
            }
            error={problem?.field === "project" ? problem.message : undefined}
          />
          <div className="space-y-1.5">
            <Label htmlFor="transfer-date" required>
              Transfer date
            </Label>
            <Input
              id="transfer-date"
              type="date"
              className="h-10"
              value={date}
              aria-required
              aria-invalid={problem?.field === "date"}
              onChange={(event) => {
                setDate(event.target.value);
              }}
            />
            <FieldError
              message={problem?.field === "date" ? problem.message : undefined}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="transfer-remark">Remark</Label>
            <Textarea
              id="transfer-remark"
              rows={2}
              maxLength={500}
              value={remark}
              onChange={(event) => {
                setRemark(event.target.value);
              }}
            />
          </div>
          <FormAlert
            message={problem?.field == null ? problem?.message : undefined}
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
              {command.isPending ? "Transferring…" : "Transfer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
