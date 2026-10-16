"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { useId, useState, type SyntheticEvent } from "react";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Spinner } from "@repo/ui/components/spinner";

import { ChipsSelect } from "@/components/tracking/tasks/chips-select";

import {
  useRequestReport,
  type RequestReportInput,
} from "@/src/queries/reports";

import {
  cardFilter,
  cardPickers,
  monthStart,
  PICKER_COPY,
  pickerStatuses,
  recentFinancialYears,
  takesProjects,
  type CardFilter,
  type PickerKey,
  type ReportDefinition,
  type ReportPickerOptions,
} from "./report-catalogue";
import { ReportDownloads } from "./report-downloads";

/** Options for a card's optional filter; "all" is no filter. */
export type ReportFilterOption = { value: string; label: string };

const ALL = "all";

const FILTER_LABELS: Record<CardFilter, string> = {
  contractor: "Contractor",
  equipment: "Equipment",
  supplier: "Supplier",
  account: "Account",
};

const FILTER_ALL_LABELS: Record<CardFilter, string> = {
  contractor: "All contractors",
  equipment: "All equipment",
  supplier: "All suppliers",
  account: "All accounts you can see",
};

/** The Ledger's optional filters (legacy: module, mode, Paid To kind). */
type LedgerExtras = { module: string; mode: string; counterpartyKind: string };

const LEDGER_EXTRAS: {
  key: keyof LedgerExtras;
  label: string;
  all: string;
  options: { value: string; label: string }[];
}[] = [
  {
    key: "module",
    label: "Module",
    all: "All modules",
    options: [
      { value: "transaction", label: "Transaction" },
      { value: "account_transfer", label: "Transfer" },
      { value: "petty_cash_voucher", label: "Petty Cash" },
      { value: "other_expense", label: "Other Expense" },
      { value: "party_payment", label: "Party Payment" },
      { value: "wage_payment", label: "Wage Payment" },
      { value: "salary_slip", label: "Salary" },
      { value: "account", label: "Account (opening)" },
    ],
  },
  {
    key: "mode",
    label: "Mode",
    all: "All modes",
    options: [
      { value: "cash", label: "Cash" },
      { value: "cheque", label: "Cheque" },
      { value: "online", label: "Online" },
      { value: "upi", label: "UPI" },
    ],
  },
  {
    key: "counterpartyKind",
    label: "Paid To / Received From",
    all: "Anyone",
    options: [
      { value: "contractor", label: "Contractor" },
      { value: "supplier", label: "Supplier" },
      { value: "other_party", label: "Other Party" },
      { value: "labour", label: "Labour" },
      { value: "vendor", label: "Vendor" },
      { value: "team_member", label: "Team Member" },
    ],
  },
];

function ledgerParams(extras: LedgerExtras) {
  type Params = Extract<
    RequestReportInput,
    { kind: "account_ledger" }
  >["params"];
  const picked: Partial<Pick<Params, "module" | "mode" | "counterpartyKind">> =
    {};
  if (extras.module !== ALL)
    picked.module = extras.module as NonNullable<Params["module"]>;
  if (extras.mode !== ALL)
    picked.mode = extras.mode as NonNullable<Params["mode"]>;
  if (extras.counterpartyKind !== ALL)
    picked.counterpartyKind = extras.counterpartyKind as NonNullable<
      Params["counterpartyKind"]
    >;
  return picked;
}

type Period = {
  from: string;
  to: string;
  month: string;
  asOn: string;
  fy: string;
};

/** A picker's choice, or nothing for "All …". */
type Picks = Partial<Record<PickerKey, string>>;

/** The chosen Projects of a central card; nothing when all. */
function projectsParam(projectIds: readonly string[]) {
  return projectIds.length === 0 ? {} : { projectIds: [...projectIds] };
}

/** Only the picks that are set, for a request's params. */
function onlySet<T extends Record<string, string | undefined>>(
  values: T,
): Partial<Record<keyof T, string>> {
  const out: Partial<Record<keyof T, string>> = {};
  for (const [key, value] of Object.entries(values))
    if (value != null && value !== ALL) out[key as keyof T] = value;
  return out;
}

/**
 * The request for a card; null for a kind the Reports routes do not take
 * (a Progress Report).
 */
function requestFor(
  definition: ReportDefinition,
  scope: string | null,
  period: Period,
  filter: string | null,
  extras: LedgerExtras = { module: ALL, mode: ALL, counterpartyKind: ALL },
  picks: Picks = {},
  projectIds: readonly string[] = [],
): RequestReportInput | null {
  // Only the central kinds are ever shown without a Project.
  const projectId = scope ?? "";
  const range = { from: period.from, to: period.to };
  // The Projects filter is central only.
  const projects = scope == null ? projectsParam(projectIds) : {};
  switch (definition.kind) {
    case "labour_month":
    case "muster_roll":
      return {
        kind: definition.kind,
        projectId,
        params: { month: period.month },
      };
    case "labour_attendance":
    case "labour_payment":
      return {
        kind: definition.kind,
        projectId,
        params: { from: period.from, to: period.to },
      };
    // Vendor Attendance takes a Vendor and a Labour Category (CM-903).
    case "vendor_attendance":
      return {
        kind: definition.kind,
        projectId: scope,
        params: {
          ...range,
          ...onlySet({
            vendorId: picks.vendor,
            categoryId: picks.labour_category,
          }),
          ...projects,
        },
      };
    // Site work reports (CM-605, CM-608).
    case "daily_work":
      return {
        kind: definition.kind,
        projectId,
        params: filter == null ? range : { ...range, contractorId: filter },
      };
    case "owned_equipment_usage":
    case "rented_equipment_usage":
      return {
        kind: definition.kind,
        projectId,
        params: filter == null ? range : { ...range, equipmentId: filter },
      };
    case "equipment_maintenance":
    case "equipment_transfers":
      return { kind: definition.kind, projectId: scope, params: range };
    // Finance reports (CM-709).
    case "account_ledger":
      return {
        kind: definition.kind,
        projectId: null,
        params: { ...range, accountId: filter ?? "", ...ledgerParams(extras) },
      };
    case "petty_cash":
      return {
        kind: definition.kind,
        projectId,
        params: filter == null ? range : { ...range, accountId: filter },
      };
    case "transactions":
    case "other_expenses":
      return { kind: definition.kind, projectId, params: range };
    case "contractor_payments":
    case "supplier_payments":
      return {
        kind: definition.kind,
        projectId,
        params: filter == null ? range : { ...range, partyId: filter },
      };
    case "tds_194c":
      return {
        kind: definition.kind,
        projectId: null,
        params:
          filter == null
            ? { fy: period.fy }
            : { fy: period.fy, contractorId: filter },
      };
    case "due_payments":
      return {
        kind: definition.kind,
        projectId: scope,
        params: { asOn: period.asOn },
      };
    // Tracking reports (CM-805).
    case "task_report":
    case "issue_snag_report":
    case "inspection_request_report":
      return { kind: definition.kind, projectId, params: range };
    // Procurement and central labour reports (CM-903).
    case "purchase_requests":
      return {
        kind: definition.kind,
        projectId: scope,
        params: {
          ...range,
          ...(onlySet({
            status: picks.status,
            materialCategoryId: picks.material_category,
            materialId: picks.material,
            createdBy: picks.created_by,
          }) as { status?: "pending" | "approved" | "rejected" }),
          ...projects,
        },
      };
    case "purchase_orders":
      return {
        kind: definition.kind,
        projectId: scope,
        params: {
          ...range,
          ...(onlySet({ status: picks.status, supplierId: picks.supplier }) as {
            status?: "pending" | "approved" | "rejected";
          }),
          ...projects,
        },
      };
    case "material_received":
      return {
        kind: definition.kind,
        projectId: scope,
        params: {
          ...range,
          ...onlySet({ supplierId: picks.supplier }),
          ...projects,
        },
      };
    case "material_transfers":
      return {
        kind: definition.kind,
        projectId: scope,
        params: {
          ...range,
          ...(onlySet({
            status: picks.status,
            transferType: picks.transfer_type,
          }) as Pick<
            Extract<
              RequestReportInput,
              { kind: "material_transfers" }
            >["params"],
            "status" | "transferType"
          >),
          ...projects,
        },
      };
    case "stock_register":
      return {
        kind: definition.kind,
        projectId: scope,
        params: {
          ...range,
          ...onlySet({
            materialCategoryId: picks.material_category,
            materialId: picks.material,
            ...(scope == null ? { storeId: picks.store } : {}),
          }),
          ...projects,
        },
      };
    case "labour_attendance_central":
      return {
        kind: definition.kind,
        projectId: null,
        params: { ...range, ...projectsParam(projectIds) },
      };
    default:
      return null;
  }
}

/**
 * One report of the catalogue: what it contains, its period, and
 * Generate. The job goes on the queue; the card shows it queued, then the
 * downloads (or why it failed) once the Recent reports poll sees it done.
 */
export function ReportCard({
  definition,
  projectId,
  today,
  filterOptions = [],
  initialFilter,
  pickerOptions = {},
}: {
  definition: ReportDefinition;
  /** Null for a central report (Central Reports, Masters → Equipments, Central Payment). */
  projectId: string | null;
  today: string;
  /** Choices for the card's filter; the picker shows only with some. */
  filterOptions?: readonly ReportFilterOption[];
  /** The filter's starting choice (Central Payment's account Ledger link). */
  initialFilter?: string;
  /**
   * Choices for the card's other pickers (CM-903): Vendor, Labour
   * Category, Supplier, Material Category, Material, Created By, Store and
   * the central Projects. A picker shows only with some.
   */
  pickerOptions?: ReportPickerOptions;
}) {
  const id = useId();
  const [from, setFrom] = useState(monthStart(today));
  const [to, setTo] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [asOn, setAsOn] = useState(today);
  const years = recentFinancialYears(today);
  const [fy, setFy] = useState(years[0] ?? "");
  const picker = cardFilter(definition);
  const required = picker?.required === true;
  const [filter, setFilter] = useState(initialFilter ?? ALL);
  const [extras, setExtras] = useState<LedgerExtras>({
    module: ALL,
    mode: ALL,
    counterpartyKind: ALL,
  });
  const [picks, setPicks] = useState<Picks>({});
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const mutation = useRequestReport(projectId);
  const job = mutation.data;
  const rangeInvalid = definition.period === "range" && from > to;
  const filterItems =
    picker == null || filterOptions.length === 0
      ? null
      : required
        ? [...filterOptions]
        : [
            { value: ALL, label: FILTER_ALL_LABELS[picker.key] },
            ...filterOptions,
          ];
  // A required filter starts on its first option.
  const chosen =
    required && filter === ALL ? (filterOptions[0]?.value ?? ALL) : filter;
  const missingRequired = required && chosen === ALL;
  // The other pickers (CM-903): the single filter above keeps its own.
  const pickers = cardPickers(definition)
    .filter((key) => filterItems == null || key !== picker?.key)
    .flatMap((key) => {
      const statuses = pickerStatuses(definition.kind, key);
      const options = statuses ?? pickerOptions[key] ?? [];
      return options.length === 0 ? [] : [{ key, options }];
    });
  const projectChoices =
    projectId == null && takesProjects(definition)
      ? (pickerOptions.projects ?? [])
      : [];

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (rangeInvalid || missingRequired) return;
    const input = requestFor(
      definition,
      projectId,
      { from, to, month, asOn, fy },
      filterItems == null || chosen === ALL ? null : chosen,
      extras,
      Object.fromEntries(
        pickers.map(({ key }) => [key, picks[key] ?? ALL]),
      ) as Picks,
      projectIds,
    );
    if (input != null) mutation.mutate(input);
  }

  return (
    <Card className="flex flex-col">
      <form
        aria-label={definition.title}
        onSubmit={submit}
        className="flex flex-1 flex-col gap-4"
      >
        <CardHeader>
          <CardTitle>{definition.title}</CardTitle>
          <CardDescription>{definition.description}</CardDescription>
          <p className="text-muted-foreground text-xs">{definition.needs}</p>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3">
          {definition.period === "range" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-from`}>From</Label>
                <Input
                  id={`${id}-from`}
                  type="date"
                  className="h-10"
                  value={from}
                  max={today}
                  onChange={(event) => {
                    setFrom(event.target.value);
                  }}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-to`}>To</Label>
                <Input
                  id={`${id}-to`}
                  type="date"
                  className="h-10"
                  value={to}
                  onChange={(event) => {
                    setTo(event.target.value);
                  }}
                  aria-invalid={rangeInvalid}
                  required
                />
              </div>
              {rangeInvalid ? (
                <p className="text-destructive col-span-2 text-sm" role="alert">
                  The period must end on or after the day it starts.
                </p>
              ) : null}
            </div>
          ) : definition.period === "as_on" ? (
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-as-on`}>As on</Label>
              <Input
                id={`${id}-as-on`}
                type="date"
                className="h-10 sm:w-48"
                value={asOn}
                onChange={(event) => {
                  setAsOn(event.target.value);
                }}
                required
              />
            </div>
          ) : definition.period === "fy" ? (
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-fy`}>Financial year</Label>
              <Select
                items={years.map((year) => ({ value: year, label: year }))}
                value={fy}
                onValueChange={(next) => {
                  if (next != null) setFy(next);
                }}
              >
                <SelectTrigger id={`${id}-fy`} className="h-10 w-full sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  {years.map((year) => (
                    <SelectItem key={year} value={year}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-month`}>Month</Label>
              <Input
                id={`${id}-month`}
                type="month"
                className="h-10 sm:w-48"
                value={month}
                onChange={(event) => {
                  setMonth(event.target.value);
                }}
                required
              />
            </div>
          )}

          {filterItems == null || picker == null ? null : (
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-filter`}>
                {FILTER_LABELS[picker.key]}
              </Label>
              <Select
                items={filterItems}
                value={chosen}
                onValueChange={(next) => {
                  if (next != null) setFilter(next);
                }}
              >
                <SelectTrigger id={`${id}-filter`} className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  {filterItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {pickers.length === 0 ? null : (
            <div className="grid gap-3 sm:grid-cols-2">
              {pickers.map(({ key, options }) => {
                const copy = PICKER_COPY[key];
                const items = [{ value: ALL, label: copy.all }, ...options];
                return (
                  <div key={key} className="min-w-0 space-y-1.5">
                    <Label htmlFor={`${id}-${key}`}>{copy.label}</Label>
                    <Select
                      items={items}
                      value={picks[key] ?? ALL}
                      onValueChange={(next) => {
                        if (next != null)
                          setPicks((current) => ({ ...current, [key]: next }));
                      }}
                    >
                      <SelectTrigger
                        id={`${id}-${key}`}
                        className="h-10 w-full"
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
                  </div>
                );
              })}
            </div>
          )}

          {projectChoices.length === 0 ? null : (
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor={`${id}-projects`}>Projects</Label>
              <ChipsSelect
                id={`${id}-projects`}
                label="Projects"
                options={projectChoices.map((option) => ({
                  id: option.value,
                  name: option.label,
                }))}
                value={projectIds}
                onChange={setProjectIds}
                placeholder="All your Projects"
                emptyText="No Project matches."
              />
              <p className="text-muted-foreground text-xs">
                {projectIds.length === 0
                  ? "Every Project you may see."
                  : definition.group === "procurement" &&
                      (picks.store ?? ALL) === ALL
                    ? "Only these Projects; Central Stores are left out."
                    : "Only these Projects."}
              </p>
            </div>
          )}

          {definition.kind === "account_ledger" && !missingRequired ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {LEDGER_EXTRAS.map((extra) => {
                const items = [
                  { value: ALL, label: extra.all },
                  ...extra.options,
                ];
                return (
                  <div key={extra.key} className="min-w-0 space-y-1.5">
                    <Label htmlFor={`${id}-${extra.key}`}>{extra.label}</Label>
                    <Select
                      items={items}
                      value={extras[extra.key]}
                      onValueChange={(next) => {
                        if (next != null)
                          setExtras((current) => ({
                            ...current,
                            [extra.key]: next,
                          }));
                      }}
                    >
                      <SelectTrigger
                        id={`${id}-${extra.key}`}
                        className="h-10 w-full"
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
                  </div>
                );
              })}
            </div>
          ) : null}
          {missingRequired ? (
            <p className="text-muted-foreground text-sm">
              There is no {FILTER_LABELS[picker.key].toLowerCase()} you can
              report on yet.
            </p>
          ) : null}
          {mutation.isPending ? (
            <p
              className="text-muted-foreground flex items-center gap-2 text-sm"
              role="status"
            >
              <Spinner aria-hidden="true" />
              Generating the Excel and PDF…
            </p>
          ) : null}
          {mutation.isError ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertTitle>Could not generate</AlertTitle>
              <AlertDescription>{mutation.error.message}</AlertDescription>
            </Alert>
          ) : null}
          {!mutation.isPending && job?.status === "failed" ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertTitle>The report failed</AlertTitle>
              <AlertDescription>{job.error}</AlertDescription>
            </Alert>
          ) : null}
          {!mutation.isPending &&
          (job?.status === "queued" || job?.status === "running") ? (
            <p className="text-muted-foreground text-sm" role="status">
              Generating. It appears under Recent reports and in Downloads when
              it is ready; you can leave this page.
            </p>
          ) : null}
          {!mutation.isPending && job?.status === "done" ? (
            <div className="space-y-2" role="status">
              <p className="flex items-center gap-2 text-sm font-medium">
                <CircleCheck
                  aria-hidden="true"
                  className="size-4 text-emerald-600"
                />
                Ready to download
              </p>
              <ReportDownloads job={job} label={definition.title} />
            </div>
          ) : null}
        </CardContent>
        <CardFooter>
          <Button
            type="submit"
            disabled={mutation.isPending || rangeInvalid || missingRequired}
            className="w-full sm:w-auto"
          >
            {mutation.isPending ? "Generating…" : "Generate"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
