"use client";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@repo/ui/components/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

import { formatPaise } from "@/components/money/money-input";

export const GRN_FIELD_LABELS = {
  invoiceNo: "Invoice No",
  invoiceDate: "Invoice Date",
  invoiceAmount: "Invoice Amount",
  deliveryChallanNo: "Delivery Challan No",
  grnDcNo: "GRN/DC No",
  vehicleNo: "Vehicle No",
  driverName: "Driver name",
  driverMobile: "Driver mobile",
  ewayBillNo: "E-way bill No",
  remark: "Remark",
} as const;

export type GrnField = keyof typeof GRN_FIELD_LABELS;

export const SUPPLIER_FIELDS = [
  "invoiceNo",
  "invoiceDate",
  "invoiceAmount",
] as const satisfies readonly GrnField[];

export const DELIVERY_FIELDS = [
  "deliveryChallanNo",
  "grnDcNo",
  "vehicleNo",
  "driverName",
  "driverMobile",
  "ewayBillNo",
] as const satisfies readonly GrnField[];

export const SUPPLY_TYPE_LABELS = {
  intra_state: "Intra-state (CGST + SGST)",
  inter_state: "Inter-state (IGST)",
} as const;

/** `2026-10-04` → `4 Oct 2026`. */
export function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** Paise as rupees, or a dash when hidden (no Financial). */
export function money(paise: number | null | undefined): string {
  return paise == null ? "—" : formatPaise(paise);
}

/** `12.500` → `12.5`; `40.000` → `40`. */
export function qty(value: string | null | undefined): string {
  if (value == null) return "—";
  return value.includes(".")
    ? value.replace(/0+$/, "").replace(/\.$/, "")
    : value;
}

/** Today on this device, `YYYY-MM-DD`. */
export function localToday(now: Date = new Date()): string {
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function goodsReceivedPath(projectId: string, rest = ""): string {
  return `/app/projects/${encodeURIComponent(projectId)}/materials/goods-received${rest}`;
}

/** A labelled `Select` over `{ value, label }` choices. */
export function ChoiceSelect({
  id,
  label,
  value,
  items,
  onChange,
  invalid,
  disabled,
  className,
}: {
  id?: string;
  label: string;
  value: string;
  items: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Select
      items={items}
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (next != null) onChange(next);
      }}
    >
      <SelectTrigger
        id={id}
        size="lg"
        aria-label={label}
        aria-invalid={invalid}
        className={className ?? "w-full min-w-0"}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        align="start"
        alignItemWithTrigger={false}
        aria-label={label}
      >
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function GoodsReceiptNoAccess({ what }: { what: string }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyTitle>No access to {what}</EmptyTitle>
        <EmptyDescription>
          Ask the Owner to give you Material Received in your Permission Matrix.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
