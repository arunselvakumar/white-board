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
import { pageHref } from "@/lib/page-href";

export { formatQuantity } from "@/src/queries/central-inventory";

export const CENTRAL_STORE_PATH = "/app/workspace/central-store";
export const CENTRAL_INVENTORY_PATH = "/app/workspace/central-inventory";

// `as const` keeps the two static pages literal, so they stay checked links.
export const centralStoreHref = {
  stores: CENTRAL_STORE_PATH,
  newStore: "/app/workspace/central-store/new",
  store: (id: string) => pageHref("/app/workspace/central-store/[id]", { id }),
  editStore: (id: string) =>
    pageHref("/app/workspace/central-store/[id]/edit", { id }),
  request: (id: string) =>
    pageHref("/app/workspace/central-store/material-requests/[id]", { id }),
  newNote: (requestId: string) =>
    pageHref(
      "/app/workspace/central-store/material-requests/[id]/delivery-notes/new",
      { id: requestId },
    ),
  note: (id: string) =>
    pageHref("/app/workspace/central-store/delivery-notes/[id]", { id }),
  editNote: (id: string) =>
    pageHref("/app/workspace/central-store/delivery-notes/[id]/edit", { id }),
  register: (storeId: string) =>
    pageHref("/app/workspace/central-store/[id]/register", { id: storeId }),
  transfer: (storeId: string, transferId: string) =>
    pageHref("/app/workspace/central-store/[id]/transfers/[transferId]", {
      id: storeId,
      transferId,
    }),
  editTransfer: (storeId: string, transferId: string) =>
    pageHref("/app/workspace/central-store/[id]/transfers/[transferId]/edit", {
      id: storeId,
      transferId,
    }),
  newTransfer: (storeId: string) =>
    pageHref("/app/workspace/central-store/[id]/transfers/new", {
      id: storeId,
    }),
} as const;

/** A Project's Material Request pages. */
export const projectRequestHref = {
  list: (projectId: string) =>
    pageHref("/app/projects/[id]/materials/material-requests", {
      id: projectId,
    }),
  create: (projectId: string) =>
    pageHref("/app/projects/[id]/materials/material-requests/new", {
      id: projectId,
    }),
  detail: (projectId: string, id: string) =>
    pageHref("/app/projects/[id]/materials/material-requests/[requestId]", {
      id: projectId,
      requestId: id,
    }),
  edit: (projectId: string, id: string) =>
    pageHref(
      "/app/projects/[id]/materials/material-requests/[requestId]/edit",
      { id: projectId, requestId: id },
    ),
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
  required = false,
}: {
  id: string;
  label: string;
  items: readonly Named[];
  value: readonly string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
  invalid?: boolean;
  /** Sets `aria-required` on the control; the label shows the asterisk. */
  required?: boolean;
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
                aria-required={required}
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
      className={`focus-visible:ring-ring overflow-x-auto outline-none focus-visible:ring-2 [&>[data-slot=table-container]]:overflow-visible ${bordered ? "bg-card rounded-xl border" : ""}`}
    >
      {children}
    </div>
  );
}
