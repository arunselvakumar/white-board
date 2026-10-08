"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  Download,
  HardHat,
  MoreHorizontal,
  Plus,
  Search,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { Suspense, useDeferredValue, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
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
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";

import { PageHeader } from "@/components/app-shell/page-header";
import { FormAlert } from "@/components/auth/form-alert";
import { formatPaise } from "@/components/money/money-input";
import { fieldForCode } from "@/lib/server-errors";
import {
  labourExportUrl,
  laboursQuery,
  useLabourCommand,
  type LabourListFilter,
  type LabourResponse,
} from "@/src/queries/labours";
import { lookupListQuery, supervisorsQuery } from "@/src/queries/masters";
import { projectOptionsQuery } from "@/src/queries/projects";

import { ImportDialog } from "./import-dialog";
import { LABOURS_PATH } from "./labour-form";
import { TransferDialog, type TransferTarget } from "./transfer-dialog";
import { TransferHistorySheet } from "./transfer-history-sheet";

const STATUS_FILTERS: { value: LabourListFilter["status"]; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const ALL = "all";

function editPath(id: string): string {
  return `${LABOURS_PATH}/${encodeURIComponent(id)}`;
}

function FilterSelect({
  label,
  allLabel,
  value,
  items,
  onChange,
}: {
  label: string;
  allLabel: string;
  value: string | null;
  items: { id: string; name: string }[];
  onChange: (value: string | null) => void;
}) {
  const choices = [
    { value: ALL, label: allLabel },
    ...items.map((item) => ({ value: item.id, label: item.name })),
  ];
  return (
    <Select
      items={choices}
      value={value ?? ALL}
      onValueChange={(next) => {
        onChange(next == null || next === ALL ? null : next);
      }}
    >
      <SelectTrigger aria-label={label} className="w-full sm:w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        align="start"
        alignItemWithTrigger={false}
        aria-label={label}
      >
        {choices.map((choice) => (
          <SelectItem key={choice.value} value={choice.value}>
            {choice.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Masters → Labours (CM-207): the register by Project, with transfer and import. */
export function LaboursPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<LabourListFilter["status"]>("all");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [supervisorId, setSupervisorId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<LabourListFilter["cursor"]>(null);
  const [importing, setImporting] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const projects = useQuery(projectOptionsQuery);
  const categories = useQuery(lookupListQuery("labour-categories"));
  const supervisors = useQuery(supervisorsQuery);

  const filter = {
    search: deferredSearch,
    status,
    projectId,
    categoryId,
    supervisorId,
  };
  const set =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setCursor(null);
    };

  const addLink = (
    <Link href={`${LABOURS_PATH}/new`} className={buttonVariants()}>
      <Plus aria-hidden="true" />
      Add Labour
    </Link>
  );

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-5xl space-y-6">
        <PageHeader
          back={{ label: "Masters", href: "/app/masters" }}
          title="Labours"
          meta="Your own labourers: wages, Project and transfers."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setImporting(true);
                }}
              >
                <Upload aria-hidden="true" />
                Import
              </Button>
              <a
                href={labourExportUrl(filter)}
                download
                className={buttonVariants({ variant: "outline" })}
              >
                <Download aria-hidden="true" />
                Export
              </a>
              {addLink}
            </div>
          }
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <InputGroup className="h-9 sm:max-w-xs">
            <InputGroupAddon>
              <Search aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label="Search Labours"
              placeholder="Search name, Labour Id or contact"
              value={search}
              onChange={(event) => {
                set(setSearch)(event.target.value);
              }}
            />
          </InputGroup>
          <ToggleGroup
            aria-label="Status"
            value={[status]}
            onValueChange={(value: string[]) => {
              const next = value[0] as LabourListFilter["status"] | undefined;
              if (next != null) set(setStatus)(next);
            }}
            variant="outline"
            size="sm"
          >
            {STATUS_FILTERS.map((item) => (
              <ToggleGroupItem key={item.value} value={item.value}>
                {item.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <FilterSelect
            label="Project"
            allLabel="All Projects"
            value={projectId}
            items={projects.data?.items ?? []}
            onChange={set(setProjectId)}
          />
          <FilterSelect
            label="Labour Category"
            allLabel="All categories"
            value={categoryId}
            items={categories.data?.items ?? []}
            onChange={set(setCategoryId)}
          />
          <FilterSelect
            label="Supervisor"
            allLabel="All Supervisors"
            value={supervisorId}
            items={supervisors.data?.items ?? []}
            onChange={set(setSupervisorId)}
          />
        </div>
        <Suspense fallback={<ListSkeleton />}>
          <LabourRows
            filter={{ ...filter, cursor }}
            onPage={setCursor}
            addLink={addLink}
            onImport={() => {
              setImporting(true);
            }}
          />
        </Suspense>
        <ImportDialog open={importing} onOpenChange={setImporting} />
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

type ConfirmKind = "activate" | "deactivate" | "delete";

const CONFIRM: Record<
  ConfirmKind,
  { title: (name: string) => string; body: string; action: string }
> = {
  activate: {
    title: (name) => `Activate ${name}?`,
    body: "They come back on the attendance screen of their Project.",
    action: "Activate",
  },
  deactivate: {
    title: (name) => `Deactivate ${name}?`,
    body: "They leave the attendance screen. Their attendance, payments and balance stay.",
    action: "Deactivate",
  },
  delete: {
    title: (name) => `Delete ${name}?`,
    body: "Only a labourer with no attendance and no payments can be deleted. Deactivate someone who has worked for you instead.",
    action: "Delete",
  },
};

function wageText(labour: LabourResponse): string {
  if (labour.wageType === "daily")
    return labour.wagePerDay == null
      ? "Daily"
      : `${formatPaise(labour.wagePerDay)} / day`;
  return labour.wagePerMonth == null
    ? "Monthly"
    : `${formatPaise(labour.wagePerMonth)} / month`;
}

function LabourRows({
  filter,
  onPage,
  addLink,
  onImport,
}: {
  filter: LabourListFilter;
  onPage: (cursor: LabourListFilter["cursor"]) => void;
  addLink: ReactNode;
  onImport: () => void;
}) {
  const { data } = useSuspenseQuery(laboursQuery(filter));
  const command = useLabourCommand();
  const [selected, setSelected] = useState<Map<string, TransferTarget>>(
    new Map(),
  );
  const [transferring, setTransferring] = useState<TransferTarget[] | null>(
    null,
  );
  const [history, setHistory] = useState<LabourResponse | null>(null);
  // Kept after the dialog closes so its text stays while it animates out.
  const [pending, setPending] = useState<{
    kind: ConfirmKind;
    labour: LabourResponse;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const filtered =
    filter.search.trim().length > 0 ||
    filter.status !== "all" ||
    filter.projectId != null ||
    filter.categoryId != null ||
    filter.supervisorId != null;
  if (data.items.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HardHat />
          </EmptyMedia>
          <EmptyTitle>
            {filtered ? "No labourers match" : "No labourers yet"}
          </EmptyTitle>
          <EmptyDescription>
            {filtered
              ? "Try another name, status, Project, category or Supervisor."
              : "Add the labourers on your own roll with their wage and Project, or import them from Excel."}
          </EmptyDescription>
        </EmptyHeader>
        {!filtered && (
          <EmptyContent>
            <div className="flex flex-wrap justify-center gap-2">
              {addLink}
              <Button type="button" variant="outline" onClick={onImport}>
                <Upload aria-hidden="true" />
                Import from Excel
              </Button>
            </div>
          </EmptyContent>
        )}
      </Empty>
    );

  const showBalance = data.items.some((item) => item.balance != null);
  const pageIds = data.items.map((item) => item.id);
  const allSelected = pageIds.every((id) => selected.has(id));
  const toggle = (labour: LabourResponse, on: boolean) => {
    setSelected((current) => {
      const next = new Map(current);
      if (on) next.set(labour.id, labour);
      else next.delete(labour.id);
      return next;
    });
  };
  const confirm = pending == null ? null : CONFIRM[pending.kind];

  return (
    <div className="space-y-3">
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          {data.total} {data.total === 1 ? "labourer" : "labourers"}
          {selected.size > 0 && ` · ${String(selected.size)} selected`}
        </p>
        {selected.size > 0 && (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelected(new Map());
              }}
            >
              Clear
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setTransferring([...selected.values()]);
              }}
            >
              <ArrowRightLeft aria-hidden="true" />
              Transfer selected
            </Button>
          </div>
        )}
      </div>
      <div className="rounded-lg border">
        <Table aria-label="Labours">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  aria-label="Select all on this page"
                  checked={allSelected}
                  onCheckedChange={(on) => {
                    for (const item of data.items) toggle(item, on);
                  }}
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Labour Id</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Wage</TableHead>
              {showBalance && (
                <TableHead className="text-right">Balance</TableHead>
              )}
              <TableHead>Status</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((labour) => (
              <TableRow
                key={labour.id}
                data-state={selected.has(labour.id) ? "selected" : undefined}
              >
                <TableCell>
                  <Checkbox
                    aria-label={`Select ${labour.name}`}
                    checked={selected.has(labour.id)}
                    onCheckedChange={(on) => {
                      toggle(labour, on);
                    }}
                  />
                </TableCell>
                <TableCell className="font-medium">
                  <Link href={editPath(labour.id)} className="hover:underline">
                    {labour.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {labour.labourCode ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {labour.labourCategory?.name ?? "—"}
                </TableCell>
                <TableCell className="max-w-40 truncate">
                  {labour.currentProject.name}
                </TableCell>
                <TableCell className="tabular-nums">
                  {wageText(labour)}
                </TableCell>
                {showBalance && (
                  <TableCell className="text-right tabular-nums">
                    {labour.balance == null ? "—" : formatPaise(labour.balance)}
                  </TableCell>
                )}
                <TableCell>
                  {labour.isActive ? (
                    <Badge variant="secondary">Active</Badge>
                  ) : (
                    <Badge variant="outline">Inactive</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Actions for ${labour.name}`}
                        />
                      }
                    >
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem
                        render={<Link href={editPath(labour.id)} />}
                      >
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setTransferring([labour]);
                        }}
                      >
                        Transfer
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setHistory(labour);
                        }}
                      >
                        Transfer history
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setError(undefined);
                          setPending({
                            kind: labour.isActive ? "deactivate" : "activate",
                            labour,
                          });
                          setConfirming(true);
                        }}
                      >
                        {labour.isActive ? "Deactivate" : "Activate"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => {
                          setError(undefined);
                          setPending({ kind: "delete", labour });
                          setConfirming(true);
                        }}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
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
      <TransferDialog
        labours={transferring ?? []}
        open={transferring != null}
        onOpenChange={(open) => {
          if (!open) setTransferring(null);
        }}
        onTransferred={() => {
          setSelected(new Map());
        }}
      />
      <TransferHistorySheet
        labour={history}
        onOpenChange={(open) => {
          if (!open) setHistory(null);
        }}
      />
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending != null && confirm?.title(pending.labour.name)}
            </AlertDialogTitle>
            <AlertDialogDescription>{confirm?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <FormAlert message={error} />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant={pending?.kind === "delete" ? "destructive" : "default"}
              disabled={command.isPending}
              onClick={() => {
                if (pending == null) return;
                command.mutate(
                  { kind: pending.kind, id: pending.labour.id },
                  {
                    onSuccess: () => {
                      setConfirming(false);
                    },
                    onError: (caught) => {
                      setError(fieldForCode(caught, {}).message);
                    },
                  },
                );
              }}
            >
              {confirm?.action}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
