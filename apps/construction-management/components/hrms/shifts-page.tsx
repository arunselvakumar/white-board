"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Clock, Plus, Repeat } from "lucide-react";
import { useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";

import { fieldForCode } from "@/lib/server-errors";
import {
  ISO_WEEKDAY_LABELS,
  type IsoWeekday,
} from "@/src/hrms/domain/calendar";
import { ROTATION_TYPE_LABELS, crossesMidnight } from "@/src/hrms/domain/shift";
import {
  HRMS_SHIFTS_KEY,
  deleteHrmsRotationTemplate,
  deleteHrmsShiftTemplate,
  hrmsRotationTemplatesQuery,
  hrmsShiftTemplatesQuery,
  type HrmsRotationTemplate,
  type HrmsShiftTemplate,
} from "@/src/queries/hrms-shifts";

import {
  ConfirmDialog,
  HrmsEmpty,
  HrmsPage,
  RowMenu,
  formatHours,
} from "./hrms-parts";
import { RotationDialog } from "./rotation-dialog";
import { ShiftDialog } from "./shift-dialog";

/** `Mon–Sat`, `Mon, Wed, Fri`. */
export function weekdaysText(days: readonly number[]): string {
  const short = (day: number) =>
    ISO_WEEKDAY_LABELS[day as IsoWeekday].slice(0, 3);
  const sorted = [...days].sort((a, b) => a - b);
  const first = sorted[0];
  const last = sorted.at(-1);
  if (first == null || last == null) return "No days";
  if (sorted.length === 7) return "Every day";
  if (sorted.length > 2 && last - first === sorted.length - 1)
    return `${short(first)}–${short(last)}`;
  return sorted.map(short).join(", ");
}

function shiftSummary(shift: HrmsShiftTemplate): string {
  const times = `${shift.startTime}–${shift.endTime}${crossesMidnight(shift.startTime, shift.endTime) ? " (next day)" : ""}`;
  return [
    times,
    weekdaysText(shift.workingDays),
    `${formatHours(shift.workingHours)}, half day ${formatHours(shift.halfDayHours)}`,
    `${String(shift.graceMinutes)} min grace`,
  ].join(" · ");
}

function rotationSummary(
  rotation: HrmsRotationTemplate,
  names: ReadonlyMap<string, string>,
): string {
  const counts = new Map<string, number>();
  for (const slot of rotation.slots) {
    const name = slot == null ? "Week Off" : (names.get(slot) ?? "Deleted");
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const parts = [...counts].map(([name, count]) => `${name} ×${String(count)}`);
  return `${ROTATION_TYPE_LABELS[rotation.type]} · ${String(rotation.daysPerCycle)} days: ${parts.join(", ")}`;
}

function StateBadges({ active, inUse }: { active: boolean; inUse: boolean }) {
  if (active && !inUse) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {active ? null : <Badge variant="outline">Inactive</Badge>}
      {inUse ? <Badge variant="secondary">In use</Badge> : null}
    </div>
  );
}

type Pending =
  | { kind: "shift"; item: HrmsShiftTemplate }
  | { kind: "rotation"; item: HrmsRotationTemplate };

/**
 * Configuration → Shifts (CM-306): shift templates and rotations, each
 * with add and edit dialogs. A template in use cannot be deleted; mark it
 * inactive instead. Menu `hrms.shifts`.
 */
export function ShiftsPage({
  initialTab = "shifts",
}: {
  initialTab?: "shifts" | "rotations";
}) {
  const { data: shifts } = useSuspenseQuery(hrmsShiftTemplatesQuery);
  const { data: rotations } = useSuspenseQuery(hrmsRotationTemplatesQuery);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<string>(initialTab);
  const [editingShift, setEditingShift] = useState<
    HrmsShiftTemplate | "new" | null
  >(null);
  const [editingRotation, setEditingRotation] = useState<
    HrmsRotationTemplate | "new" | null
  >(null);
  const [deleting, setDeleting] = useState<Pending | null>(null);
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const remove = useMutation({
    mutationFn: (pending: Pending) =>
      pending.kind === "shift"
        ? deleteHrmsShiftTemplate(pending.item.id)
        : deleteHrmsRotationTemplate(pending.item.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: HRMS_SHIFTS_KEY });
      setDeleting(null);
    },
    onError: (error) => {
      setDeleteError(fieldForCode(error, {}).message);
    },
  });
  const names = new Map(shifts.items.map((shift) => [shift.id, shift.name]));
  const anyActiveShift = shifts.items.some((shift) => shift.isActive);

  const addShift = (
    <Button
      type="button"
      onClick={() => {
        setEditingShift("new");
      }}
    >
      <Plus aria-hidden="true" />
      Add Shift
    </Button>
  );
  const addRotation = (
    <Button
      type="button"
      disabled={!anyActiveShift}
      onClick={() => {
        setEditingRotation("new");
      }}
    >
      <Plus aria-hidden="true" />
      Add Rotation
    </Button>
  );

  return (
    <HrmsPage
      title="Shifts"
      description="Shift templates set the start, hours, grace and overtime of a day. Rotations let a crew alternate shifts."
    >
      <Tabs
        value={tab}
        onValueChange={(value: string) => {
          setTab(value);
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList aria-label="Shifts and rotations">
            <TabsTrigger value="shifts">Shift templates</TabsTrigger>
            <TabsTrigger value="rotations">Rotations</TabsTrigger>
          </TabsList>
          {tab === "shifts"
            ? shifts.items.length > 0
              ? addShift
              : null
            : rotations.items.length > 0
              ? addRotation
              : null}
        </div>
        <TabsContent value="shifts" className="pt-3">
          {shifts.items.length === 0 ? (
            <HrmsEmpty
              icon={Clock}
              title="No shifts yet"
              description="Until a member has a shift, their day follows the HRMS Settings: working hours, half day, grace and working days. Add a shift for a different start time or a night shift."
              action={addShift}
            />
          ) : (
            <ul
              aria-label="Shift templates"
              className="bg-card divide-y rounded-xl border"
            >
              {shifts.items.map((shift) => (
                <li
                  key={shift.id}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate font-medium">
                      {shift.name}
                      {shift.overtimeAllowed ? (
                        <span className="text-muted-foreground font-normal">
                          {" "}
                          · Overtime
                        </span>
                      ) : null}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {shiftSummary(shift)}
                    </p>
                    <StateBadges active={shift.isActive} inUse={shift.inUse} />
                  </div>
                  <RowMenu
                    name={shift.name}
                    actions={[
                      {
                        label: "Edit",
                        onSelect: () => {
                          setEditingShift(shift);
                        },
                      },
                      {
                        label: "Delete",
                        destructive: true,
                        onSelect: () => {
                          setDeleteError(undefined);
                          setDeleting({ kind: "shift", item: shift });
                        },
                      },
                    ]}
                  />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
        <TabsContent value="rotations" className="pt-3">
          {rotations.items.length === 0 ? (
            <HrmsEmpty
              icon={Repeat}
              title="No rotations yet"
              description={
                anyActiveShift
                  ? "A rotation alternates shifts by weekday, by day of the month, or in a cycle of 2 to 12 days, with week offs where you choose."
                  : "Add an active shift first; a rotation is built from shifts and week offs."
              }
              action={addRotation}
            />
          ) : (
            <ul
              aria-label="Rotations"
              className="bg-card divide-y rounded-xl border"
            >
              {rotations.items.map((rotation) => (
                <li
                  key={rotation.id}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate font-medium">{rotation.name}</p>
                    <p className="text-muted-foreground text-sm">
                      {rotationSummary(rotation, names)}
                    </p>
                    <StateBadges
                      active={rotation.isActive}
                      inUse={rotation.inUse}
                    />
                  </div>
                  <RowMenu
                    name={rotation.name}
                    actions={[
                      {
                        label: "Edit",
                        onSelect: () => {
                          setEditingRotation(rotation);
                        },
                      },
                      {
                        label: "Delete",
                        destructive: true,
                        onSelect: () => {
                          setDeleteError(undefined);
                          setDeleting({ kind: "rotation", item: rotation });
                        },
                      },
                    ]}
                  />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
      {editingShift == null ? null : (
        <ShiftDialog
          shift={editingShift === "new" ? null : editingShift}
          onClose={() => {
            setEditingShift(null);
          }}
        />
      )}
      {editingRotation == null ? null : (
        <RotationDialog
          rotation={editingRotation === "new" ? null : editingRotation}
          shifts={shifts.items}
          onClose={() => {
            setEditingRotation(null);
          }}
        />
      )}
      <ConfirmDialog
        open={deleting != null}
        title={`Delete ${deleting?.item.name ?? ""}?`}
        description="It will no longer be offered. A shift or rotation that members or rotations use cannot be deleted; mark it inactive instead."
        confirmLabel="Delete"
        error={deleteError}
        pending={remove.isPending}
        onClose={() => {
          setDeleting(null);
        }}
        onConfirm={() => {
          if (deleting != null) remove.mutate(deleting);
        }}
      />
    </HrmsPage>
  );
}
