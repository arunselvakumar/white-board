import {
  ArrowLeft,
  ArrowLeftRight,
  ClipboardList,
  FolderKanban,
  Package,
  Truck,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  FormSkeleton,
  SkeletonGroup,
  SkeletonText,
  TableSkeleton,
  type SkeletonColumn,
  type SkeletonField,
} from "@repo/ui/components/skeleton-kit";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { cn } from "@repo/ui/lib/utils";

import {
  PageHeader,
  type PageHeaderBack,
} from "@/components/app-shell/page-header";
import { PageHeaderSkeleton } from "@/components/app-shell/page-header-skeleton";
import {
  STOCK_REGISTER_COLUMNS,
  STOCK_REGISTER_LABELS,
} from "@/src/procurement/domain/stock-register";

/*
 * Procurement and inventory while they load (ADR-0047). List pages keep
 * their title, chips and buttons real; these draw the filter bar whose
 * options come with the rows, the rows, and the detail pages.
 */

const WIDTHS = ["62%", "48%", "71%", "55%", "40%"];

/** The labels of a filter bar whose options come with the rows. */
export function FilterBarSkeleton({
  labels,
  className = "grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end",
}: {
  labels: string[];
  className?: string;
}) {
  return (
    <div aria-hidden="true" className={className}>
      {labels.map((label) => (
        <div key={label} className="min-w-0 space-y-1">
          <p className="text-xs leading-none font-medium">{label}</p>
          <Skeleton className="h-10 w-full rounded-lg sm:w-44" />
        </div>
      ))}
    </div>
  );
}

/** A phone card: number, a muted line, badges and a figure, the row menu. */
function CardRows({
  rows,
  label,
  lines = 1,
}: {
  rows: number;
  label: string;
  lines?: 1 | 2;
}) {
  return (
    <SkeletonGroup label={label} className="block md:hidden">
      <ul className="space-y-2">
        {Array.from({ length: rows }, (_, row) => (
          <li key={row} className="bg-card rounded-lg border p-3">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <SkeletonText size="base" width="7rem" />
                <SkeletonText size="xs" width={WIDTHS[row % WIDTHS.length]} />
                {lines === 2 ? (
                  <SkeletonText
                    className="mt-1"
                    width={WIDTHS[(row + 2) % WIDTHS.length]}
                  />
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
              </div>
              <Skeleton className="size-8 shrink-0 rounded-lg" />
            </div>
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

/**
 * A list that is a table from `md` up and cards below it, under the
 * filter bar and the "N items" line that come with the rows.
 */
export function ResponsiveListSkeleton({
  columns,
  label,
  filters,
  count = true,
  rows = 5,
  lines = 1,
  className,
}: {
  columns: SkeletonColumn[];
  label: string;
  /** Filter labels drawn above the rows. */
  filters?: string[];
  count?: boolean;
  rows?: number;
  /** Lines under the number on the phone card. */
  lines?: 1 | 2;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      {filters == null ? null : <FilterBarSkeleton labels={filters} />}
      {count ? (
        <div aria-hidden="true">
          <SkeletonText width="8rem" />
        </div>
      ) : null}
      <TableSkeleton
        columns={columns}
        rows={rows}
        label={label}
        className="hidden md:block"
      />
      <CardRows rows={rows} label={label} lines={lines} />
    </div>
  );
}

type DetailSection = {
  title: string;
  columns: SkeletonColumn[];
  rows?: number;
};

/**
 * A procurement document while it loads: the real back link, the number
 * and badges as bars, the facts' real labels with bars for values, then
 * each line-item section's real heading and columns.
 *
 * `header: "link"` is the small back link and `text-xl` number the
 * Purchase Request, Order and Transfer pages use; `"page"` is `PageHeader`.
 */
export function DocumentDetailSkeleton({
  back,
  header = "link",
  label,
  facts,
  factsClassName = "bg-card grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-3",
  sections = [],
  className = "w-full max-w-4xl space-y-6",
  children,
}: {
  back: { label: string; href: string };
  header?: "link" | "page";
  label: string;
  facts: string[];
  factsClassName?: string;
  sections?: DetailSection[];
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={className}>
      {header === "page" ? (
        <PageHeaderSkeleton back={back} />
      ) : (
        <div className="space-y-3">
          <Link
            href={back.href}
            className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            {back.label}
          </Link>
          <div aria-hidden="true" className="space-y-1">
            <SkeletonText size="xl" width="9rem" />
            <div className="flex flex-wrap gap-1">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          </div>
        </div>
      )}
      <SkeletonGroup label={label} className="block space-y-6">
        <dl className={factsClassName}>
          {facts.map((fact, index) => (
            <div key={fact} className="min-w-0">
              <dt className="text-muted-foreground text-xs">{fact}</dt>
              <dd className="mt-0.5">
                <SkeletonText width={WIDTHS[index % WIDTHS.length]} />
              </dd>
            </div>
          ))}
        </dl>
        {sections.map((section) => (
          <section key={section.title} className="space-y-2">
            <h3 className="font-semibold">{section.title}</h3>
            <div className="overflow-x-auto">
              <TableSkeleton
                columns={section.columns}
                rows={section.rows ?? 3}
              />
            </div>
          </section>
        ))}
        {children}
      </SkeletonGroup>
    </div>
  );
}

/** A fact whose value loads on its own (a site location's name). */
export function FactValueSkeleton() {
  return (
    <SkeletonGroup label="Loading" className="block">
      <SkeletonText width="6rem" />
    </SkeletonGroup>
  );
}

/** A strip of photo thumbnails, while the photos load. */
export function PhotoStripSkeleton({ count = 3 }: { count?: number }) {
  return (
    <SkeletonGroup label="Loading photos" className="flex flex-wrap gap-2">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="size-16 rounded-md" />
      ))}
    </SkeletonGroup>
  );
}

/** An add or edit page while its record or options load. */
export function ProcurementFormSkeleton({
  back,
  title,
  fields,
  columns = 2,
  label,
  children,
}: {
  back: PageHeaderBack;
  /** Known titles render for real; leave it out when it is data. */
  title?: ReactNode;
  fields: SkeletonField[];
  columns?: 1 | 2;
  label: string;
  /** Line items or other sections under the fields. */
  children?: ReactNode;
}) {
  return (
    <div className="space-y-6">
      {title == null ? (
        <PageHeaderSkeleton back={back} meta={false} />
      ) : (
        <PageHeader back={back} title={title} />
      )}
      <FormSkeleton
        columns={columns}
        fields={fields}
        label={label}
        className="bg-card rounded-xl border p-4 sm:p-5"
        actions={0}
      />
      {children}
      {children == null ? (
        <div className="flex justify-end gap-2">
          <Skeleton className="h-9 w-24" />
        </div>
      ) : null}
    </div>
  );
}

const ACTIONS: SkeletonColumn = {
  header: <span className="sr-only">Actions</span>,
  kind: "actions",
  className: "w-12",
};

const SELECT: SkeletonColumn = {
  header: <span className="sr-only">Select</span>,
  kind: "checkbox",
  className: "w-10",
};

/** Purchase Requests: the filter bar, the count, the rows. */
export function PurchaseRequestRowsSkeleton({ bulk }: { bulk: boolean }) {
  return (
    <ResponsiveListSkeleton
      label="Loading Purchase Requests"
      lines={2}
      filters={[
        "Date",
        "Material Category",
        "Material",
        "Created By",
        "Location Type",
      ]}
      columns={[
        ...(bulk ? [SELECT] : []),
        { header: "Number" },
        { header: "Date", kind: "muted" },
        { header: "Materials", kind: "muted" },
        { header: "Required", kind: "muted" },
        { header: "Status", kind: "badge" },
        { header: "Created By", kind: "muted" },
        ACTIONS,
      ]}
    />
  );
}

/** A Purchase Request's page: facts, Materials, Purchase Orders. */
export function PurchaseRequestDetailSkeleton({
  projectId,
}: {
  projectId: string;
}) {
  return (
    <DocumentDetailSkeleton
      back={{
        label: "Purchase Requests",
        href: `/app/projects/${encodeURIComponent(projectId)}/materials/purchase-requests`,
      }}
      label="Loading Purchase Request"
      facts={[
        "Purchase Request Date",
        "Required Date",
        "Location",
        "Raised by",
        "Raised on",
        "Source",
      ]}
      sections={[
        {
          title: "Materials",
          columns: [
            { header: "Material" },
            { header: "Category", kind: "muted" },
            { header: "Requested", kind: "number", className: "text-right" },
            { header: "Ordered", kind: "number", className: "text-right" },
            { header: "Pending", kind: "number", className: "text-right" },
          ],
        },
      ]}
    />
  );
}

/** A material's "Available Stock · Balanced estimated qty" line while it loads. */
export function StockLineSkeleton() {
  return (
    <SkeletonGroup label="Loading stock" className="block">
      <SkeletonText size="xs" width="16rem" />
    </SkeletonGroup>
  );
}

/** A form section as the Purchase Order form draws it: a bordered card. */
function FormCardSkeleton({
  title,
  fields,
}: {
  title: string;
  fields: SkeletonField[];
}) {
  return (
    <section className="bg-card space-y-4 rounded-lg border p-4">
      <h3 className="font-semibold">{title}</h3>
      <FormSkeleton columns={2} actions={0} fields={fields} />
    </section>
  );
}

/** Add or Edit Purchase Order while its options (and the order) load. */
export function PurchaseOrderFormSkeleton() {
  return (
    <SkeletonGroup
      label="Loading Purchase Order"
      className="block w-full max-w-4xl space-y-6"
    >
      <FormCardSkeleton
        title="Order"
        fields={[
          { label: "Purchase Order Date" },
          { label: "Purchase Request Number", control: "select" },
          { label: "Supplier", control: "select" },
          { label: "Expected Delivery Date" },
        ]}
      />
      <FormCardSkeleton
        title="Materials"
        fields={[{ label: "Add a material", control: "select", wide: true }]}
      />
      <FormCardSkeleton
        title="Charges"
        fields={[
          { label: "Additional Charges" },
          { label: "Deduction Amount" },
        ]}
      />
    </SkeletonGroup>
  );
}

/** "Edit PO-0012" over the form, while the document loads. */
export function EditDocumentSkeleton({ children }: { children: ReactNode }) {
  return (
    <div className="w-full space-y-4">
      <div aria-hidden="true">
        <SkeletonText size="lg" width="10rem" />
      </div>
      {children}
    </div>
  );
}

const PR_STEPS = ["Materials", "Quantity", "Details"];

/** The Purchase Request wizard's first step, while the request loads. */
export function PurchaseRequestWizardSkeleton() {
  return (
    <div className="w-full max-w-4xl space-y-6">
      <ol aria-hidden="true" className="flex gap-2">
        {PR_STEPS.map((label, index) => (
          <li
            key={label}
            className={cn(
              "bg-card flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-sm",
              index === 0
                ? "border-primary bg-primary/5 font-medium"
                : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-xs",
                index === 0 ? "bg-primary text-primary-foreground" : "bg-muted",
              )}
            >
              {index + 1}
            </span>
            <span className="truncate">{label}</span>
          </li>
        ))}
      </ol>
      <FormSkeleton
        label="Loading Purchase Request"
        className="bg-card rounded-xl border p-4 sm:p-5"
        fields={[{ label: "Add a material", control: "select" }]}
        actions={0}
      />
      <div className="flex justify-end gap-2">
        <Skeleton className="h-9 w-24" />
      </div>
    </div>
  );
}

const number = (header: string): SkeletonColumn => ({
  header,
  kind: "number",
  className: "text-right",
});

/** A Purchase Order's page: facts, then its lines. */
export function PurchaseOrderDetailSkeleton({
  projectId,
}: {
  projectId: string;
}) {
  return (
    <DocumentDetailSkeleton
      className="w-full max-w-5xl space-y-6"
      back={{
        label: "Purchase Orders",
        href: `/app/projects/${encodeURIComponent(projectId)}/materials/purchase-orders`,
      }}
      label="Loading Purchase Order"
      facts={[
        "Purchase Order Date",
        "Expected Delivery Date",
        "Purchase Request",
        "Supplier",
        "Billing Address",
        "Delivery Address",
        "Place of supply",
        "Supply type",
        "Location",
      ]}
      sections={[
        {
          title: "Materials",
          columns: [
            { header: "Material" },
            { header: "HSN", kind: "muted" },
            number("Qty"),
            number("Rate"),
            number("Discount"),
            number("Taxable"),
            number("CGST"),
            number("SGST"),
            number("Total"),
            number("Received"),
          ],
        },
      ]}
    />
  );
}

/** Purchase Orders: the filter bar, the count, the rows. */
export function PurchaseOrderRowsSkeleton({ bulk }: { bulk: boolean }) {
  return (
    <ResponsiveListSkeleton
      label="Loading Purchase Orders"
      filters={["Date", "Receipt status", "Supplier"]}
      columns={[
        ...(bulk ? [SELECT] : []),
        { header: "Number" },
        { header: "Date", kind: "muted" },
        { header: "Supplier", kind: "muted" },
        { header: "Expected", kind: "muted" },
        { header: "Status", kind: "badge" },
        number("Total"),
        ACTIONS,
      ]}
    />
  );
}

/** Goods Received: the count and the receipts table. */
export function GoodsReceiptRowsSkeleton() {
  return (
    <TableSkeleton
      count
      label="Loading Goods Receipts"
      columns={[
        { header: "GRN" },
        { header: "GR Date", kind: "muted" },
        { header: "Inventory Date", kind: "muted" },
        { header: "Supplier", kind: "muted" },
        { header: "Purchase Order", kind: "muted" },
        number("Lines"),
      ]}
    />
  );
}

const goodsReceivedHref = (projectId: string) =>
  `/app/projects/${encodeURIComponent(projectId)}/materials/goods-received`;

/** A Goods Receipt's page: facts, then the materials received. */
export function GoodsReceiptDetailSkeleton({
  projectId,
}: {
  projectId: string;
}) {
  return (
    <DocumentDetailSkeleton
      header="page"
      className="w-full space-y-8"
      factsClassName="grid gap-4 sm:grid-cols-3"
      back={{ label: "Goods Received", href: goodsReceivedHref(projectId) }}
      label="Loading Goods Receipt"
      facts={[
        "GR Date",
        "Inventory Date",
        "Supplier",
        "Purchase Order",
        "GST",
        "Received by",
      ]}
      sections={[
        {
          title: "Materials received",
          columns: [
            { header: "Material" },
            { header: "HSN", kind: "muted" },
            number("Received"),
            number("GST"),
          ],
        },
      ]}
    />
  );
}

/** Record or Edit Goods Receipt while its options load. */
export function GoodsReceiptFormSkeleton({
  projectId,
  receiptId,
  title,
}: {
  projectId: string;
  /** On Edit the back link goes to the receipt, whose number is data. */
  receiptId?: string;
  /** "Record Goods Receipt"; left out on Edit, where it is the number. */
  title?: string;
}) {
  const back =
    receiptId == null
      ? { label: "Goods Received", href: goodsReceivedHref(projectId) }
      : {
          label: "Goods Receipt",
          href: `${goodsReceivedHref(projectId)}/${encodeURIComponent(receiptId)}`,
        };
  return (
    <div className="w-full max-w-4xl space-y-6">
      {title == null ? (
        <PageHeaderSkeleton back={back} meta={false} />
      ) : (
        <PageHeader back={back} title={title} />
      )}
      <section className="bg-card space-y-4 rounded-xl border p-4 sm:p-5">
        <h2 className="font-semibold">Details</h2>
        <FormSkeleton
          columns={2}
          label="Loading Goods Receipt"
          actions={0}
          fields={[
            { label: "GR Date" },
            { label: "Inventory Date" },
            { label: "Supplier", control: "select" },
            { label: "Purchase Order", control: "select" },
            { label: "GST", control: "select" },
          ]}
        />
      </section>
    </div>
  );
}

/** Material Transfers: the count, then cards two to a row from `lg`. */
export function TransferRowsSkeleton() {
  return (
    <SkeletonGroup label="Loading transfers" className="block space-y-3">
      <SkeletonText width="6rem" />
      <ul className="grid gap-2 lg:grid-cols-2">
        {WIDTHS.map((width) => (
          <li key={width} className="bg-card rounded-lg border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-0.5">
                <SkeletonText size="base" width="7rem" />
                <SkeletonText width="45%" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <SkeletonText className="mt-1" width={width} />
            <SkeletonText size="xs" className="mt-0.5" width="55%" />
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

/** A Material Transfer's page: number and status, facts, its materials. */
export function TransferDetailSkeleton({ backHref }: { backHref: string }) {
  return (
    <div className="w-full max-w-4xl space-y-6">
      <div className="space-y-2">
        <Link
          href={backHref}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Material Transfers
        </Link>
        <div aria-hidden="true" className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <SkeletonText size="base" width="8rem" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <SkeletonText width="12rem" />
        </div>
      </div>
      <SkeletonGroup label="Loading transfer" className="block space-y-6">
        <dl className="bg-card grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
          {["From", "To", "Receiver Name", "Sent by"].map((fact, index) => (
            <div key={fact} className="min-w-0">
              <dt className="text-muted-foreground text-xs">{fact}</dt>
              <dd className="mt-0.5">
                <SkeletonText width={WIDTHS[index]} />
              </dd>
            </div>
          ))}
        </dl>
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Materials</h3>
          <ul className="bg-card divide-y rounded-lg border">
            {WIDTHS.slice(0, 3).map((width) => (
              <li
                key={width}
                className="flex items-start justify-between gap-3 px-3 py-2.5"
              >
                <SkeletonText width={width} />
                <SkeletonText width="4rem" />
              </li>
            ))}
          </ul>
        </section>
      </SkeletonGroup>
    </div>
  );
}

/** New or Edit Material Transfer while the places (and the transfer) load. */
export function TransferFormSkeleton({ title }: { title?: string }) {
  return (
    <div className="w-full space-y-4">
      {title == null ? (
        <div aria-hidden="true">
          <SkeletonText size="base" width="10rem" />
        </div>
      ) : (
        <h2 className="font-semibold">{title}</h2>
      )}
      <SkeletonGroup
        label="Loading transfer"
        className="block w-full max-w-4xl space-y-6"
      >
        <div className="bg-card space-y-6 rounded-xl border p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            {["Transfer Date", "From", "To"].map((field) => (
              <div key={field} className="space-y-1.5">
                <p className="text-sm leading-none font-medium">{field}</p>
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            ))}
          </div>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Transferred material</h3>
            <FormSkeleton
              columns={2}
              actions={0}
              fields={[
                { label: "Material", control: "select" },
                { label: "Quantity" },
              ]}
            />
          </section>
        </div>
        <div className="flex justify-end gap-2">
          <Skeleton className="h-9 w-24" />
        </div>
      </SkeletonGroup>
    </div>
  );
}

const POSITION_COLUMNS: SkeletonColumn[] = [
  { header: "Location" },
  number("Stock"),
  number("In transit"),
  { header: "State", kind: "badge" },
];

/** Central Inventory's per-material cards: name, total, stock by location. */
export function StockPositionsSkeleton() {
  return (
    <SkeletonGroup label="Loading stock" className="block">
      <ul className="space-y-3">
        {WIDTHS.slice(0, 3).map((width) => (
          <li key={width} className="bg-card space-y-2 rounded-xl border p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <div className="min-w-0 flex-1">
                <SkeletonText width={width} className="max-w-56" />
                <SkeletonText size="xs" width="6rem" />
              </div>
              <SkeletonText width="5rem" />
            </div>
            <TableSkeleton
              bordered={false}
              rows={2}
              columns={POSITION_COLUMNS}
            />
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

/** Central Inventory while it first loads: the real header and filters' labels. */
export function CentralInventorySkeleton() {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-5xl space-y-6">
        <PageHeader
          back={{
            label: "Central Store",
            href: "/app/workspace/central-store",
          }}
          title="Central Inventory"
          meta="Stock across every Project and Store."
        />
        <div aria-hidden="true" className="grid gap-4 sm:grid-cols-3">
          {["Locations", "Category", "Stock state"].map((label, index) => (
            <div
              key={label}
              className={cn(
                "min-w-0 space-y-1.5",
                index === 0 && "sm:col-span-3",
              )}
            >
              <p className="text-sm leading-none font-medium">{label}</p>
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          ))}
        </div>
        <StockPositionsSkeleton />
      </div>
    </div>
  );
}

/** The Stock Ledger table while the chosen period loads. */
export function StockLedgerSkeleton({ movements }: { movements: string[] }) {
  return (
    <div className="overflow-x-auto">
      <TableSkeleton
        label="Loading Stock Ledger"
        rows={4}
        columns={[
          { header: "Location" },
          { header: "Material", kind: "muted" },
          ...movements.map(number),
          number("Closing stock"),
        ]}
      />
    </div>
  );
}

/** Current Inventory of a Project or Store while its stock loads. */
export function InventorySkeleton() {
  return (
    <div className="w-full space-y-4">
      <div className="min-w-0 space-y-0.5">
        <h2 className="font-semibold">Current Inventory</h2>
        <div aria-hidden="true">
          <SkeletonText width="14rem" />
        </div>
      </div>
      <div
        aria-hidden="true"
        className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
      >
        <Skeleton className="h-10 w-full rounded-lg sm:max-w-xs" />
        <Skeleton className="h-10 w-full rounded-lg sm:w-52" />
        <Skeleton className="h-10 w-full rounded-lg sm:w-40" />
      </div>
      <ResponsiveListSkeleton
        count={false}
        label="Loading stock"
        columns={[
          SELECT,
          { header: "Material" },
          number("Estimated"),
          number("In stock"),
          number("In transit"),
          number("Minimum"),
          { header: "State", kind: "badge" },
          ACTIONS,
        ]}
      />
    </div>
  );
}

/** Material Requests or Delivery Notes: number, a muted line, the status. */
export function RequestRowsSkeleton({
  label,
  count = true,
}: {
  label: string;
  /** The "N requests" line; Delivery Notes have none. */
  count?: boolean;
}) {
  return (
    <SkeletonGroup label={label} className="block space-y-3">
      {count ? (
        <div className="flex min-h-8 items-center">
          <SkeletonText width="6rem" />
        </div>
      ) : null}
      <ul className="bg-card divide-y rounded-xl border">
        {WIDTHS.map((width) => (
          <li
            key={width}
            className="flex min-w-0 items-center gap-x-3 px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <SkeletonText width="7rem" />
              <SkeletonText size="xs" width={width} />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

const STORE_TABS = [
  { label: "Stock", icon: Package },
  { label: "Projects", icon: FolderKanban },
  { label: "Material Requests", icon: ClipboardList },
  { label: "Delivery Notes", icon: Truck },
  { label: "Transfers", icon: ArrowLeftRight },
];

/** A Central Store's page while it loads: the real tabs over the Stock tab. */
export function StoreDetailSkeleton() {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-5xl space-y-6">
        <PageHeaderSkeleton
          back={{
            label: "Central Store",
            href: "/app/workspace/central-store",
          }}
        />
        <Tabs defaultValue="Stock" className="gap-4">
          <TabsList>
            {STORE_TABS.map(({ label, icon: Icon }, index) => (
              <TabsTrigger key={label} value={label} disabled={index > 0}>
                <Icon aria-hidden="true" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          <InventorySkeleton />
        </Tabs>
      </div>
    </div>
  );
}

/** A Material Request's page: facts, its materials, its Delivery Notes. */
export function MaterialRequestDetailSkeleton({
  back,
}: {
  back: { label: string; href: string };
}) {
  return (
    <DocumentDetailSkeleton
      header="page"
      className="w-full max-w-5xl space-y-6"
      factsClassName="bg-card grid grid-cols-2 gap-3 rounded-xl border p-4 sm:grid-cols-3"
      back={back}
      label="Loading Material Request"
      facts={[
        "Request Date",
        "Request To",
        "Project",
        "Contractor",
        "Department",
        "Receiver",
      ]}
      sections={[
        {
          title: "Materials",
          columns: [
            { header: "Material" },
            number("Ask Qty"),
            number("Delivered"),
            number("On the way"),
            number("Pending"),
          ],
        },
      ]}
    />
  );
}

/** A Delivery Note's page: facts, then its materials. */
export function DeliveryNoteDetailSkeleton() {
  return (
    <DocumentDetailSkeleton
      header="page"
      className="w-full max-w-5xl space-y-6"
      factsClassName="bg-card grid grid-cols-2 gap-3 rounded-xl border p-4 sm:grid-cols-3"
      back={{ label: "Central Store", href: "/app/workspace/central-store" }}
      label="Loading Delivery Note"
      facts={[
        "Material Request",
        "From",
        "To",
        "Delivery Date",
        "Delivered To",
        "Delivered On",
      ]}
      sections={[
        {
          title: "Materials",
          columns: [
            { header: "Material" },
            number("Requested"),
            number("Pending"),
            number("Delivered"),
          ],
        },
      ]}
    />
  );
}

/** The Stock Register table for the chosen period. */
export function StockRegisterTableSkeleton() {
  return (
    <div className="overflow-x-auto">
      <TableSkeleton
        label="Loading Stock Register"
        rows={5}
        columns={[
          { header: "Material", className: "min-w-44" },
          ...STOCK_REGISTER_COLUMNS.map((column) => ({
            header: STOCK_REGISTER_LABELS[column],
            kind: "number" as const,
            className: "text-right whitespace-nowrap",
          })),
        ]}
      />
    </div>
  );
}

/** The Stock Register page while the viewer's rights load. */
export function StockRegisterSkeleton({ backHref }: { backHref: string }) {
  return (
    <div className="w-full space-y-4">
      <div className="space-y-1">
        <Link
          href={backHref}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Current Inventory
        </Link>
        <h2 className="font-semibold">Stock Register</h2>
      </div>
      <div aria-hidden="true" className="flex flex-wrap items-end gap-3">
        {["From", "To"].map((label) => (
          <div key={label} className="space-y-1">
            <p className="text-xs leading-none font-medium">{label}</p>
            <Skeleton className="h-10 w-40 rounded-lg" />
          </div>
        ))}
      </div>
      <StockRegisterTableSkeleton />
    </div>
  );
}

/** A material's stock history in its sheet: the summary, then entries. */
export function StockHistorySkeleton() {
  return (
    <SkeletonGroup label="Loading history" className="block space-y-3">
      <SkeletonText width="12rem" />
      <ol className="space-y-2">
        {WIDTHS.slice(0, 4).map((width) => (
          <li
            key={width}
            className="bg-card space-y-1 rounded-lg border px-3 py-2.5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-0.5">
                <SkeletonText width="7rem" />
                <SkeletonText size="xs" width={width} />
              </div>
              <div className="flex flex-col items-end">
                <SkeletonText width="4.5rem" />
                <SkeletonText size="xs" width="5rem" />
              </div>
            </div>
            <SkeletonText size="xs" width="8rem" />
          </li>
        ))}
      </ol>
    </SkeletonGroup>
  );
}

/** A one-line value that loads on its own, in a small muted line. */
export function SmallLineSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <SkeletonGroup label={label} className="block">
      <SkeletonText size="xs" width="8rem" />
    </SkeletonGroup>
  );
}

/** Rows in the open material picker while its first page loads. */
export function PickerOptionsSkeleton({
  label = "Loading materials",
}: {
  label?: string;
}) {
  return (
    <SkeletonGroup label={label} className="block p-1">
      {["70%", "52%", "61%"].map((width) => (
        <div key={width} className="px-2 py-2">
          <SkeletonText width={width} />
        </div>
      ))}
    </SkeletonGroup>
  );
}

/** The thread of a document section (files, remarks) while it loads. */
export function DocumentSectionSkeleton() {
  return (
    <SkeletonGroup label="Loading" className="block space-y-3">
      {["58%", "40%"].map((width) => (
        <div key={width} className="flex items-center gap-3">
          <Skeleton className="size-9 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-1">
            <SkeletonText width={width} />
            <SkeletonText size="xs" width="30%" />
          </div>
        </div>
      ))}
    </SkeletonGroup>
  );
}

const CENTRAL_STORE = "/app/workspace/central-store";

/** Central Store's list of stores while it loads. */
export function StoresPageSkeleton() {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Workspace", href: "/app/workspace" }}
          title="Central Store"
          meta={<SkeletonText width="5rem" />}
        />
        <SkeletonGroup label="Loading stores" className="block">
          <ul className="grid gap-3 sm:grid-cols-2">
            {WIDTHS.slice(0, 4).map((width) => (
              <li
                key={width}
                className="bg-card flex min-w-0 items-center gap-3 rounded-xl border p-3"
              >
                <Skeleton className="size-10 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <SkeletonText width={width} />
                  <SkeletonText size="xs" width="60%" />
                </div>
              </li>
            ))}
          </ul>
        </SkeletonGroup>
      </div>
    </div>
  );
}

/** Add or Edit store while its options (and the store) load. */
export function StoreFormSkeleton({ storeId }: { storeId?: string }) {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl">
        <ProcurementFormSkeleton
          back={
            storeId == null
              ? { label: "Central Store", href: CENTRAL_STORE }
              : {
                  label: "Store",
                  href: `${CENTRAL_STORE}/${encodeURIComponent(storeId)}`,
                }
          }
          title={storeId == null ? "Add store" : "Edit store"}
          label="Loading store"
          fields={[
            { label: "Store name" },
            { label: "GST state", control: "select" },
            { label: "Store address", control: "textarea", wide: true },
            { label: "Projects", control: "select", wide: true },
          ]}
        />
      </div>
    </div>
  );
}

/** Raise or Edit Material Request while its options load. */
export function MaterialRequestFormSkeleton({
  projectId,
  title,
}: {
  projectId: string;
  /** "Raise Material Request"; left out on Edit, where it is the number. */
  title?: string;
}) {
  return (
    <div className="w-full max-w-4xl">
      <ProcurementFormSkeleton
        back={{
          label: "Material Requests",
          href: `/app/projects/${encodeURIComponent(projectId)}/materials/material-requests`,
        }}
        title={title}
        label="Loading Material Request"
        fields={[
          { label: "Request Date" },
          { label: "Request To", control: "select" },
          { label: "Contractor", control: "select" },
          { label: "Department", control: "select" },
          { label: "Receiver Name" },
          { label: "Remark", control: "textarea", wide: true },
        ]}
      />
    </div>
  );
}

/** Create or Edit Delivery Note while the request (and note) load. */
export function DeliveryNoteFormSkeleton({ title }: { title?: string }) {
  return (
    <div className="w-full max-w-4xl">
      <ProcurementFormSkeleton
        back={{ label: "Material Request", href: CENTRAL_STORE }}
        title={title}
        label="Loading Delivery Note"
        fields={[
          { label: "Delivery Date" },
          { label: "Delivered To" },
          { label: "Remark", control: "textarea", wide: true },
        ]}
      />
    </div>
  );
}
