"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Label } from "@repo/ui/components/label";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { companyFormOptionsQuery } from "@/src/queries/marketing-companies";
import {
  teamErrorMessage,
  useReassignCompany,
} from "@/src/queries/marketing-team";

import { CompanySelect } from "./company-parts";

/** What Reassign needs of a company, from its page or a list. */
export type ReassignTarget = {
  id: string;
  name: string;
  assignedTo: { id: string; name: string } | null;
  updatedAt: string;
  /** Open Follow-ups that move with it, whoever owns them; null if unknown. */
  openFollowUps: number | null;
};

/** How many open Follow-ups go with the company (ADR CM-0040 §11). */
function followUpsMove(count: number | null): string {
  if (count == null) return "Its open Follow-ups move with it.";
  if (count === 0) return "It has no open Follow-ups.";
  if (count === 1) return "1 open Follow-up moves to the new person too.";
  return `${String(count)} open Follow-ups move to the new person too.`;
}

/**
 * Reassign (Companies transfer): the company, and every open Follow-up of
 * it, go to another active Marketing Person. Past Visits keep their
 * visitors.
 */
export function ReassignDialog({
  company,
  open,
  onOpenChange,
}: {
  company: ReassignTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid-cols-1 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="break-words">{`Reassign ${company.name}`}</DialogTitle>
          <DialogDescription>
            {`${company.assignedTo == null ? "No one is" : `${company.assignedTo.name} is`} its Marketing Person. ${followUpsMove(company.openFollowUps)} Past Visits keep their visitors.`}
          </DialogDescription>
        </DialogHeader>
        <Suspense
          fallback={<p className="text-muted-foreground text-sm">Loading…</p>}
        >
          <ReassignForm
            company={company}
            onDone={() => {
              onOpenChange(false);
            }}
          />
        </Suspense>
      </DialogContent>
    </Dialog>
  );
}

function ReassignForm({
  company,
  onDone,
}: {
  company: ReassignTarget;
  onDone: () => void;
}) {
  const { data: options } = useSuspenseQuery(companyFormOptionsQuery);
  const reassign = useReassignCompany(company.id);
  const [memberId, setMemberId] = useState("");
  const [missing, setMissing] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const people = options.people
    .filter((person) => person.active && person.id !== company.assignedTo?.id)
    .map((person) => ({ value: person.id, label: person.name }));

  return (
    <form
      noValidate
      aria-label="Reassign"
      className="flex min-w-0 flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        if (memberId === "") {
          setMissing("Choose who takes it over.");
          return;
        }
        reassign.mutate(
          { assignedMemberId: memberId, expectedUpdatedAt: company.updatedAt },
          {
            onSuccess: onDone,
            onError: (caught) => {
              setError(teamErrorMessage(caught));
            },
          },
        );
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="reassign-person" required>
          New Marketing Person
        </Label>
        <CompanySelect
          required
          id="reassign-person"
          value={memberId}
          onChange={(value) => {
            setMemberId(value);
            setMissing(undefined);
          }}
          invalid={missing != null}
          items={people}
          placeholder="Choose a person"
        />
        <FieldError message={missing} />
      </div>
      <FormAlert message={error ?? undefined} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={reassign.isPending}>
          {reassign.isPending ? "Reassigning…" : "Reassign"}
        </Button>
      </DialogFooter>
    </form>
  );
}
