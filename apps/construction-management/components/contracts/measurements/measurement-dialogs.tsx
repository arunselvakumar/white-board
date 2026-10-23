"use client";

import { useId, useState } from "react";
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

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";

export { ReasonDialog } from "../work-orders/work-order-dialogs";

export type JointMeasurementValues = {
  partyName: string;
  partyRole: string;
  jointOn: string;
};

type Problems = Partial<Record<keyof JointMeasurementValues, string>>;

/** The browser's checks; the server checks again (and the date's order). */
function problemsOf(
  values: JointMeasurementValues,
  measuredOn: string,
  today: string,
): Problems {
  const problems: Problems = {};
  if (values.partyName.trim() === "")
    problems.partyName = "Enter the other party's name.";
  else if (values.partyName.trim().length > 120)
    problems.partyName = "The name is at most 120 characters.";
  if (values.partyRole.trim() === "") problems.partyRole = "Enter their role.";
  else if (values.partyRole.trim().length > 80)
    problems.partyRole = "The role is at most 80 characters.";
  if (values.jointOn === "")
    problems.jointOn = "Enter the date of the joint measurement.";
  else if (values.jointOn > today)
    problems.jointOn = "The joint measurement date cannot be in the future.";
  else if (values.jointOn < measuredOn)
    problems.jointOn =
      "The joint measurement is on or after the date measured.";
  return problems;
}

/**
 * Check a submitted sheet: the joint measurement (JMR, CM-0023 §6). The
 * viewer is recorded as our engineer; the dialog asks for the other
 * party's name and role and the date they measured together.
 */
export function CheckMeasurementDialog({
  side,
  partyLabel,
  measuredOn,
  today,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  side: "client" | "contractor";
  partyLabel: string | null;
  measuredOn: string;
  today: string;
  pending: boolean;
  error: string | undefined;
  onConfirm: (values: JointMeasurementValues) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [values, setValues] = useState<JointMeasurementValues>({
    partyName: "",
    partyRole: "",
    jointOn: today,
  });
  const [problems, setProblems] = useState<Problems>({});
  const set = (name: keyof JointMeasurementValues) => (value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
  };
  const party =
    partyLabel ?? (side === "client" ? "the Client" : "the Contractor");
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="grid-cols-1 sm:max-w-md">
        <form
          noValidate
          className="flex min-w-0 flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            const found = problemsOf(values, measuredOn, today);
            setProblems(found);
            if (Object.keys(found).length === 0)
              onConfirm({
                partyName: values.partyName.trim(),
                partyRole: values.partyRole.trim(),
                jointOn: values.jointOn,
              });
          }}
        >
          <DialogHeader>
            <DialogTitle>Check this sheet</DialogTitle>
            <DialogDescription>
              {`Record the joint measurement with ${party}. You are recorded as our engineer. Once checked, its rows count as measured${side === "client" ? " and lock their BOQ items' quantity and rate" : ""}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-party-name`} required>
              Their name
            </Label>
            <Input
              id={`${id}-party-name`}
              value={values.partyName}
              aria-required
              aria-invalid={problems.partyName != null}
              onChange={(event) => {
                set("partyName")(event.target.value);
              }}
            />
            <FieldError message={problems.partyName} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-party-role`} required>
              Their role
            </Label>
            <Input
              id={`${id}-party-role`}
              placeholder={
                side === "client"
                  ? "Client's engineer"
                  : "Contractor's supervisor"
              }
              value={values.partyRole}
              aria-required
              aria-invalid={problems.partyRole != null}
              onChange={(event) => {
                set("partyRole")(event.target.value);
              }}
            />
            <FieldError message={problems.partyRole} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-joint-on`} required>
              Joint measurement date
            </Label>
            <Input
              id={`${id}-joint-on`}
              type="date"
              min={measuredOn}
              max={today}
              value={values.jointOn}
              aria-required
              aria-invalid={problems.jointOn != null}
              onChange={(event) => {
                set("jointOn")(event.target.value);
              }}
            />
            <FieldError message={problems.jointOn} />
          </div>
          <FormAlert message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Back
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Checking…" : "Check sheet"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
