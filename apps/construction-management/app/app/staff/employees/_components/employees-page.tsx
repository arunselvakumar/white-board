"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { MagnifyingGlassIcon, UsersThreeIcon } from "@phosphor-icons/react/ssr";
import {
  ArrowRightLeft,
  CircleDot,
  CircleOff,
  Download,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  Search,
  Upload,
} from "lucide-react";
import Link from "next/link";
import {
  type ReactNode,
  Suspense,
  useDeferredValue,
  useState,
  useTransition,
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
import { EmptyState } from "@repo/ui/components/empty-state";
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

import { PageHeader } from "@/app/app/_components/app-shell/page-header";
import { FormAlert } from "@/components/auth/form-alert";
import { formatPaise } from "@/components/money/money-input";
import { fieldForCode } from "@/lib/server-errors";
import { EMPLOYEES_PATH, employeePagePath } from "@/lib/staff-nav";
import { departmentsQuery } from "@/src/queries/departments";
import {
  employeeExportUrl,
  employeesQuery,
  useEmployeeCommand,
  type EmployeeListFilter,
  type EmployeeResponse,
} from "@/src/queries/employees";
import { lookupListQuery } from "@/src/queries/masters";
import { projectOptionsQuery } from "@/src/queries/projects";
import { rolesQuery } from "@/src/queries/roles";

import { ImportDialog } from "./import-dialog";
import { ProjectChips } from "./employee-projects";
import { TransferDialog, type TransferTarget } from "./transfer-dialog";
import { TransferHistorySheet } from "./transfer-history-sheet";
import { EmployeeRowsSkeleton } from "./employees-skeletons";
import { rolesUnder } from "./role-choices";

const STATUS_FILTERS: FilterTab<EmployeeListFilter["status"]>[] = [
  { value: "all", label: "All", icon: LayoutGrid },
  { value: "active", label: "Active", icon: CircleDot },
  { value: "inactive", label: "Inactive", icon: CircleOff },
];

const ALL = "all";

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

/** The Employees register by Project, Department and Role, with transfer and import. */
export function EmployeesPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<EmployeeListFilter["status"]>("all");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [roleId, setRoleId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<EmployeeListFilter["cursor"]>(null);
  const [importing, setImporting] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const projects = useQuery(projectOptionsQuery);
  const categories = useQuery(lookupListQuery("labour-categories"));
  const departments = useQuery(departmentsQuery);
  const roles = useQuery(rolesQuery);
  // With a Department chosen, Role offers only the Roles under it.
  const roleItems =
    departmentId == null
      ? [...(roles.data ?? [])].sort((a, b) => a.name.localeCompare(b.name))
      : rolesUnder(roles.data ?? [], departmentId);

  const filter = {
    search: deferredSearch,
    status,
    projectId,
    categoryId,
    roleId,
    departmentId,
  };
  // Filter and page changes keep the old rows on screen, dimmed (ADR-0047).
  const [isPending, startTransition] = useTransition();
  const set =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      startTransition(() => {
        setter(value);
        setCursor(null);
      });
    };

  const addLink = (
    <Link href={`${EMPLOYEES_PATH}/new`} className={buttonVariants()}>
      <Plus aria-hidden="true" />
      Add Employee
    </Link>
  );

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-5xl space-y-6">
        <PageHeader
          title="Employees"
          meta="Your own people on site: Role, wages, Projects and transfers."
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
                href={employeeExportUrl(filter)}
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
          <InputGroup className="sm:max-w-xs">
            <InputGroupAddon>
              <Search aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label="Search Employees"
              placeholder="Search name, Employee Id or mobile"
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
            onValueChange={set(setStatus)}
          />
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
            label="Department"
            allLabel="All Departments"
            value={departmentId}
            items={departments.data?.items ?? []}
            onChange={(next) => {
              startTransition(() => {
                setDepartmentId(next);
                // A Role under another Department would match no one.
                if (
                  next != null &&
                  roleId != null &&
                  !rolesUnder(roles.data ?? [], next).some(
                    (role) => role.id === roleId,
                  )
                )
                  setRoleId(null);
                setCursor(null);
              });
            }}
          />
          <FilterSelect
            label="Role"
            allLabel="All Roles"
            value={roleId}
            items={roleItems}
            onChange={set(setRoleId)}
          />
        </div>
        <Suspense fallback={<EmployeeRowsSkeleton />}>
          <EmployeeRows
            filter={{ ...filter, cursor }}
            onPage={(next) => {
              startTransition(() => {
                setCursor(next);
              });
            }}
            addLink={addLink}
            className={cn(isPending && "opacity-60 transition-opacity")}
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
    body: "Only an Employee with no attendance and no payments can be deleted. Deactivate someone who has worked for you instead. Their sign-in, if any, goes too.",
    action: "Delete",
  },
};

function wageText(employee: EmployeeResponse): string {
  if (employee.wageType === "daily")
    return employee.wagePerDay == null
      ? "Daily"
      : `${formatPaise(employee.wagePerDay)} / day`;
  return employee.wagePerMonth == null
    ? "Monthly"
    : `${formatPaise(employee.wagePerMonth)} / month`;
}

function EmployeeRows({
  filter,
  onPage,
  addLink,
  onImport,
  className,
}: {
  filter: EmployeeListFilter;
  onPage: (cursor: EmployeeListFilter["cursor"]) => void;
  addLink: ReactNode;
  onImport: () => void;
  className?: string;
}) {
  const { data } = useSuspenseQuery(employeesQuery(filter));
  const command = useEmployeeCommand();
  const [selected, setSelected] = useState<Map<string, TransferTarget>>(
    new Map(),
  );
  const [transferring, setTransferring] = useState<TransferTarget[] | null>(
    null,
  );
  const [history, setHistory] = useState<EmployeeResponse | null>(null);
  // Kept after the dialog closes so its text stays while it animates out.
  const [pending, setPending] = useState<{
    kind: ConfirmKind;
    employee: EmployeeResponse;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const filtered =
    filter.search.trim().length > 0 ||
    filter.status !== "all" ||
    filter.projectId != null ||
    filter.categoryId != null ||
    filter.departmentId != null ||
    filter.roleId != null;
  if (data.items.length === 0)
    return (
      <EmptyState
        icon={filtered ? MagnifyingGlassIcon : UsersThreeIcon}
        tone={filtered ? "neutral" : "violet"}
        title={filtered ? "No Employees match" : "No Employees yet"}
        description={
          filtered
            ? "Try another name, status, Project, category, Department or Role."
            : "Add the people on your own roll with their Role and wage, or import them from Excel."
        }
        className="bg-card border"
        actions={
          filtered ? undefined : (
            <>
              {addLink}
              <Button type="button" variant="outline" onClick={onImport}>
                <Upload aria-hidden="true" />
                Import from Excel
              </Button>
            </>
          )
        }
      />
    );

  const showBalance = data.items.some((item) => item.balance != null);
  const pageIds = data.items.map((item) => item.id);
  const allSelected = pageIds.every((id) => selected.has(id));
  const toggle = (employee: EmployeeResponse, on: boolean) => {
    setSelected((current) => {
      const next = new Map(current);
      if (on) next.set(employee.id, employee);
      else next.delete(employee.id);
      return next;
    });
  };
  const confirm = pending == null ? null : CONFIRM[pending.kind];

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          {data.total} {data.total === 1 ? "Employee" : "Employees"}
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
      <div className="bg-card rounded-lg border">
        <Table aria-label="Employees">
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
              <TableHead>Employee Id</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Projects</TableHead>
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
            {data.items.map((employee) => (
              <TableRow
                key={employee.id}
                data-state={selected.has(employee.id) ? "selected" : undefined}
              >
                <TableCell>
                  <Checkbox
                    aria-label={`Select ${employee.name}`}
                    checked={selected.has(employee.id)}
                    onCheckedChange={(on) => {
                      toggle(employee, on);
                    }}
                  />
                </TableCell>
                <TableCell className="font-medium">
                  <Link
                    href={employeePagePath(employee.id)}
                    className="hover:underline"
                  >
                    {employee.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {employee.employeeCode ?? "—"}
                </TableCell>
                <TableCell>
                  <span className="block">{employee.role.name}</span>
                  {employee.department == null ? null : (
                    <span className="text-muted-foreground block text-xs">
                      {employee.department.name}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <ProjectChips projects={employee.projects} />
                </TableCell>
                <TableCell className="tabular-nums">
                  {wageText(employee)}
                </TableCell>
                {showBalance && (
                  <TableCell className="text-right tabular-nums">
                    {employee.balance == null
                      ? "—"
                      : formatPaise(employee.balance)}
                  </TableCell>
                )}
                <TableCell>
                  {employee.isActive ? (
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
                          aria-label={`Actions for ${employee.name}`}
                        />
                      }
                    >
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem
                        render={<Link href={employeePagePath(employee.id)} />}
                      >
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setTransferring([employee]);
                        }}
                      >
                        Transfer
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setHistory(employee);
                        }}
                      >
                        Transfer history
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setError(undefined);
                          setPending({
                            kind: employee.isActive ? "deactivate" : "activate",
                            employee,
                          });
                          setConfirming(true);
                        }}
                      >
                        {employee.isActive ? "Deactivate" : "Activate"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => {
                          setError(undefined);
                          setPending({ kind: "delete", employee });
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
        employees={transferring ?? []}
        fromProjectId={filter.projectId}
        open={transferring != null}
        onOpenChange={(open) => {
          if (!open) setTransferring(null);
        }}
        onTransferred={() => {
          setSelected(new Map());
        }}
      />
      <TransferHistorySheet
        employee={history}
        onOpenChange={(open) => {
          if (!open) setHistory(null);
        }}
      />
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending != null && confirm?.title(pending.employee.name)}
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
                  { kind: pending.kind, id: pending.employee.id },
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
