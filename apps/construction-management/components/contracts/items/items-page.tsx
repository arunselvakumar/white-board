"use client";

import {
  keepPreviousData,
  useQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  BookOpenText,
  Download,
  FileDown,
  FileUp,
  Plus,
  Search,
} from "lucide-react";
import Link from "next/link";
import {
  Suspense,
  useDeferredValue,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@repo/ui/components/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { cn } from "@repo/ui/lib/utils";

import { PageHeader } from "@/components/app-shell/page-header";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  ITEM_SAMPLE_URL,
  itemExportUrl,
  itemSchedulesQuery,
  itemsQuery,
  useDeleteItem,
  type ItemListFilter,
  type ItemSummary,
} from "@/src/queries/contracts-items";
import type { Flag } from "@/src/shared-kernel/access";

import { ImportItemsDialog } from "./import-items-dialog";
import { ITEMS_PATH, gapOf, itemEditPath, money } from "./item-form-schema";
import { ITEM_COLUMNS, ItemRowsSkeleton } from "./items-skeletons";

const ALL_SCHEDULES = "__all__";

/** "+8.33 %" for the gap of the adopted rate over the analysed one. */
function gapText(item: ItemSummary): string | null {
  const gap = gapOf(item.adoptedRate, item.analysedRate);
  if (gap?.percent == null || gap.paise === 0) return null;
  const sign = gap.paise > 0 ? "+" : "−";
  return `${sign}${Math.abs(gap.percent).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })} %`;
}

/**
 * Master records → Item Library (CM-1102, ADR CM-0023 §3): the Company's
 * items and their adopted rates, with the rate analysis behind them. Search
 * by code or description, filter by schedule, import the Company's own
 * schedule from Excel and export what is shown. Actions show by the
 * caller's Item Library flags.
 */
export function ItemsPage() {
  const [search, setSearch] = useState("");
  const [schedule, setSchedule] = useState("");
  const [cursor, setCursor] = useState<ItemListFilter["cursor"]>(null);
  const [importing, setImporting] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const [paging, startPaging] = useTransition();
  const filter: ItemListFilter = { search: deferredSearch, schedule, cursor };
  // The same read as the rows below: the caller's flags for the actions.
  const flags: readonly Flag[] =
    useQuery({ ...itemsQuery(filter), placeholderData: keepPreviousData }).data
      ?.viewerFlags ?? [];
  const schedules = useQuery(itemSchedulesQuery()).data ?? [];
  const scheduleItems = [
    { value: ALL_SCHEDULES, label: "All schedules" },
    ...schedules.map((value) => ({ value, label: value })),
    ...(schedule !== "" && !schedules.includes(schedule)
      ? [{ value: schedule, label: schedule }]
      : []),
  ];

  const addLink = flags.includes("create") ? (
    <Link href={`${ITEMS_PATH}/new`} className={buttonVariants()}>
      <Plus aria-hidden="true" />
      Add Item
    </Link>
  ) : null;
  const importButton = flags.includes("import") ? (
    <Button
      type="button"
      variant="outline"
      onClick={() => {
        setImporting(true);
      }}
    >
      <FileUp aria-hidden="true" />
      Import
    </Button>
  ) : null;

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Masters", href: "/app/masters" }}
          title="Item Library"
          meta="The items you quote and bill, their adopted rates and the rate analysis behind them."
          actions={
            <>
              {flags.includes("import") ? (
                <a
                  href={ITEM_SAMPLE_URL}
                  download
                  className={buttonVariants({ variant: "ghost" })}
                >
                  <Download aria-hidden="true" />
                  Sample
                </a>
              ) : null}
              {importButton}
              {flags.includes("export") ? (
                <a
                  href={itemExportUrl({ search: deferredSearch, schedule })}
                  download
                  className={buttonVariants({ variant: "outline" })}
                >
                  <FileDown aria-hidden="true" />
                  Export
                </a>
              ) : null}
              {addLink}
            </>
          }
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <InputGroup className="h-9 sm:max-w-xs">
            <InputGroupAddon>
              <Search aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label="Search Items"
              placeholder="Search code or description"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setCursor(null);
              }}
            />
          </InputGroup>
          <Select
            items={scheduleItems}
            value={schedule === "" ? ALL_SCHEDULES : schedule}
            onValueChange={(next) => {
              if (next == null) return;
              setSchedule(next === ALL_SCHEDULES ? "" : next);
              setCursor(null);
            }}
          >
            <SelectTrigger
              aria-label="Schedule"
              className="h-9 w-full min-w-0 sm:w-56"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              align="start"
              alignItemWithTrigger={false}
              aria-label="Schedules"
            >
              {scheduleItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className={cn(paging && "opacity-60 transition-opacity")}>
          <Suspense fallback={<ItemRowsSkeleton />}>
            <ItemRows
              filter={filter}
              onPage={(next) => {
                startPaging(() => {
                  setCursor(next);
                });
              }}
              empty={
                <>
                  {addLink}
                  {importButton}
                </>
              }
            />
          </Suspense>
        </div>
        <ImportItemsDialog
          open={importing}
          onClose={() => {
            setImporting(false);
          }}
        />
      </div>
    </div>
  );
}

function ItemRows({
  filter,
  onPage,
  empty,
}: {
  filter: ItemListFilter;
  onPage: (cursor: ItemListFilter["cursor"]) => void;
  empty: ReactNode;
}) {
  const { data } = useSuspenseQuery(itemsQuery(filter));
  const remove = useDeleteItem();
  // Kept after the dialog closes so its text stays while it animates out.
  const [pending, setPending] = useState<ItemSummary | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const canEdit = data.viewerFlags.includes("update");
  const canDelete = data.viewerFlags.includes("delete");

  const filtered = filter.search.trim().length > 0 || filter.schedule !== "";
  if (data.items.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BookOpenText />
          </EmptyMedia>
          <EmptyTitle>
            {filtered ? "No Items match" : "No Items yet"}
          </EmptyTitle>
          <EmptyDescription>
            {filtered
              ? "Try another code, description or schedule."
              : "Add the items you quote, with their rate analysis, or import your own schedule (a DSR, a state SoR) from Excel."}
          </EmptyDescription>
        </EmptyHeader>
        {!filtered && <EmptyContent>{empty}</EmptyContent>}
      </Empty>
    );

  const codeCell = (item: ItemSummary) =>
    canEdit ? (
      <Link href={itemEditPath(item.id)} className="hover:underline">
        {item.code}
      </Link>
    ) : (
      item.code
    );

  const actions = (item: ItemSummary) => (
    <>
      {canEdit ? (
        <Link
          href={itemEditPath(item.id)}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
          aria-label={`Edit ${item.code}`}
        >
          Edit
        </Link>
      ) : null}
      {canDelete ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive"
          aria-label={`Delete ${item.code}`}
          onClick={() => {
            setError(undefined);
            setPending(item);
            setConfirming(true);
          }}
        >
          Delete
        </Button>
      ) : null}
    </>
  );

  const analysed = (item: ItemSummary) => {
    const gap = gapText(item);
    return (
      <>
        {money(item.analysedRate)}
        {gap == null ? null : (
          <span className="text-muted-foreground block text-xs">
            adopted {gap}
          </span>
        )}
      </>
    );
  };

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        {data.total} {data.total === 1 ? "Item" : "Items"}
      </p>
      <FormAlert message={confirming ? undefined : error} />
      <div className="hidden rounded-lg border md:block">
        <Table aria-label="Items">
          <TableHeader>
            <TableRow>
              {ITEM_COLUMNS.map((column, index) => (
                <TableHead key={index} className={column.className}>
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium tabular-nums">
                  {codeCell(item)}
                </TableCell>
                <TableCell className="max-w-72 whitespace-normal">
                  <span className="block">{item.shortDescription}</span>
                  {item.schedule == null ? null : (
                    <span className="text-muted-foreground block text-xs">
                      {item.schedule}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {item.uomName}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(item.adoptedRate)}
                </TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">
                  {analysed(item)}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">{actions(item)}</div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul aria-label="Items" className="space-y-2 md:hidden">
        {data.items.map((item) => (
          <li key={item.id} className="rounded-lg border p-3">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium tabular-nums">
                  {codeCell(item)}
                </p>
                <p className="text-sm break-words">{item.shortDescription}</p>
                {item.schedule == null ? null : (
                  <p className="text-muted-foreground truncate text-xs">
                    {item.schedule}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right text-sm tabular-nums">
                <p className="font-medium">{money(item.adoptedRate)}</p>
                <p className="text-muted-foreground text-xs">
                  per {item.uomName}
                </p>
              </div>
            </div>
            {item.analysedRate == null ? null : (
              <p className="text-muted-foreground mt-1 text-xs tabular-nums">
                Analysed {money(item.analysedRate)}
                {gapText(item) == null
                  ? ""
                  : ` · adopted ${gapText(item) ?? ""}`}
              </p>
            )}
            {canEdit || canDelete ? (
              <div className="mt-2 flex justify-end gap-1">{actions(item)}</div>
            ) : null}
          </li>
        ))}
      </ul>
      {(data.prevCursor != null || data.nextCursor != null) && (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={data.prevCursor == null}
            onClick={() => {
              if (data.prevCursor != null) onPage({ before: data.prevCursor });
            }}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={data.nextCursor == null}
            onClick={() => {
              if (data.nextCursor != null) onPage({ after: data.nextCursor });
            }}
          >
            Next
          </Button>
        </div>
      )}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pending?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.shortDescription}. An Item a BOQ uses cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FormAlert message={error} />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (pending == null) return;
                remove.mutate(pending, {
                  onSuccess: () => {
                    setConfirming(false);
                  },
                  onError: (failure) => {
                    setError(fieldForCode(failure, {}).message);
                  },
                });
              }}
            >
              {remove.isPending ? "Deleting…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
