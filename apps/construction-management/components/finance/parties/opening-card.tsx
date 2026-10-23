"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
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
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import {
  isRupees,
  MoneyInput,
  paiseToRupees,
  rupeesToPaise,
} from "@/components/money/money-input";
import { fieldForCode } from "@/lib/server-errors";
import { canInFinance, financeAccessQuery } from "@/src/queries/finance-access";
import {
  partyOpeningsQuery,
  useRemoveOpening,
  useSetOpening,
  type PartyOpening,
  type PartyType,
} from "@/src/queries/finance-parties";

import { formatDate, money } from "./party-money";

/**
 * A party's opening balance on the Project (CM-0017 §7): what was owed to
 * them (or advanced to them) before the app, as of a date. Set, change or
 * remove; each change reverses the old entry and posts the new one.
 */
export function OpeningCard({
  projectId,
  partyType,
  partyId,
}: {
  projectId: string;
  partyType: PartyType;
  partyId: string;
}) {
  const { data } = useSuspenseQuery(partyOpeningsQuery(projectId, partyType));
  const access = useQuery(financeAccessQuery(projectId)).data;
  const can = (flag: "create" | "update" | "delete") =>
    access != null && canInFinance(access, "finance.parties", flag);
  const opening = data.items.find((item) => item.party.id === partyId) ?? null;
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  return (
    <section
      aria-labelledby="opening-balance"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
    >
      <div className="min-w-0">
        <h2 id="opening-balance" className="text-sm font-semibold">
          Opening balance
        </h2>
        <p className="text-muted-foreground text-sm">
          {opening == null
            ? "None"
            : `${money(Math.abs(opening.amount))} ${opening.amount > 0 ? "owed to the party" : "advance with the party"} as of ${formatDate(opening.asOfDate)}`}
        </p>
      </div>
      <div className="flex gap-2">
        {(opening == null ? can("create") : can("update")) && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditing(true);
            }}
          >
            {opening == null ? "Set opening" : "Change"}
          </Button>
        )}
        {opening != null && can("delete") && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setRemoving(true);
            }}
          >
            Remove
          </Button>
        )}
      </div>
      <OpeningDialog
        open={editing}
        projectId={projectId}
        partyType={partyType}
        partyId={partyId}
        opening={opening}
        onOpenChange={setEditing}
      />
      <RemoveOpeningDialog
        opening={removing ? opening : null}
        onOpenChange={setRemoving}
      />
    </section>
  );
}

function OpeningDialog({
  open,
  projectId,
  partyType,
  partyId,
  opening,
  onOpenChange,
}: {
  open: boolean;
  projectId: string;
  partyType: PartyType;
  partyId: string;
  opening: PartyOpening | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Opening balance</DialogTitle>
          <DialogDescription>
            The balance on this Project before you started using the app.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <OpeningForm
            projectId={projectId}
            partyType={partyType}
            partyId={partyId}
            opening={opening}
            onDone={() => {
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function OpeningForm({
  projectId,
  partyType,
  partyId,
  opening,
  onDone,
}: {
  projectId: string;
  partyType: PartyType;
  partyId: string;
  opening: PartyOpening | null;
  onDone: () => void;
}) {
  const set = useSetOpening();
  const [side, setSide] = useState<"owed" | "advance">(
    opening != null && opening.amount < 0 ? "advance" : "owed",
  );
  const [asOfDate, setAsOfDate] = useState(opening?.asOfDate ?? "");
  const [amount, setAmount] = useState(
    opening == null ? "" : paiseToRupees(Math.abs(opening.amount)),
  );
  const [errors, setErrors] = useState<{ asOfDate?: string; amount?: string }>(
    {},
  );
  const [problem, setProblem] = useState<string | undefined>();
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const paise = isRupees(amount) ? (rupeesToPaise(amount) ?? 0) : 0;
        const next = {
          asOfDate: asOfDate === "" ? "Choose the date" : undefined,
          amount: paise <= 0 ? "Enter the amount" : undefined,
        };
        setErrors(next);
        setProblem(undefined);
        if (next.asOfDate != null || next.amount != null) return;
        set
          .mutateAsync({
            partyType,
            partyId,
            projectId,
            asOfDate,
            amount: side === "owed" ? paise : -paise,
            expectedUpdatedAt: opening?.updatedAt ?? null,
          })
          .then(onDone, (failure: unknown) => {
            setProblem(fieldForCode(failure, {}).message);
          });
      }}
    >
      <ToggleGroup
        aria-label="Who owes whom"
        value={[side]}
        onValueChange={(value: string[]) => {
          const next = value[0];
          if (next === "owed" || next === "advance") setSide(next);
        }}
        variant="outline"
        className="w-full"
      >
        <ToggleGroupItem value="owed" className="flex-1">
          Owed to the party
        </ToggleGroupItem>
        <ToggleGroupItem value="advance" className="flex-1">
          Advance with the party
        </ToggleGroupItem>
      </ToggleGroup>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="opening-date" required>
            As of
          </Label>
          <Input
            id="opening-date"
            type="date"
            className="h-10"
            value={asOfDate}
            aria-required
            aria-invalid={errors.asOfDate != null}
            onChange={(event) => {
              setAsOfDate(event.target.value);
            }}
          />
          <FieldError message={errors.asOfDate} />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="opening-amount" required>
            Amount
          </Label>
          <MoneyInput
            id="opening-amount"
            className="h-10"
            value={amount}
            aria-required
            aria-invalid={errors.amount != null}
            onChange={(event) => {
              setAmount(event.target.value);
            }}
          />
          <FieldError message={errors.amount} />
        </div>
      </div>
      <FormAlert message={problem} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={set.isPending}>
          {set.isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function RemoveOpeningDialog({
  opening,
  onOpenChange,
}: {
  opening: PartyOpening | null;
  onOpenChange: (open: boolean) => void;
}) {
  const remove = useRemoveOpening();
  const [problem, setProblem] = useState<string | undefined>();
  return (
    <AlertDialog open={opening != null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove the opening balance?</AlertDialogTitle>
          <AlertDialogDescription>
            The balance leaves the party&apos;s statement on this Project.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FormAlert message={problem} />
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => {
              if (opening == null) return;
              remove
                .mutateAsync({
                  id: opening.id,
                  expectedUpdatedAt: opening.updatedAt,
                })
                .then(
                  () => {
                    onOpenChange(false);
                  },
                  (failure: unknown) => {
                    setProblem(fieldForCode(failure, {}).message);
                  },
                );
            }}
          >
            Remove
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
