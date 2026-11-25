"use client";

import { TriangleAlert, UserRound } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/sheet";
import { Textarea } from "@repo/ui/components/textarea";
import { useIsMobile } from "@repo/ui/hooks/use-mobile";
import { cn } from "@repo/ui/lib/utils";

import { formatClockTime } from "@/app/(app)/preschool/_components/preschool-format";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { PersonAvatar } from "@/app/(app)/preschool/_components/person-avatar";
import { isClockTime } from "@/src/preschool/domain/attendance";
import type {
  PreschoolAttendanceRosterChild,
  PreschoolCheckOutInput,
} from "@/src/queries/preschool/attendance";

import { attendanceErrorMessage } from "./attendance-errors";

type Collector =
  | { kind: "father" | "mother" }
  | { kind: "authorised_pickup"; pickupId: string }
  | { kind: "other" };

function sameCollector(a: Collector | null, b: Collector): boolean {
  if (a?.kind !== b.kind) return false;
  return (
    a.kind !== "authorised_pickup" ||
    (b.kind === "authorised_pickup" && a.pickupId === b.pickupId)
  );
}

function Option({
  selected,
  onSelect,
  leading,
  title,
  detail,
}: {
  selected: boolean;
  onSelect: () => void;
  leading: ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "h-auto min-h-14 w-full justify-start gap-3 rounded-xl p-3 text-left font-normal whitespace-normal",
        selected
          ? "border-primary bg-primary/5 hover:bg-primary/5"
          : "hover:border-primary/60",
      )}
    >
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        <span className="text-muted-foreground block truncate text-xs">
          {detail}
        </span>
      </span>
    </Button>
  );
}

function CheckOutForm({
  child,
  isToday,
  nowTime,
  checkInTime,
  onSubmit,
  onCancel,
}: {
  child: PreschoolAttendanceRosterChild;
  isToday: boolean;
  nowTime: string;
  checkInTime: string | null;
  onSubmit: (
    input: Omit<PreschoolCheckOutInput, "childId" | "date">,
  ) => Promise<void>;
  onCancel: () => void;
}) {
  const [collector, setCollector] = useState<Collector | null>(null);
  const [time, setTime] = useState(isToday ? nowTime : "");
  const [otherName, setOtherName] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const firstName = child.name.split(" ")[0] ?? child.name;

  const options: {
    collector: Collector;
    title: string;
    detail: string;
    leading: ReactNode;
  }[] = [];
  const parentIcon = (
    <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-full">
      <UserRound aria-hidden="true" className="size-5" />
    </span>
  );
  if (child.father.name != null)
    options.push({
      collector: { kind: "father" },
      title: child.father.name,
      detail: "Father",
      leading: parentIcon,
    });
  if (child.mother.name != null)
    options.push({
      collector: { kind: "mother" },
      title: child.mother.name,
      detail: "Mother",
      leading: parentIcon,
    });
  for (const pickup of child.authorisedPickups)
    options.push({
      collector: { kind: "authorised_pickup", pickupId: pickup.id },
      title: pickup.name,
      detail: pickup.relationship,
      leading: (
        <PersonAvatar
          id={pickup.id}
          name={pickup.name}
          photoUrl={pickup.photoUrl}
        />
      ),
    });

  const submit = async () => {
    const next: Record<string, string> = {};
    if (collector == null)
      next["collector"] = `Choose who is collecting ${firstName}.`;
    if (!isClockTime(time)) next["time"] = "Enter the time.";
    else if (checkInTime != null && time < checkInTime)
      next["time"] =
        `${firstName} was checked in at ${formatClockTime(checkInTime)}.`;
    if (collector?.kind === "other") {
      if (otherName.trim() === "") next["otherName"] = "Enter their name.";
      if (note.trim() === "")
        next["note"] = "Write who they are and who confirmed it.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0 || collector == null) return;
    setSubmitting(true);
    try {
      await onSubmit({
        time,
        collectedByKind: collector.kind,
        pickupId:
          collector.kind === "authorised_pickup" ? collector.pickupId : null,
        collectedByName: collector.kind === "other" ? otherName.trim() : null,
        note: note.trim() === "" ? null : note.trim(),
      });
    } catch (error) {
      setErrors({ root: attendanceErrorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      noValidate
      aria-label={`Check out ${child.name}`}
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <FormAlert message={errors["root"]} />
      <div
        role="radiogroup"
        aria-label="Who is collecting"
        className="space-y-2"
      >
        {options.map((option) => (
          <Option
            key={
              option.collector.kind === "authorised_pickup"
                ? option.collector.pickupId
                : option.collector.kind
            }
            selected={sameCollector(collector, option.collector)}
            onSelect={() => {
              setCollector(option.collector);
            }}
            leading={option.leading}
            title={option.title}
            detail={option.detail}
          />
        ))}
        <Option
          selected={collector?.kind === "other"}
          onSelect={() => {
            setCollector({ kind: "other" });
          }}
          leading={
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200">
              <TriangleAlert aria-hidden="true" className="size-5" />
            </span>
          }
          title="Someone else"
          detail="Not on the pickup list"
        />
        <FieldError message={errors["collector"]} />
      </div>
      {collector?.kind === "other" ? (
        <div className="space-y-3">
          <p
            role="note"
            className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-100"
          >
            This person is not on {firstName}&apos;s pickup list. Record who
            they are and who confirmed it.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="collector-name" required>
              Their name
            </Label>
            <Input
              id="collector-name"
              className="h-11"
              aria-required
              autoComplete="off"
              value={otherName}
              aria-invalid={errors["otherName"] != null}
              onChange={(event) => {
                setOtherName(event.target.value);
              }}
            />
            <FieldError message={errors["otherName"]} />
          </div>
        </div>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="collector-note" required={collector?.kind === "other"}>
          Note
        </Label>
        <Textarea
          id="collector-note"
          rows={2}
          aria-required={collector?.kind === "other"}
          placeholder={
            collector?.kind === "other"
              ? "Uncle; mother confirmed on the phone at 12:30"
              : undefined
          }
          value={note}
          aria-invalid={errors["note"] != null}
          onChange={(event) => {
            setNote(event.target.value);
          }}
        />
        <FieldError message={errors["note"]} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="collector-time" required>
          Time
        </Label>
        <Input
          id="collector-time"
          type="time"
          className="h-11 w-36"
          aria-required
          value={time}
          aria-invalid={errors["time"] != null}
          onChange={(event) => {
            setTime(event.target.value);
          }}
        />
        <FieldError message={errors["time"]} />
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          className="h-11"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button type="submit" className="h-11" disabled={submitting}>
          {submitting ? "Checking out…" : `Check out ${firstName}`}
        </Button>
      </div>
    </form>
  );
}

/**
 * "Who is collecting <name>?": a bottom sheet on a phone, a dialog from
 * `md` up. A Parent or an Authorised Pickup is one tap; anyone else needs
 * their name and a note.
 */
export function CheckOutPanel({
  child,
  isToday,
  nowTime,
  onOpenChange,
  onSubmit,
}: {
  /** The Child being collected; null closes the panel. */
  child: PreschoolAttendanceRosterChild | null;
  isToday: boolean;
  /** "HH:mm" now, in India. */
  nowTime: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    child: PreschoolAttendanceRosterChild,
    input: Omit<PreschoolCheckOutInput, "childId" | "date">,
  ) => Promise<void>;
}) {
  const isMobile = useIsMobile();
  const title =
    child == null ? "Check out" : `Who is collecting ${child.name}?`;
  const description = isToday
    ? "The time is now; change it if they left earlier."
    : "Enter the time they left.";
  const form =
    child == null ? null : (
      <CheckOutForm
        key={child.childId}
        child={child}
        isToday={isToday}
        nowTime={nowTime}
        checkInTime={child.mark?.checkInTime ?? null}
        onCancel={() => {
          onOpenChange(false);
        }}
        onSubmit={(input) => onSubmit(child, input)}
      />
    );

  if (isMobile)
    return (
      <Sheet open={child != null} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="max-h-[90dvh] overflow-y-auto rounded-t-2xl px-4 pb-6"
        >
          <SheetHeader className="px-0">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          {form}
        </SheetContent>
      </Sheet>
    );
  return (
    <Dialog open={child != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {form}
      </DialogContent>
    </Dialog>
  );
}
