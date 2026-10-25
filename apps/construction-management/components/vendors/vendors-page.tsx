"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  CircleDot,
  CircleOff,
  HardHat,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  Search,
} from "lucide-react";
import Link from "next/link";
import { Suspense, useDeferredValue, useState, useTransition } from "react";
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
import { FilterTabs, type FilterTab } from "@repo/ui/components/filter-tabs";
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
import { formatPaise } from "@/components/money/money-input";
import { fieldForCode } from "@/lib/server-errors";
import { projectOptionsQuery } from "@/src/queries/projects";
import {
  useVendorCommand,
  vendorsQuery,
  type VendorCommand,
  type VendorListFilter,
  type VendorSummary,
} from "@/src/queries/vendors";

import { ProjectFilterSkeleton, VendorRowsSkeleton } from "./vendors-skeletons";

export const VENDORS_PATH = "/app/masters/vendors";

const STATUS_FILTERS: FilterTab<VendorListFilter["status"]>[] = [
  { value: "all", label: "All", icon: LayoutGrid },
  { value: "active", label: "Active", icon: CircleDot },
  { value: "inactive", label: "Inactive", icon: CircleOff },
];

const ALL_PROJECTS = "all";

function editPath(id: string): string {
  return `${VENDORS_PATH}/${encodeURIComponent(id)}`;
}

/** Masters → Vendors (CM-209): search, status tabs, Project filter, row actions. */
export function VendorsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<VendorListFilter["status"]>("all");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<VendorListFilter["cursor"]>(null);
  const deferredSearch = useDeferredValue(search);
  // Filter and page changes keep the old rows on screen, dimmed (ADR-0047).
  const [isPending, startTransition] = useTransition();

  const addLink = (
    <Link href={`${VENDORS_PATH}/new`} className={buttonVariants()}>
      <Plus aria-hidden="true" />
      Add Vendor
    </Link>
  );

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Masters", href: "/app/masters" }}
          title="Vendors"
          meta="Labour gangs you hire by the head, with their shift rates."
          actions={addLink}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <InputGroup className="sm:max-w-xs">
            <InputGroupAddon>
              <Search aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label="Search Vendors"
              placeholder="Search name or contact"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                startTransition(() => {
                  setCursor(null);
                });
              }}
            />
          </InputGroup>
          <FilterTabs
            aria-label="Status"
            items={STATUS_FILTERS}
            value={status}
            onValueChange={(next) => {
              startTransition(() => {
                setStatus(next);
                setCursor(null);
              });
            }}
          />
          <Suspense fallback={<ProjectFilterSkeleton />}>
            <ProjectFilter
              value={projectId}
              onChange={(next) => {
                startTransition(() => {
                  setProjectId(next);
                  setCursor(null);
                });
              }}
            />
          </Suspense>
        </div>
        <Suspense fallback={<VendorRowsSkeleton />}>
          <VendorRows
            filter={{ search: deferredSearch, status, projectId, cursor }}
            onPage={(next) => {
              startTransition(() => {
                setCursor(next);
              });
            }}
            addLink={addLink}
            className={cn(isPending && "opacity-60 transition-opacity")}
          />
        </Suspense>
      </div>
    </div>
  );
}

function ProjectFilter({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (projectId: string | null) => void;
}) {
  const { data } = useSuspenseQuery(projectOptionsQuery);
  const items = [
    { value: ALL_PROJECTS, label: "All Projects" },
    ...data.items.map((project) => ({
      value: project.id,
      label: project.name,
    })),
  ];
  return (
    <Select
      items={items}
      value={value ?? ALL_PROJECTS}
      onValueChange={(next) => {
        onChange(next == null || next === ALL_PROJECTS ? null : next);
      }}
    >
      <SelectTrigger aria-label="Project" className="w-full sm:w-56">
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

const CONFIRM: Record<
  VendorCommand["kind"],
  { title: (name: string) => string; body: string; action: string }
> = {
  activate: {
    title: (name) => `Activate ${name}?`,
    body: "They come back on the attendance screens of their Projects.",
    action: "Activate",
  },
  deactivate: {
    title: (name) => `Deactivate ${name}?`,
    body: "They leave the attendance screens. Their attendance, payments and balance stay.",
    action: "Deactivate",
  },
  delete: {
    title: (name) => `Delete ${name}?`,
    body: "Only a Vendor with no attendance and no payments can be deleted. Deactivate a Vendor you have worked with instead.",
    action: "Delete",
  },
};

function projectsText(vendor: VendorSummary): string {
  if (vendor.projects.length === 0) return "—";
  const [first, ...rest] = vendor.projects;
  return rest.length === 0
    ? (first?.name ?? "—")
    : `${first?.name ?? ""} +${String(rest.length)}`;
}

function VendorRows({
  filter,
  onPage,
  addLink,
  className,
}: {
  filter: VendorListFilter;
  onPage: (cursor: VendorListFilter["cursor"]) => void;
  addLink: React.ReactNode;
  className?: string;
}) {
  const { data } = useSuspenseQuery(vendorsQuery(filter));
  const command = useVendorCommand();
  // Kept after the dialog closes so its text stays while it animates out.
  const [pending, setPending] = useState<{
    kind: VendorCommand["kind"];
    vendor: VendorSummary;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const filtered =
    filter.search.trim().length > 0 ||
    filter.status !== "all" ||
    filter.projectId != null;
  if (data.items.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HardHat />
          </EmptyMedia>
          <EmptyTitle>
            {filtered ? "No Vendors match" : "No Vendors yet"}
          </EmptyTitle>
          <EmptyDescription>
            {filtered
              ? "Try another name, status or Project."
              : "Add the labour gangs you hire, with a rate per day for each Labour Category on each shift."}
          </EmptyDescription>
        </EmptyHeader>
        {!filtered && <EmptyContent>{addLink}</EmptyContent>}
      </Empty>
    );

  const showBalance = data.items.some((item) => item.balance != null);
  const confirm = pending == null ? null : CONFIRM[pending.kind];

  return (
    <div className={cn("space-y-3", className)}>
      <p className="text-muted-foreground text-sm">
        {data.total} {data.total === 1 ? "Vendor" : "Vendors"}
      </p>
      <div className="rounded-lg border">
        <Table aria-label="Vendors">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Projects</TableHead>
              <TableHead className="text-right">Shifts</TableHead>
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
            {data.items.map((vendor) => (
              <TableRow key={vendor.id}>
                <TableCell className="font-medium">
                  <Link href={editPath(vendor.id)} className="hover:underline">
                    {vendor.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {vendor.contactNumber ?? "—"}
                </TableCell>
                <TableCell
                  className="text-muted-foreground max-w-48 truncate"
                  title={vendor.projects.map((item) => item.name).join(", ")}
                >
                  {projectsText(vendor)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {vendor.hasRateCard ? (
                    vendor.shiftCount
                  ) : (
                    <Badge variant="outline">No rate card</Badge>
                  )}
                </TableCell>
                {showBalance && (
                  <TableCell className="text-right tabular-nums">
                    {vendor.balance == null ? "—" : formatPaise(vendor.balance)}
                  </TableCell>
                )}
                <TableCell>
                  {vendor.isActive ? (
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
                          aria-label={`Actions for ${vendor.name}`}
                        />
                      }
                    >
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem
                        render={<Link href={editPath(vendor.id)} />}
                      >
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setError(undefined);
                          setPending({
                            kind: vendor.isActive ? "deactivate" : "activate",
                            vendor,
                          });
                          setConfirming(true);
                        }}
                      >
                        {vendor.isActive ? "Deactivate" : "Activate"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => {
                          setError(undefined);
                          setPending({ kind: "delete", vendor });
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
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.title(pending?.vendor.name ?? "this Vendor")}
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
                  { kind: pending.kind, id: pending.vendor.id },
                  {
                    onSuccess: () => {
                      setConfirming(false);
                    },
                    onError: (failure) => {
                      setError(fieldForCode(failure, {}).message);
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
