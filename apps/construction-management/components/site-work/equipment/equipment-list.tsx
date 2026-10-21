"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ChevronRight, Plus, Truck } from "lucide-react";
import Link from "next/link";
import { Suspense, useDeferredValue, useState, useTransition } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { cn } from "@repo/ui/lib/utils";

import { PageHeader } from "@/components/app-shell/page-header";
import {
  MasterEmpty,
  MasterSearch,
} from "@/components/masters/master-list-parts";
import {
  equipmentFormOptionsQuery,
  equipmentListQuery,
  type EquipmentFilters,
} from "@/src/queries/equipment";
import {
  canInSiteWork,
  siteWorkAccessQuery,
} from "@/src/queries/site-work-access";
import {
  EQUIPMENT_STATE_LABELS,
  EQUIPMENT_STATES,
  OWNERSHIP_LABELS,
  WAREHOUSE_LABEL,
  type EquipmentOwnership,
  type EquipmentState,
} from "@/src/site-work/domain/equipment";

import {
  EquipmentStateBadge,
  equipmentSummary,
  placeLabel,
} from "./equipment-format";
import { EquipmentReportsButton } from "./equipment-reports-dialog";
import {
  EQUIPMENTS_PATH,
  equipmentModulePath,
  equipmentPath,
  projectEquipmentPath,
} from "./equipment-tabs";
import { EquipmentRowsSkeleton } from "@/components/site-work/site-work-skeletons";

const ALL = "all";

const OWNERSHIP_ITEMS = [
  { value: ALL, label: "Owned and rented" },
  { value: "owned", label: OWNERSHIP_LABELS.owned },
  { value: "rented", label: OWNERSHIP_LABELS.rented },
];

const STATE_ITEMS = [
  { value: ALL, label: "Any state" },
  ...EQUIPMENT_STATES.map((state) => ({
    value: state,
    label: EQUIPMENT_STATE_LABELS[state],
  })),
];

function FilterSelect({
  label,
  items,
  value,
  onChange,
  className = "sm:w-44",
}: {
  label: string;
  items: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) => {
        if (next != null) onChange(next);
      }}
    >
      <SelectTrigger
        aria-label={label}
        className={`w-full min-w-0 ${className}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Rows({
  filters,
  filtered,
  hrefFor,
  empty,
  onPage,
  className,
}: {
  filters: EquipmentFilters;
  filtered: boolean;
  hrefFor: (id: string) => string;
  empty: { description: string; action: React.ReactNode };
  onPage: (after: string | null) => void;
  className?: string;
}) {
  const { data } = useSuspenseQuery(equipmentListQuery(filters));
  if (data.items.length === 0)
    return filtered ? (
      <p className="text-muted-foreground rounded-lg border p-6 text-center text-sm">
        No equipment matches these filters.
      </p>
    ) : (
      <MasterEmpty
        icon={Truck}
        title="No equipment yet"
        description={empty.description}
        action={empty.action}
      />
    );
  return (
    <div className={cn("space-y-3", className)}>
      <p className="text-muted-foreground text-sm">
        {data.total === 1 ? "1 machine" : `${String(data.total)} machines`}
      </p>
      <ul className="divide-y rounded-lg border" aria-label="Equipment">
        {data.items.map((item) => (
          <li key={item.id}>
            <Link
              href={hrefFor(item.id)}
              className="hover:bg-muted/50 focus-visible:ring-ring/50 flex items-center gap-3 px-4 py-3 outline-none focus-visible:ring-3"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate font-medium">{item.name}</p>
                <p className="text-muted-foreground text-sm break-words">
                  {equipmentSummary(item)}
                </p>
                <p className="text-muted-foreground text-sm break-words">
                  {placeLabel(item)}
                </p>
              </div>
              <EquipmentStateBadge state={item.state} />
              <ChevronRight
                aria-hidden="true"
                className="text-muted-foreground size-4 shrink-0"
              />
            </Link>
          </li>
        ))}
      </ul>
      {filters.after != null || data.nextCursor != null ? (
        <div className="flex justify-end gap-2">
          {filters.after != null && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onPage(null);
              }}
            >
              First page
            </Button>
          )}
          {data.nextCursor != null && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onPage(data.nextCursor);
              }}
            >
              Next page
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function useFilterState() {
  const [search, setSearch] = useState("");
  const [ownership, setOwnership] = useState(ALL);
  const [state, setState] = useState(ALL);
  const [place, setPlace] = useState(ALL);
  const [after, setAfter] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);
  // Filter and page changes keep the old rows on screen, dimmed (ADR-0047).
  const [isPending, startTransition] = useTransition();
  const reset =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      startTransition(() => {
        set(value);
        setAfter(null);
      });
    };
  return {
    isPending,
    search,
    setSearch: (value: string) => {
      setSearch(value);
      startTransition(() => {
        setAfter(null);
      });
    },
    ownership,
    setOwnership: reset(setOwnership),
    state,
    setState: reset(setState),
    place,
    setPlace: reset(setPlace),
    after,
    setAfter: (value: string | null) => {
      startTransition(() => {
        setAfter(value);
      });
    },
    filters: {
      search: deferredSearch,
      ownership: ownership === ALL ? null : (ownership as EquipmentOwnership),
      state: state === ALL ? null : (state as EquipmentState),
      place: place === ALL ? null : place,
      after,
    } satisfies EquipmentFilters,
    filtered:
      search.trim() !== "" ||
      ownership !== ALL ||
      state !== ALL ||
      place !== ALL,
  };
}

/**
 * Masters → Equipments (CM-603): the Company's equipment with where each
 * machine is and its state, filtered by ownership, place and state.
 */
export function EquipmentRegister() {
  const filter = useFilterState();
  const { data: access } = useQuery(siteWorkAccessQuery(null));
  const { data: options } = useQuery(equipmentFormOptionsQuery());
  const canAdd =
    access != null && canInSiteWork(access, "masters.equipments", "create");
  const canReport =
    access != null && canInSiteWork(access, "masters.equipments", "report");
  const addButton = canAdd ? (
    <Link href={`${EQUIPMENTS_PATH}/new`} className={buttonVariants()}>
      <Plus aria-hidden="true" />
      Add Equipment
    </Link>
  ) : null;
  const actions =
    canAdd || canReport ? (
      <div className="flex flex-wrap gap-2">
        {canReport ? <EquipmentReportsButton /> : null}
        {addButton}
      </div>
    ) : null;
  const placeItems = [
    { value: ALL, label: "Anywhere" },
    { value: "warehouse", label: WAREHOUSE_LABEL },
    ...(options?.projects ?? []).map((project) => ({
      value: project.id,
      label: project.name,
    })),
  ];
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Masters", href: "/app/masters" }}
          title="Equipments"
          meta="Machines the Company owns or hires, where each one is, and whether it can take a usage sheet."
          actions={actions}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <MasterSearch
            label="Search name or number"
            value={filter.search}
            onChange={filter.setSearch}
          />
          <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-3 sm:flex">
            <FilterSelect
              label="Ownership"
              items={OWNERSHIP_ITEMS}
              value={filter.ownership}
              onChange={filter.setOwnership}
            />
            <FilterSelect
              label="Where"
              items={placeItems}
              value={filter.place}
              onChange={filter.setPlace}
            />
            <FilterSelect
              label="State"
              items={STATE_ITEMS}
              value={filter.state}
              onChange={filter.setState}
              className="sm:w-40"
            />
          </div>
        </div>
        <Suspense fallback={<EquipmentRowsSkeleton />}>
          <Rows
            filters={filter.filters}
            filtered={filter.filtered}
            hrefFor={equipmentPath}
            onPage={filter.setAfter}
            className={cn(filter.isPending && "opacity-60 transition-opacity")}
            empty={{
              description:
                "Add the JCBs, mixers, tippers and cranes you own or hire, at a Project or the warehouse.",
              action: addButton,
            }}
          />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * The Equipment tab of a Project's Equipment module: the machines at this
 * Project now, and "+ Add equipment" to this Project.
 */
export function ProjectEquipmentList({ projectId }: { projectId: string }) {
  const filter = useFilterState();
  const { data: access } = useQuery(siteWorkAccessQuery(projectId));
  const canAdd =
    access != null &&
    (canInSiteWork(access, "masters.equipments", "create") ||
      canInSiteWork(access, "site_work.equipment_usage", "create"));
  const addButton = canAdd ? (
    <Link
      href={`${equipmentModulePath(projectId, "register")}/new`}
      className={buttonVariants()}
    >
      <Plus aria-hidden="true" />
      Add equipment
    </Link>
  ) : null;
  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <MasterSearch
          label="Search name or number"
          value={filter.search}
          onChange={filter.setSearch}
        />
        <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 sm:flex">
          <FilterSelect
            label="Ownership"
            items={OWNERSHIP_ITEMS}
            value={filter.ownership}
            onChange={filter.setOwnership}
          />
          <FilterSelect
            label="State"
            items={STATE_ITEMS}
            value={filter.state}
            onChange={filter.setState}
            className="sm:w-40"
          />
        </div>
        <div className="sm:ml-auto">{addButton}</div>
      </div>
      <Suspense fallback={<EquipmentRowsSkeleton />}>
        <Rows
          filters={{ ...filter.filters, place: projectId }}
          filtered={filter.filtered}
          hrefFor={(id) => projectEquipmentPath(projectId, id)}
          onPage={filter.setAfter}
          className={cn(filter.isPending && "opacity-60 transition-opacity")}
          empty={{
            description:
              "Add the machines working at this Project, or transfer one here from Masters → Equipments.",
            action: addButton,
          }}
        />
      </Suspense>
    </div>
  );
}
