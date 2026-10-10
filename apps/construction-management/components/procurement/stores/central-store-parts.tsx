"use client";

import { useMemo, type ReactNode } from "react";
import { Badge } from "@repo/ui/components/badge";
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

import { materialsPath } from "@/components/procurement/materials-hub/materials-tabs";
import {
  STOCK_STATE_LABELS,
  type StockState,
} from "@/src/queries/central-inventory";
import {
  DELIVERY_NOTE_STATUS_LABELS,
  type DeliveryNoteStatus,
} from "@/src/queries/delivery-notes";
import {
  MATERIAL_REQUEST_STATUS_LABELS,
  type MaterialRequestStatus,
} from "@/src/queries/material-requests";

export { formatQuantity } from "@/src/queries/central-inventory";

/** Workspace → Central Store and its pages (CM-508). */
export const CENTRAL_STORE_PATH = "/app/workspace/central-store";
export const CENTRAL_INVENTORY_PATH = "/app/workspace/central-inventory";

export const centralStoreHref = {
  stores: CENTRAL_STORE_PATH,
  newStore: `${CENTRAL_STORE_PATH}/new`,
  store: (id: string) => `${CENTRAL_STORE_PATH}/${encodeURIComponent(id)}`,
  editStore: (id: string) =>
    `${CENTRAL_STORE_PATH}/${encodeURIComponent(id)}/edit`,
  request: (id: string) =>
    `${CENTRAL_STORE_PATH}/material-requests/${encodeURIComponent(id)}`,
  newNote: (requestId: string) =>
    `${CENTRAL_STORE_PATH}/material-requests/${encodeURIComponent(requestId)}/delivery-notes/new`,
  note: (id: string) =>
    `${CENTRAL_STORE_PATH}/delivery-notes/${encodeURIComponent(id)}`,
  editNote: (id: string) =>
    `${CENTRAL_STORE_PATH}/delivery-notes/${encodeURIComponent(id)}/edit`,
};

/** A Project's Materials → Material Requests pages. */
export const projectRequestHref = {
  list: (projectId: string) => materialsPath(projectId, "material-requests"),
  create: (projectId: string) =>
    `${materialsPath(projectId, "material-requests")}/new`,
  detail: (projectId: string, id: string) =>
    `${materialsPath(projectId, "material-requests")}/${encodeURIComponent(id)}`,
  edit: (projectId: string, id: string) =>
    `${materialsPath(projectId, "material-requests")}/${encodeURIComponent(id)}/edit`,
};

const REQUEST_VARIANTS: Record<
  MaterialRequestStatus,
  "secondary" | "outline" | "default" | "destructive"
> = {
  requested: "secondary",
  partially_delivered: "outline",
  delivered: "default",
  closed: "destructive",
};

export function MaterialRequestStatusBadge({
  status,
}: {
  status: MaterialRequestStatus;
}) {
  return (
    <Badge variant={REQUEST_VARIANTS[status]}>
      {MATERIAL_REQUEST_STATUS_LABELS[status]}
    </Badge>
  );
}

const NOTE_VARIANTS: Record<
  DeliveryNoteStatus,
  "secondary" | "outline" | "default"
> = { pending: "secondary", in_transit: "outline", delivered: "default" };

export function DeliveryNoteStatusBadge({
  status,
}: {
  status: DeliveryNoteStatus;
}) {
  return (
    <Badge variant={NOTE_VARIANTS[status]}>
      {DELIVERY_NOTE_STATUS_LABELS[status]}
    </Badge>
  );
}

const STATE_VARIANTS: Record<
  StockState,
  "secondary" | "outline" | "destructive"
> = {
  in_stock: "secondary",
  low_stock: "outline",
  out_of_stock: "destructive",
};

export function StockStateBadge({ state }: { state: StockState }) {
  return (
    <Badge variant={STATE_VARIANTS[state]}>{STOCK_STATE_LABELS[state]}</Badge>
  );
}

/** `2026-10-10` as `10 Oct 2026`. */
export function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

type Named = { id: string; name: string };

/** Pick any number of named rows (Projects, store keepers, Suppliers). */
export function NamedMultiSelect({
  id,
  label,
  items,
  value,
  onChange,
  placeholder,
  invalid = false,
}: {
  id: string;
  label: string;
  items: readonly Named[];
  value: readonly string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
  invalid?: boolean;
}) {
  const anchor = useComboboxAnchor();
  const selected = useMemo(
    () => items.filter((item) => value.includes(item.id)),
    [items, value],
  );
  return (
    <Combobox
      items={items as Named[]}
      multiple
      value={selected}
      itemToStringLabel={(item: Named) => item.name}
      isItemEqualToValue={(item: Named, other: Named) => item.id === other.id}
      onValueChange={(next: Named[]) => {
        onChange(next.map((item) => item.id));
      }}
    >
      <ComboboxChips
        ref={anchor}
        className="min-h-10 w-full"
        aria-invalid={invalid}
      >
        <ComboboxValue>
          {(chosen: Named[]) => (
            <>
              {chosen.map((item) => (
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
                aria-invalid={invalid}
                placeholder={chosen.length > 0 ? "" : placeholder}
              />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>Nothing found.</ComboboxEmpty>
        <ComboboxList aria-label={label}>
          {(item: Named) => (
            <ComboboxItem key={item.id} value={item}>
              {item.name}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

/**
 * A wide table on a phone: this box scrolls sideways (not the page), and
 * takes keyboard focus so the scroll is reachable without a mouse.
 */
export function ScrollRegion({
  label,
  bordered = true,
  children,
}: {
  label: string;
  bordered?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={`focus-visible:ring-ring overflow-x-auto outline-none focus-visible:ring-2 [&>[data-slot=table-container]]:overflow-visible ${bordered ? "rounded-xl border" : ""}`}
    >
      {children}
    </div>
  );
}
