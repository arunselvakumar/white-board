"use client";

import { CoinsIcon } from "@phosphor-icons/react/ssr";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { EmptyState } from "@repo/ui/components/empty-state";
import { FilterTabs } from "@repo/ui/components/filter-tabs";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Skeleton } from "@repo/ui/components/skeleton";

import {
  RoleGate,
  useActiveCentre,
} from "@/app/(app)/preschool/_components/active-centre-provider";
import { PreschoolPage } from "@/app/(app)/preschool/_components/preschool-page";
import { FormAlert } from "@/components/auth/form-alert";
import { formatPaiseAsRupees } from "@/lib/money";
import { FEE_FREQUENCY_LABEL } from "@/lib/preschool-fees";
import { QueryHttpError } from "@/src/queries/http";
import { academicYearsQueryOptions } from "@/src/queries/preschool/academic-years";
import {
  feeHeadsQueryOptions,
  feeKeys,
  feeStructuresQueryOptions,
  removeFeeStructure,
  saveFeeStructure,
  type PreschoolFeeStructure,
  type PreschoolFeeStructureList,
} from "@/src/queries/preschool/fees";

import { FeeHeadsSection } from "./fee-heads-section";
import { FeeStructureForm } from "./fee-structure-form";

type Scope = "default" | "centre";
type ProgrammeStructures = PreschoolFeeStructureList["items"][number];

function Lines({ structure }: { structure: PreschoolFeeStructure | null }) {
  if (structure == null || structure.items.length === 0)
    return <p className="text-muted-foreground text-sm">No fees set.</p>;
  return (
    <ul className="divide-y text-sm">
      {structure.items.map((line) => (
        <li
          key={line.feeHeadId}
          className="flex items-baseline justify-between gap-3 py-1.5"
        >
          <span className="min-w-0">{line.feeHeadName}</span>
          <span className="shrink-0 text-right tabular-nums">
            {formatPaiseAsRupees(line.amountPaise)}
            <span className="text-muted-foreground ml-1 text-xs">
              {FEE_FREQUENCY_LABEL[line.frequency]}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function ProgrammeCard({
  item,
  scope,
  canEdit,
  onEdit,
  onRemoveOverride,
  removing,
}: {
  item: ProgrammeStructures;
  scope: Scope;
  canEdit: boolean;
  onEdit: () => void;
  onRemoveOverride: () => void;
  removing: boolean;
}) {
  const shown = scope === "centre" ? item.effective : item.default;
  return (
    <li
      aria-label={item.programmeName}
      className="bg-card flex flex-col gap-3 rounded-xl border p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">{item.programmeName}</h2>
          <p className="text-muted-foreground text-sm">
            {shown == null
              ? "Not set"
              : `${formatPaiseAsRupees(shown.annualPaise)} a year`}
          </p>
        </div>
        {scope === "centre" ? (
          <Badge variant={item.override == null ? "outline" : "secondary"}>
            {item.override == null
              ? "Using the Workspace default"
              : "Overridden for this Centre"}
          </Badge>
        ) : null}
      </div>
      <Lines structure={shown} />
      {canEdit ? (
        <div className="mt-auto flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Edit ${item.programmeName} fees`}
            onClick={onEdit}
          >
            Edit
          </Button>
          {scope === "centre" && item.override != null ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={removing}
              aria-label={`Remove override for ${item.programmeName}`}
              onClick={onRemoveOverride}
            >
              Remove override
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function StructuresGrid({
  academicYearId,
  scope,
  centreId,
  isOwner,
}: {
  academicYearId: string;
  scope: Scope;
  centreId: string;
  isOwner: boolean;
}) {
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(
    feeStructuresQueryOptions({
      academicYearId,
      ...(scope === "centre" ? { centreId } : {}),
    }),
  );
  const { data: heads } = useSuspenseQuery(
    feeHeadsQueryOptions({ includeArchived: true }),
  );
  const [editing, setEditing] = useState<ProgrammeStructures | null>(null);
  const remove = useMutation({
    mutationFn: removeFeeStructure,
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: feeKeys.all });
    },
  });
  const canEdit = scope === "default" ? isOwner : data.mayOverride === true;
  if (data.items.length === 0)
    return (
      <EmptyState
        className="border"
        size="md"
        icon={CoinsIcon}
        tone="green"
        title="No Programmes"
        description="Add Programmes first; each one gets its own Fee Structure."
      />
    );
  return (
    <>
      {scope === "centre" && data.mayOverride === false ? (
        <p className="text-muted-foreground text-sm">
          This Centre uses the Workspace default fees. Head Office can let it
          set its own.
        </p>
      ) : null}
      <FormAlert
        message={
          remove.error instanceof QueryHttpError
            ? remove.error.message
            : undefined
        }
      />
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.items.map((item) => (
          <ProgrammeCard
            key={item.programmeId}
            item={item}
            scope={scope}
            canEdit={canEdit}
            removing={remove.isPending}
            onEdit={() => {
              setEditing(item);
            }}
            onRemoveOverride={() => {
              if (item.override != null) remove.mutate(item.override.id);
            }}
          />
        ))}
      </ul>
      <Dialog
        open={editing != null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing == null ? null : `${editing.programmeName} fees`}
            </DialogTitle>
            <DialogDescription>
              {scope === "centre"
                ? "This Centre's own amounts for the year."
                : "The Workspace default for every Centre."}{" "}
              Changes apply to new Admissions only.
            </DialogDescription>
          </DialogHeader>
          {editing == null ? null : (
            <FeeStructureForm
              programmeName={editing.programmeName}
              heads={heads.items}
              structure={
                scope === "centre" ? editing.effective : editing.default
              }
              onCancel={() => {
                setEditing(null);
              }}
              onSave={async (items) => {
                await saveFeeStructure({
                  academicYearId,
                  programmeId: editing.programmeId,
                  centreId: scope === "centre" ? centreId : null,
                  items,
                });
                await queryClient.invalidateQueries({ queryKey: feeKeys.all });
                setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function FeeStructures() {
  const { me, centre } = useActiveCentre();
  const isOwner = me.role === "owner";
  const { data: years } = useSuspenseQuery(academicYearsQueryOptions());
  const current =
    years.items.find((year) => year.isCurrent) ?? years.items[0] ?? null;
  const [academicYearId, setAcademicYearId] = useState(current?.id ?? "");
  const [scope, setScope] = useState<Scope>(isOwner ? "default" : "centre");
  const yearItems = years.items.map((year) => ({
    value: year.id,
    label: year.isCurrent ? `${year.name} (current)` : year.name,
  }));
  return (
    <PreschoolPage
      title="Fee Structures"
      meta="Amounts per Fee Head for each Programme. Changes apply to new Admissions only."
    >
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="structures-year">Academic Year</Label>
          <Select
            items={yearItems}
            value={academicYearId}
            onValueChange={(value) => {
              if (value != null) setAcademicYearId(value);
            }}
          >
            <SelectTrigger id="structures-year" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isOwner ? (
          <FilterTabs
            aria-label="Whose fees"
            value={scope}
            onValueChange={setScope}
            items={[
              { value: "default", label: "Workspace default" },
              { value: "centre", label: centre.name },
            ]}
          />
        ) : null}
      </div>
      {academicYearId === "" ? null : (
        <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
          <StructuresGrid
            key={`${academicYearId}-${scope}-${centre.id}`}
            academicYearId={academicYearId}
            scope={scope}
            centreId={centre.id}
            isOwner={isOwner}
          />
        </Suspense>
      )}
      {isOwner ? (
        <Suspense fallback={<Skeleton className="h-48 w-full rounded-xl" />}>
          <FeeHeadsSection />
        </Suspense>
      ) : null}
    </PreschoolPage>
  );
}

/** Fee Structures for the Owner, and a Centre Head's view of their Centre. */
export function FeeStructuresScreen() {
  return (
    <RoleGate roles={["owner", "centre_head"]}>
      <FeeStructures />
    </RoleGate>
  );
}
