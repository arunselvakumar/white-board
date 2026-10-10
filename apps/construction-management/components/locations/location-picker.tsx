"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState, type Ref } from "react";
import { buttonVariants } from "@repo/ui/components/button";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@repo/ui/components/combobox";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

import {
  locationNames,
  locationOptionsQuery,
  type LocationOptions,
  type LocationOptionWing,
} from "@/src/queries/location-options";
import {
  LOCATION_TYPES,
  locationLabel,
  type LocationRef,
  type LocationType,
} from "@/src/shared-kernel/location-ref";

/** Units listed at once; typing searches all of them. */
export const UNITS_SHOWN = 100;

type Named = { id: string; name: string };
type Option = Named & { hint?: string };

const TYPE_LABELS: Record<LocationType, string> = Object.fromEntries(
  LOCATION_TYPES.map((item) => [item.key, item.label]),
) as Record<LocationType, string>;

const PLACE_FIELDS = {
  amenity: {
    label: "Amenity",
    list: "amenities",
    placeholder: "Choose an Amenity",
  },
  common_development: {
    label: "Common Development",
    list: "commonDevelopments",
    placeholder: "Choose a Common Development",
  },
  location: {
    label: "Location",
    list: "locations",
    placeholder: "Choose a Location",
  },
} as const satisfies Record<
  Exclude<LocationType, "wing">,
  {
    label: string;
    list: "amenities" | "commonDevelopments" | "locations";
    placeholder: string;
  }
>;

export type LocationPickerProps = {
  projectId: string;
  /** A complete LocationRef, or null while nothing (or not enough) is chosen. */
  value: LocationRef | null;
  onChange: (value: LocationRef | null) => void;
  /** The first control's id, for an outside label or a form's focus. */
  id?: string;
  /** The first control, for react-hook-form's `field.ref`. */
  ref?: Ref<HTMLButtonElement>;
  /** The group's name; "Location" unless the form calls it something else. */
  label?: string;
  required?: boolean;
  disabled?: boolean;
  /** Marks the first control invalid (a form error is shown by the form). */
  invalid?: boolean;
};

/**
 * Where on a Project a site entry happened (ADR CM-0013 §7): Location Type,
 * then a Wing with any of its Floors and Units, or one Amenity, Common
 * Development or Location. Offers only the types the Project has rows
 * for, and skips the type when there is one. `onChange` gets a complete
 * LocationRef or null; changing the type or the Wing clears what depends
 * on it. Reads `…/location-options` with suspense.
 */
export function LocationPicker({ projectId, ...props }: LocationPickerProps) {
  const { data } = useSuspenseQuery(locationOptionsQuery(projectId));
  return <LocationFields projectId={projectId} options={data} {...props} />;
}

/** One line for a LocationRef on this Project ("Wing A · Ground Floor · Unit G01"). */
export function LocationLabel({
  projectId,
  value,
  className,
}: {
  projectId: string;
  value: LocationRef;
  className?: string;
}) {
  const { data } = useSuspenseQuery(locationOptionsQuery(projectId));
  const names = locationNames(data, value);
  return (
    <span className={className}>
      {names == null ? "Location not available" : locationLabel(names)}
    </span>
  );
}

function LocationFields({
  projectId,
  options,
  value,
  onChange,
  id,
  ref,
  label = "Location",
  required = false,
  disabled = false,
  invalid = false,
}: LocationPickerProps & { options: LocationOptions }) {
  const baseId = useId();
  const groupId = `${baseId}-group`;
  const firstId = id ?? `${baseId}-first`;
  const [draftType, setDraftType] = useState<LocationType | null>(null);

  // A stored value keeps its type even if the Project no longer offers it.
  const offered = options.types as LocationType[];
  const types =
    value != null && !offered.includes(value.type)
      ? LOCATION_TYPES.map((item) => item.key).filter(
          (type) => type === value.type || offered.includes(type),
        )
      : offered;
  const type: LocationType | null =
    value?.type ?? (types.length === 1 ? (types[0] ?? null) : draftType);
  const showType = types.length > 1;

  if (types.length === 0)
    return (
      <EmptyLocations
        projectId={projectId}
        structure={options.structure}
        label={label}
      />
    );

  const placeId = showType ? `${baseId}-place` : firstId;

  // One select alone carries its own label; a heading would only repeat it.
  const heading = showType || type === "wing";
  return (
    <div
      role="group"
      aria-labelledby={heading ? groupId : undefined}
      aria-label={heading ? undefined : label}
      className="min-w-0 space-y-3"
    >
      {heading ? (
        <p id={groupId} className="text-sm font-medium">
          {label}
          {required ? (
            <span className="text-muted-foreground font-normal">
              {" "}
              (required)
            </span>
          ) : null}
        </p>
      ) : null}
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        {showType ? (
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={firstId}>Location Type</Label>
            <Select
              items={types.map((key) => ({
                value: key,
                label: TYPE_LABELS[key],
              }))}
              value={type}
              disabled={disabled}
              onValueChange={(next) => {
                if (next == null || next === type) return;
                setDraftType(next);
                onChange(null);
              }}
            >
              <SelectTrigger
                id={firstId}
                ref={ref}
                size="lg"
                className="w-full min-w-0"
                aria-invalid={invalid}
              >
                <SelectValue placeholder="Choose a Location Type" />
              </SelectTrigger>
              <SelectContent
                align="start"
                alignItemWithTrigger={false}
                aria-label="Location Types"
              >
                {types.map((key) => (
                  <SelectItem key={key} value={key}>
                    {TYPE_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {type === "wing" ? (
          <WingFields
            baseId={baseId}
            placeId={placeId}
            placeRef={showType ? undefined : ref}
            wings={options.wings}
            value={value?.type === "wing" ? value : null}
            onChange={onChange}
            disabled={disabled}
            invalid={invalid && !showType}
          />
        ) : type == null ? null : (
          <PlaceField
            type={type}
            id={placeId}
            placeRef={showType ? undefined : ref}
            rows={options[PLACE_FIELDS[type].list]}
            value={value}
            onChange={onChange}
            disabled={disabled}
            invalid={invalid && !showType}
          />
        )}
      </div>
    </div>
  );
}

function EmptyLocations({
  projectId,
  structure,
  label,
}: {
  projectId: string;
  structure: LocationOptions["structure"];
  label: string;
}) {
  const wings = structure === "wings";
  return (
    <Empty className="border p-6" aria-label={label}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <MapPin />
        </EmptyMedia>
        <EmptyTitle>Nothing to locate this at yet</EmptyTitle>
        <EmptyDescription>
          {wings
            ? "This Project has no Wings, Amenities or Common Developments yet. Add a Wing first."
            : "This Project has no Locations, Amenities or Common Developments yet. Add a Location first."}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link
          href={`/app/projects/${encodeURIComponent(projectId)}/${wings ? "wings" : "locations"}`}
          className={buttonVariants({ variant: "outline" })}
        >
          {wings ? "Open Wings" : "Open Locations"}
        </Link>
      </EmptyContent>
    </Empty>
  );
}

/** One Amenity, Common Development or Location. */
function PlaceField({
  type,
  id,
  placeRef,
  rows,
  value,
  onChange,
  disabled,
  invalid,
}: {
  type: Exclude<LocationType, "wing">;
  id: string;
  placeRef: Ref<HTMLButtonElement> | undefined;
  rows: Named[];
  value: LocationRef | null;
  onChange: (value: LocationRef | null) => void;
  disabled: boolean;
  invalid: boolean;
}) {
  const field = PLACE_FIELDS[type];
  const current =
    value == null || value.type === "wing"
      ? null
      : value.type === "location"
        ? value.locationId
        : value.developmentId;
  // A stored id the Project no longer offers stays chosen until changed.
  const items =
    current == null || rows.some((row) => row.id === current)
      ? rows
      : [...rows, { id: current, name: "No longer available" }];
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{field.label}</Label>
      <Select
        items={items.map((row) => ({ value: row.id, label: row.name }))}
        value={current}
        disabled={disabled}
        onValueChange={(next) => {
          if (next == null) return;
          onChange(
            type === "location"
              ? { type, locationId: next }
              : { type, developmentId: next },
          );
        }}
      >
        <SelectTrigger
          id={id}
          ref={placeRef}
          size="lg"
          className="w-full min-w-0"
          aria-invalid={invalid}
        >
          <SelectValue placeholder={field.placeholder} />
        </SelectTrigger>
        <SelectContent
          align="start"
          alignItemWithTrigger={false}
          aria-label={TYPE_LABELS[type]}
        >
          {items.map((row) => (
            <SelectItem key={row.id} value={row.id}>
              {row.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Wing (grouped by Phase), then Floors, then Units on those Floors. */
function WingFields({
  baseId,
  placeId,
  placeRef,
  wings,
  value,
  onChange,
  disabled,
  invalid,
}: {
  baseId: string;
  placeId: string;
  placeRef: Ref<HTMLButtonElement> | undefined;
  wings: LocationOptionWing[];
  value: Extract<LocationRef, { type: "wing" }> | null;
  onChange: (value: LocationRef | null) => void;
  disabled: boolean;
  invalid: boolean;
}) {
  const phases = useMemo(() => {
    const groups = new Map<string, LocationOptionWing[]>();
    for (const wing of wings)
      groups.set(wing.phaseName, [...(groups.get(wing.phaseName) ?? []), wing]);
    return [...groups.entries()];
  }, [wings]);
  const wing = wings.find((item) => item.id === value?.wingId) ?? null;
  const items = wings.map((item) => ({ value: item.id, label: item.name }));
  if (value != null && wing == null)
    items.push({ value: value.wingId, label: "No longer available" });

  // A plot or bungalow scheme keeps its Units on one row: no Floors to pick.
  const scheme = wing?.floors.every((floor) => floor.kind === "site") ?? false;
  const floorIds = value?.floorIds ?? [];
  const chosenFloors =
    wing == null
      ? []
      : floorIds.length === 0
        ? wing.floors
        : wing.floors.filter((floor) => floorIds.includes(floor.id));
  const units: Option[] = chosenFloors.flatMap((floor) =>
    floor.units.map((unit) => ({
      id: unit.id,
      name: unit.name,
      hint: scheme ? undefined : floor.name,
    })),
  );

  return (
    <>
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor={placeId}>Wing</Label>
        <Select
          items={items}
          value={value?.wingId ?? null}
          disabled={disabled}
          onValueChange={(next) => {
            if (next == null || next === value?.wingId) return;
            onChange({ type: "wing", wingId: next, floorIds: [], unitIds: [] });
          }}
        >
          <SelectTrigger
            id={placeId}
            ref={placeRef}
            size="lg"
            className="w-full min-w-0"
            aria-invalid={invalid}
          >
            <SelectValue placeholder="Choose a Wing" />
          </SelectTrigger>
          <SelectContent
            align="start"
            alignItemWithTrigger={false}
            aria-label="Wings"
          >
            {phases.length > 1
              ? phases.map(([phase, rows]) => (
                  <SelectGroup key={phase}>
                    <SelectLabel>{phase}</SelectLabel>
                    {rows.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))
              : wings.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name}
                  </SelectItem>
                ))}
          </SelectContent>
        </Select>
      </div>
      {value == null || wing == null ? null : (
        <>
          {scheme ? null : (
            <div className="min-w-0 space-y-1.5 sm:col-span-2">
              <Label htmlFor={`${baseId}-floors`}>Floors</Label>
              <IdMultiSelect
                id={`${baseId}-floors`}
                options={wing.floors}
                value={floorIds}
                disabled={disabled}
                placeholder="Whole Wing"
                listLabel="Floors"
                emptyText="No Floors found."
                onChange={(next) => {
                  // Units stay only while their Floor is still chosen.
                  const kept =
                    next.length === 0
                      ? value.unitIds
                      : value.unitIds.filter((unitId) =>
                          wing.floors.some(
                            (floor) =>
                              next.includes(floor.id) &&
                              floor.units.some((unit) => unit.id === unitId),
                          ),
                        );
                  onChange({ ...value, floorIds: next, unitIds: kept });
                }}
              />
            </div>
          )}
          <div className="min-w-0 space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${baseId}-units`}>Units</Label>
            <IdMultiSelect
              id={`${baseId}-units`}
              options={units}
              value={value.unitIds}
              disabled={disabled || units.length === 0}
              placeholder={
                units.length === 0
                  ? "No Units on these Floors"
                  : floorIds.length === 0
                    ? "All Units of the Wing"
                    : "All Units of these Floors"
              }
              listLabel="Units"
              emptyText="No Units match."
              limit={UNITS_SHOWN}
              describedBy={
                units.length > UNITS_SHOWN ? `${baseId}-units-hint` : undefined
              }
              onChange={(next) => {
                onChange({ ...value, unitIds: next });
              }}
            />
            {units.length > UNITS_SHOWN ? (
              <p
                id={`${baseId}-units-hint`}
                className="text-muted-foreground text-xs"
              >
                {`Showing ${String(UNITS_SHOWN)} of ${units.length.toLocaleString("en-IN")} Units. Type a Unit number to find the rest.`}
              </p>
            ) : null}
          </div>
        </>
      )}
    </>
  );
}

/**
 * Any number of rows by id, as chips with a search box. Ids no longer in
 * `options` are not shown and are dropped on the next change.
 */
function IdMultiSelect({
  id,
  options,
  value,
  onChange,
  placeholder,
  listLabel,
  emptyText,
  disabled,
  limit,
  describedBy,
}: {
  id: string;
  options: readonly Option[];
  value: readonly string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
  listLabel: string;
  emptyText: string;
  disabled: boolean;
  limit?: number;
  describedBy?: string;
}) {
  const anchor = useComboboxAnchor();
  const selected = useMemo(
    () => options.filter((item) => value.includes(item.id)),
    [options, value],
  );
  return (
    <Combobox
      items={options as Option[]}
      multiple
      value={selected}
      disabled={disabled}
      limit={limit}
      itemToStringLabel={(item: Option) => item.name}
      isItemEqualToValue={(item: Option, other: Option) => item.id === other.id}
      onValueChange={(next: Option[]) => {
        onChange(next.map((item) => item.id));
      }}
    >
      <ComboboxChips ref={anchor} className="min-h-10 w-full min-w-0">
        <ComboboxValue>
          {(items: Option[]) => (
            <>
              {items.map((item) => (
                <ComboboxChip
                  key={item.id}
                  aria-label={item.name}
                  removeLabel={`Remove ${item.name}`}
                >
                  {item.name}
                </ComboboxChip>
              ))}
              <ComboboxChipsInput
                id={id}
                disabled={disabled}
                aria-describedby={describedBy}
                placeholder={items.length > 0 ? "" : placeholder}
              />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>{emptyText}</ComboboxEmpty>
        <ComboboxList aria-label={listLabel}>
          {(item: Option) => (
            <ComboboxItem key={item.id} value={item}>
              <span className="min-w-0 truncate">{item.name}</span>
              {item.hint == null ? null : (
                <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                  {item.hint}
                </span>
              )}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
