"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Skeleton } from "@repo/ui/components/skeleton";

import { FormAlert } from "@/components/auth/form-alert";
import {
  SelectField,
  TextareaField,
  TextField,
} from "@/app/(app)/preschool/_components/form-fields";
import { plural } from "@/app/(app)/preschool/_components/preschool-format";
import { isIsoDate, todayInIndia } from "@/src/preschool/domain/dates";
import { QueryHttpError } from "@/src/queries/http";
import {
  preschoolChildFormOptionsQueryOptions,
  type PreschoolChildFormOptions,
  type PreschoolChildProfile,
} from "@/src/queries/preschool/children";

export type AdmissionActionKind = "move" | "promote" | "withdraw";

function messageOf(error: unknown, fallback: string): string {
  return error instanceof QueryHttpError && error.message !== ""
    ? error.message
    : fallback;
}

function seatsTag(room: PreschoolChildFormOptions["classrooms"][number]) {
  return room.seatsLeft === 0
    ? "Full"
    : plural(room.seatsLeft, "seat left", "seats left");
}

const moveSchema = z.object({
  classroomId: z.string().min(1, "Choose the Classroom"),
  movedOn: z.string().refine(isIsoDate, "Enter the date"),
});

function MoveForm({
  child,
  options,
  onMove,
  onDone,
}: {
  child: PreschoolChildProfile;
  options: PreschoolChildFormOptions;
  onMove: (input: { classroomId: string; movedOn: string }) => Promise<void>;
  onDone: () => void;
}) {
  const current = child.currentAdmission;
  const rooms =
    current == null
      ? []
      : options.classrooms.filter(
          (room) =>
            room.programmeId === current.programmeId &&
            room.academicYearId === current.academicYearId &&
            room.id !== current.classroomId,
        );
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof moveSchema>>({
    resolver: zodResolver(moveSchema),
    defaultValues: { classroomId: "", movedOn: todayInIndia(new Date()) },
  });
  return (
    <form
      noValidate
      aria-label="Move Classroom"
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        try {
          await onMove(values);
          onDone();
        } catch (error) {
          setError("root", {
            message: messageOf(error, "Could not move the Child."),
          });
        }
      })}
    >
      <FormAlert message={errors.root?.message} />
      <SelectField
        id="move-classroomId"
        name="classroomId"
        label="New Classroom"
        required
        control={control}
        placeholder={
          rooms.length === 0
            ? "No other Classroom of this Programme"
            : "Choose…"
        }
        options={rooms.map((room) => ({
          value: room.id,
          label: room.name,
          tag: seatsTag(room),
        }))}
        error={errors.classroomId}
      />
      <TextField
        id="move-movedOn"
        name="movedOn"
        label="From"
        type="date"
        required
        register={register}
        error={errors.movedOn}
      />
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting || rooms.length === 0}>
          {isSubmitting ? "Moving…" : "Move Child"}
        </Button>
      </DialogFooter>
    </form>
  );
}

const promoteSchema = z.object({
  academicYearId: z.string().min(1, "Choose the Academic Year"),
  programmeId: z.string().min(1, "Choose the Programme"),
  classroomId: z.string().min(1, "Choose the Classroom"),
});

function PromoteForm({
  child,
  options,
  onPromote,
  onDone,
}: {
  child: PreschoolChildProfile;
  options: PreschoolChildFormOptions;
  onPromote: (input: z.infer<typeof promoteSchema>) => Promise<void>;
  onDone: () => void;
}) {
  const currentYear = options.academicYears.find(
    (year) => year.id === child.currentAdmission?.academicYearId,
  );
  const years = options.academicYears.filter(
    (year) => currentYear == null || year.startsOn > currentYear.startsOn,
  );
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof promoteSchema>>({
    resolver: zodResolver(promoteSchema),
    defaultValues: {
      academicYearId: years[0]?.id ?? "",
      programmeId: "",
      classroomId: "",
    },
  });
  const [academicYearId, programmeId] = useWatch({
    control,
    name: ["academicYearId", "programmeId"],
  });
  const rooms = options.classrooms.filter(
    (room) =>
      room.academicYearId === academicYearId &&
      room.programmeId === programmeId,
  );
  return (
    <form
      noValidate
      aria-label="Promote"
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        try {
          await onPromote(values);
          onDone();
        } catch (error) {
          setError("root", {
            message: messageOf(error, "Could not promote the Child."),
          });
        }
      })}
    >
      <FormAlert message={errors.root?.message} />
      {years.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          There is no later Academic Year yet. Add next year&apos;s Classrooms
          first.
        </p>
      ) : null}
      <SelectField
        id="promote-academicYearId"
        name="academicYearId"
        label="Academic Year"
        required
        control={control}
        options={years.map((year) => ({ value: year.id, label: year.name }))}
        error={errors.academicYearId}
      />
      <SelectField
        id="promote-programmeId"
        name="programmeId"
        label="Programme"
        required
        control={control}
        options={options.programmes.map((programme) => ({
          value: programme.id,
          label: programme.name,
          tag: programme.ageRangeText ?? undefined,
        }))}
        error={errors.programmeId}
      />
      <SelectField
        id="promote-classroomId"
        name="classroomId"
        label="Classroom"
        required
        control={control}
        placeholder={rooms.length === 0 ? "No Classroom yet" : "Choose…"}
        options={rooms.map((room) => ({
          value: room.id,
          label: room.name,
          tag: seatsTag(room),
        }))}
        error={errors.classroomId}
      />
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Promoting…" : "Promote"}
        </Button>
      </DialogFooter>
    </form>
  );
}

const withdrawSchema = z.object({
  withdrawnOn: z.string().refine(isIsoDate, "Enter the date"),
  reason: z.string().trim().min(1, "Say why the Child is leaving").max(300),
});

function WithdrawForm({
  onWithdraw,
  onDone,
}: {
  onWithdraw: (input: z.infer<typeof withdrawSchema>) => Promise<void>;
  onDone: () => void;
}) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof withdrawSchema>>({
    resolver: zodResolver(withdrawSchema),
    defaultValues: { withdrawnOn: todayInIndia(new Date()), reason: "" },
  });
  return (
    <form
      noValidate
      aria-label="Withdraw"
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        try {
          await onWithdraw(values);
          onDone();
        } catch (error) {
          setError("root", {
            message: messageOf(error, "Could not withdraw the Child."),
          });
        }
      })}
    >
      <FormAlert message={errors.root?.message} />
      <TextField
        id="withdraw-withdrawnOn"
        name="withdrawnOn"
        label="Last day"
        type="date"
        required
        register={register}
        error={errors.withdrawnOn}
      />
      <TextareaField
        id="withdraw-reason"
        name="reason"
        label="Reason"
        required
        rows={2}
        register={register}
        error={errors.reason}
      />
      <DialogFooter>
        <Button type="submit" variant="destructive" disabled={isSubmitting}>
          {isSubmitting ? "Withdrawing…" : "Withdraw Child"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function OptionsForm({
  kind,
  child,
  onMove,
  onPromote,
  onDone,
}: {
  kind: "move" | "promote";
  child: PreschoolChildProfile;
  onMove: (input: { classroomId: string; movedOn: string }) => Promise<void>;
  onPromote: (input: z.infer<typeof promoteSchema>) => Promise<void>;
  onDone: () => void;
}) {
  const { data: options } = useSuspenseQuery(
    preschoolChildFormOptionsQueryOptions(child.centreId),
  );
  return kind === "move" ? (
    <MoveForm child={child} options={options} onMove={onMove} onDone={onDone} />
  ) : (
    <PromoteForm
      child={child}
      options={options}
      onPromote={onPromote}
      onDone={onDone}
    />
  );
}

const COPY = {
  move: {
    title: "Move Classroom",
    description:
      "To another Classroom of the same Programme this year. The history keeps both.",
  },
  promote: {
    title: "Promote",
    description:
      "Into a Programme and Classroom of a later Academic Year. Its Invoices are raised.",
  },
  withdraw: {
    title: "Withdraw",
    description:
      "The Child leaves the Centre. Their record stays and can only be read.",
  },
} as const;

/** Move, Promote and Withdraw, for managers of an active Child. */
export function ChildAdmissionDialog({
  kind,
  child,
  onClose,
  onMove,
  onPromote,
  onWithdraw,
}: {
  kind: AdmissionActionKind | null;
  child: PreschoolChildProfile;
  onClose: () => void;
  onMove: (input: { classroomId: string; movedOn: string }) => Promise<void>;
  onPromote: (input: z.infer<typeof promoteSchema>) => Promise<void>;
  onWithdraw: (input: z.infer<typeof withdrawSchema>) => Promise<void>;
}) {
  return (
    <Dialog
      open={kind != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {kind == null ? null : (
          <>
            <DialogHeader>
              <DialogTitle>
                {COPY[kind].title} · {child.name}
              </DialogTitle>
              <DialogDescription>{COPY[kind].description}</DialogDescription>
            </DialogHeader>
            {kind === "withdraw" ? (
              <WithdrawForm onWithdraw={onWithdraw} onDone={onClose} />
            ) : (
              <Suspense fallback={<Skeleton className="h-40 w-full" />}>
                <OptionsForm
                  kind={kind}
                  child={child}
                  onMove={onMove}
                  onPromote={onPromote}
                  onDone={onClose}
                />
              </Suspense>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
