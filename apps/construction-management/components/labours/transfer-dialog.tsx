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

export type TransferTarget = {
  id: string;
  name: string;
  currentProject: { id: string; name: string };
};

/** Today on this device, `YYYY-MM-DD`. */
export function localToday(now: Date = new Date()): string {
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/**
 * Transfer one or many labourers to a Project from a date (CM-206). The
 * date is their first day on the new Project.
 */
export function TransferDialog({
  labours,
  open,
  onOpenChange,
  onTransferred,
}: {
  labours: TransferTarget[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTransferred?: () => void;
}) {
  const projects = useQuery({ ...projectOptionsQuery, enabled: open });
  const command = useLabourCommand();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [date, setDate] = useState(localToday);
  const [remark, setRemark] = useState("");
  const [problem, setProblem] = useState<{
    field: "project" | "date" | null;
    message: string;
  } | null>(null);

  const single = labours.length === 1 ? labours[0] : undefined;
  const sources = new Set(labours.map((labour) => labour.currentProject.id));
  const choices = (projects.data?.items ?? [])
    // One labourer cannot move to the Project they are on.
    .filter((project) => project.id !== single?.currentProject.id)
    .map((project) => ({ value: project.id, label: project.name }));

  const reset = () => {
    setProjectId(null);
    setDate(localToday());
    setRemark("");
    setProblem(null);
  };

  const submit = async () => {
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
              ? `Now on ${single.currentProject.name}. Attendance from the transfer date is marked on the new Project; their balance moves with them.`
              : `From ${String(sources.size)} ${sources.size === 1 ? "Project" : "Projects"}. Attendance from the transfer date is marked on the new Project; balances move with them.`}
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
          <div className="space-y-1.5">
            <Label htmlFor="transfer-project">To Project</Label>
            <Select
              items={choices}
              value={projectId}
              onValueChange={(value) => {
                setProjectId(value);
              }}
            >
              <SelectTrigger
                id="transfer-project"
                size="lg"
                className="w-full min-w-0"
                aria-invalid={problem?.field === "project"}
              >
                <SelectValue
                  placeholder={
                    projects.isPending
                      ? "Loading Projects…"
                      : "Select a Project"
                  }
                />
              </SelectTrigger>
              <SelectContent
                align="start"
                alignItemWithTrigger={false}
                aria-label="Projects"
              >
                {choices.map((choice) => (
                  <SelectItem key={choice.value} value={choice.value}>
                    {choice.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError
              message={
                problem?.field === "project" ? problem.message : undefined
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="transfer-date">Transfer date</Label>
            <Input
              id="transfer-date"
              type="date"
              className="h-10"
              value={date}
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
