"use client";

import {
  keepPreviousData,
  useQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type FieldPath,
  type Resolver,
} from "react-hook-form";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label, RequiredIndicator } from "@repo/ui/components/label";
import { RadioGroup } from "@repo/ui/components/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { LocationPicker } from "@/components/locations/location-picker";
import {
  formatPaise,
  MoneyInput,
  paiseToRupees,
  rupeesToPaise,
} from "@/components/money/money-input";
import {
  formatDate,
  formatQuantity,
  localToday,
  QUANTITY_PATTERN,
} from "@/components/procurement/inventory/inventory-format";
import { StockErrorAlert } from "@/components/procurement/inventory/stock-error-alert";
import { MaterialPicker } from "@/components/procurement/material-picker";
import { siteLocationInput } from "@/components/procurement/purchase-requests/purchase-request-format";
import { PendingFilesField } from "@/components/site-work/documents/pending-files-field";
import { useUploadPendingFiles } from "@/components/site-work/documents/use-upload-pending-files";
import { equipmentModulePath } from "@/components/site-work/equipment/equipment-tabs";
import { RadioCard } from "@/components/site-work/equipment/radio-card";
import { quantityText } from "@/components/site-work/worksheets/worksheet-format";
import {
  equipmentSheetFormOptionsQuery,
  equipmentSheetStockQuery,
  useCreateEquipmentSheet,
  useUpdateEquipmentSheet,
  type EquipmentSheetDetail,
  type EquipmentSheetFormOptions,
} from "@/src/queries/equipment-sheets";
import {
  equipmentSheetOptionsQuery,
  type EquipmentSheetOptions,
} from "@/src/queries/equipment";
import { QueryHttpError } from "@/src/queries/http";
import { materialOptionsQuery } from "@/src/queries/material-options";
import {
  canInSiteWork,
  siteWorkAccessQuery,
} from "@/src/queries/site-work-access";
import { addDays } from "@/src/shared-kernel/calendar-date";
import type { LocationRef } from "@/src/shared-kernel/location-ref";
import {
  FUEL_UNIT_LABELS,
  HIRE_BASIS_LABELS,
  UTILISATION_BASIS_LABELS,
  WORKING_TIME_METHOD_LABELS,
} from "@/src/site-work/domain/equipment";
import {
  decimalText,
  defaultBillableMilli,
  defaultUnitRate,
  EQUIPMENT_SHEET_LIMITS,
  FUEL_BORNE_BY,
  FUEL_BORNE_BY_LABELS,
} from "@/src/site-work/domain/equipment-usage";
import { WORK_SHIFT_LABELS, WORK_SHIFTS } from "@/src/site-work/domain/shift";
import { WORKSHEET_LIMITS } from "@/src/site-work/domain/worksheet";

import { billableUnit, OwnershipBadge } from "./equipment-sheet-format";
import {
  centiText,
  figureError,
  hireTerms,
  liveFigures,
  overlapIndex,
  showsMeter,
  showsShifts,
  trimDecimal,
  typesDistance,
  typesHours,
  type SheetMachine,
} from "./equipment-sheet-live";

type Settings = EquipmentSheetFormOptions["settings"];
type OptionItem = EquipmentSheetOptions["items"][number];

type Values = {
  sheetDate: string;
  equipmentId: string;
  shift: string;
  operatorName: string;
  supervisorUserId: string;
  contractorId: string;
  departmentId: string;
  workItem: string;
  siteLocation: LocationRef | null;
  timeShifts: { startTime: string; endTime: string }[];
  openingReading: string;
  closingReading: string;
  usageHours: string;
  distanceKm: string;
  trips: string;
  idleHours: string;
  breakdownHours: string;
  approxWorkQty: string;
  approxWorkUnitId: string;
  fuelQty: string;
  fuelBorneBy: string;
  /** Rupees as typed; empty = the hire rate. */
  unitRate: string;
  /** Empty = the default for the hire basis. */
  billableQty: string;
  materials: { materialId: string; quantity: string }[];
  remark: string;
  /** Files picked on a new sheet, uploaded once it is saved. */
  files: File[];
};

const BLOCKED_REASONS: Record<
  EquipmentSheetOptions["blocked"][number]["reason"],
  string
> = {
  EQUIPMENT_NOT_ON_PROJECT: "Not at this Project on that date",
  EQUIPMENT_IN_MAINTENANCE: "In maintenance on that date",
  EQUIPMENT_UNAVAILABLE: "Marked unavailable for worksheet entry",
};

/** The machine as the form knows it, from the sheet options. */
export function machineFromOption(item: OptionItem): SheetMachine {
  return {
    id: item.id,
    name: item.name,
    equipmentNumber: item.equipmentNumber,
    ownership: item.ownership,
    utilisationBasis: item.utilisationBasis,
    workingTimeMethod: item.workingTimeMethod,
    fuelUnit: item.fuelUnit,
    expectedFuelEfficiency: item.expectedFuelEfficiency,
    hireBasis: item.hireBasis,
    hireRate: item.hireRate,
    idleChargeable: item.idleChargeable,
    hirePartyName: item.hireParty?.name ?? null,
    lastClosing: item.lastClosingReading,
  };
}

/** The machine as a saved sheet knows it (its copies of basis and method). */
export function machineFromSheet(sheet: EquipmentSheetDetail): SheetMachine {
  return {
    id: sheet.equipment.id,
    name: sheet.equipment.name,
    equipmentNumber: sheet.equipment.equipmentNumber,
    ownership: sheet.ownership,
    utilisationBasis: sheet.utilisationBasis,
    workingTimeMethod: sheet.workingTimeMethod,
    fuelUnit: sheet.equipment.fuelUnit,
    expectedFuelEfficiency: sheet.equipment.expectedFuelEfficiency,
    hireBasis: sheet.equipment.hireBasis,
    hireRate: sheet.equipment.hireRate,
    idleChargeable: sheet.equipment.idleChargeable,
    hirePartyName: sheet.equipment.hireParty?.name ?? null,
    lastClosing: sheet.previousClosing,
  };
}

function blank(sheetDate: string): Values {
  return {
    sheetDate,
    equipmentId: "",
    shift: "shift_1",
    operatorName: "",
    supervisorUserId: "",
    contractorId: "",
    departmentId: "",
    workItem: "",
    siteLocation: null,
    timeShifts: [{ startTime: "", endTime: "" }],
    openingReading: "",
    closingReading: "",
    usageHours: "",
    distanceKm: "",
    trips: "",
    idleHours: "",
    breakdownHours: "",
    approxWorkQty: "",
    approxWorkUnitId: "",
    fuelQty: "",
    fuelBorneBy: "",
    unitRate: "",
    billableQty: "",
    materials: [],
    remark: "",
    files: [],
  };
}

const centi = (value: string | null) =>
  value == null ? 0 : Math.round(Number(value) * 100);

/** The unit rate and billable quantity a saved sheet overrode, as typed text. */
function overridesOf(sheet: EquipmentSheetDetail) {
  const terms = hireTerms(machineFromSheet(sheet));
  if (terms == null || sheet.unitRate == null || sheet.billableQty == null)
    return { unitRate: "", billableQty: "" };
  const rateDefault = defaultUnitRate(terms, sheet.sheetDate);
  const qtyDefault = defaultBillableMilli(terms, {
    hours:
      sheet.utilisationBasis === "hourly"
        ? centi(sheet.usageHours)
        : centi(sheet.shiftHours),
    idleHours: centi(sheet.idleHours),
    trips: sheet.trips ?? 0,
  });
  const qty = BigInt(Math.round(Number(sheet.billableQty) * 1000));
  return {
    unitRate:
      BigInt(sheet.unitRate) === rateDefault
        ? ""
        : paiseToRupees(sheet.unitRate),
    billableQty: qty === qtyDefault ? "" : trimDecimal(sheet.billableQty),
  };
}

const text = (value: string | null | undefined) =>
  value == null ? "" : trimDecimal(value);
const zeroBlank = (value: string) => (Number(value) === 0 ? "" : text(value));

function valuesFrom(
  sheet: EquipmentSheetDetail,
  sheetDate: string,
  duplicate: boolean,
): Values {
  return {
    sheetDate,
    equipmentId: sheet.equipment.id,
    shift: sheet.shift,
    operatorName: sheet.operatorName ?? "",
    supervisorUserId: sheet.supervisor?.userId ?? "",
    contractorId: sheet.contractor?.id ?? "",
    departmentId: sheet.department?.id ?? "",
    workItem: sheet.workItem ?? "",
    siteLocation: sheet.siteLocation,
    timeShifts:
      sheet.timeShifts.length === 0
        ? [{ startTime: "", endTime: "" }]
        : sheet.timeShifts.map(({ startTime, endTime }) => ({
            startTime,
            endTime,
          })),
    // Duplicate copies no readings; the opening becomes the last closing.
    openingReading: duplicate ? "" : text(sheet.openingReading),
    closingReading: duplicate ? "" : text(sheet.closingReading),
    usageHours: text(sheet.usageHours),
    distanceKm: text(sheet.distanceKm),
    trips: sheet.trips == null ? "" : String(sheet.trips),
    idleHours: zeroBlank(sheet.idleHours),
    breakdownHours: zeroBlank(sheet.breakdownHours),
    approxWorkQty:
      sheet.approxWorkQty == null ? "" : quantityText(sheet.approxWorkQty),
    approxWorkUnitId: sheet.approxWorkUnit?.id ?? "",
    fuelQty: text(sheet.fuelQty),
    fuelBorneBy: sheet.fuelBorneBy ?? "",
    ...overridesOf(sheet),
    materials: sheet.materials.map((line) => ({
      materialId: line.materialId,
      quantity: quantityText(line.quantity),
    })),
    remark: sheet.remark ?? "",
    files: [],
  };
}

/**
 * The client's checks: what is required, then the server's own figure
 * rules (shifts, readings, the 24-hour cap, fuel, hire) run on what is
 * typed. Masters are the server's to check.
 */
function validate(
  values: Values,
  settings: Settings,
  machine: SheetMachine | null,
  editing: boolean,
): Partial<Record<string, string>> {
  const errors: Partial<Record<string, string>> = {};
  if (values.sheetDate === "") errors["sheetDate"] = "Choose the date.";
  if (!editing && values.equipmentId === "")
    errors["equipmentId"] = "Choose the equipment.";
  if (values.shift === "") errors["shift"] = "Choose the Work Shift.";
  if (machine == null) return errors;
  values.timeShifts.forEach((row, index) => {
    if (!showsShifts(machine)) return;
    if (row.startTime.trim() === "" && row.endTime.trim() === "")
      errors[`timeShifts.${String(index)}.startTime`] =
        "Enter the start and end, or remove the row.";
  });
  const figure = figureError(values, machine, settings);
  if (figure != null && errors[figure.field] == null)
    errors[figure.field] = figure.message;
  if (values.departmentId !== "" && values.contractorId === "")
    errors["contractorId"] = "Choose the Contractor whose Department this is.";
  if (settings.showApproxWorkDone && values.approxWorkQty.trim() !== "") {
    const qty = values.approxWorkQty.trim();
    if (!QUANTITY_PATTERN.test(qty) || Number(qty) === 0)
      errors["approxWorkQty"] =
        "Enter a quantity more than 0 with at most 3 decimals.";
    if (values.approxWorkUnitId === "")
      errors["approxWorkUnitId"] = "Choose the unit of the work done.";
  }
  if (settings.showMaterials)
    values.materials.forEach((line, index) => {
      if (line.materialId === "")
        errors[`materials.${String(index)}.materialId`] = "Choose a material.";
      const qty = line.quantity.trim();
      if (!QUANTITY_PATTERN.test(qty) || Number(qty) === 0)
        errors[`materials.${String(index)}.quantity`] =
          "Enter a quantity more than 0 with at most 3 decimals.";
    });
  if (settings.showRemarks && values.remark.trim().length > 500)
    errors["remark"] = "Use at most 500 characters.";
  return errors;
}

const FORM_FIELDS = new Set<string>([
  "sheetDate",
  "equipmentId",
  "shift",
  "operatorName",
  "supervisorUserId",
  "contractorId",
  "departmentId",
  "workItem",
  "siteLocation",
  "openingReading",
  "closingReading",
  "usageHours",
  "distanceKm",
  "trips",
  "idleHours",
  "breakdownHours",
  "approxWorkQty",
  "approxWorkUnitId",
  "fuelQty",
  "fuelBorneBy",
  "unitRate",
  "billableQty",
  "remark",
]);

/** Server codes shown under the field they are about. */
function fieldFor(error: QueryHttpError): string | null {
  const details = (error.details ?? {}) as { field?: string; index?: number };
  if (error.code.startsWith("LOCATION_")) return "siteLocation";
  if (
    (details.field === "startTime" || details.field === "endTime") &&
    typeof details.index === "number"
  )
    return `timeShifts.${String(details.index)}.${details.field}`;
  if (error.code === "QUANTITY_INVALID" && typeof details.index === "number")
    return `materials.${String(details.index)}.quantity`;
  switch (error.code) {
    case "BACKDATED_CREATE_BLOCKED":
    case "BACKDATED_EDIT_BLOCKED":
    case "FINANCIAL_PERIOD_CLOSED":
      return "sheetDate";
    case "EQUIPMENT_SHEET_EXISTS":
      return "shift";
    default:
      return details.field != null && FORM_FIELDS.has(details.field)
        ? details.field
        : null;
  }
}

function SelectField({
  id,
  label,
  value,
  options,
  placeholder,
  error,
  disabled,
  required = false,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  placeholder: string;
  error: string | undefined;
  disabled?: boolean;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      <Select
        items={options}
        value={value === "" ? null : value}
        disabled={disabled}
        onValueChange={(next) => {
          if (next != null) onChange(next);
        }}
      >
        <SelectTrigger
          id={id}
          className="w-full min-w-0"
          aria-required={required}
          aria-invalid={error != null}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false}>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError message={error} />
    </div>
  );
}

function Section({
  id,
  title,
  required = false,
  children,
  aside,
}: {
  id: string;
  title: string;
  /** The section is one required choice (the Equipment picker). */
  required?: boolean;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={id} className="text-sm font-semibold">
          {title}
          {required ? <RequiredIndicator /> : null}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Adds the sheet's own (maybe now inactive) choice when the options lack it. */
function withCurrent(
  options: readonly { value: string; label: string }[],
  current: { id: string; name: string | null } | null | undefined,
): { value: string; label: string }[] {
  if (current == null || options.some((option) => option.value === current.id))
    return [...options];
  return [...options, { value: current.id, label: current.name ?? "—" }];
}

/**
 * New, edit or duplicated Equipment Usage sheet (CM-604). A new sheet
 * starts with the date (never after today) and the equipment free that day
 * (owned and rented groups; blocked machines shown with why). The inputs
 * then follow the machine's basis and method — time shifts with their
 * hours, meter readings with the opening from the last closing and the
 * gap, km or trips — with idle and breakdown under the 24-hour cap shown
 * live, the work done, fuel with who bears it and the overrun warning,
 * the hire preview for rented machines (Financial), materials with the
 * stock on the date, remark and files. **Save**, **Save & Add New** (keeps
 * the date, shift and supervisor) and **Save & Approve** for approvers.
 */
export function EquipmentSheetForm({
  projectId,
  sheet,
  source,
  today = localToday(),
  hrefFor,
}: {
  projectId: string;
  /** Edit this sheet. */
  sheet?: EquipmentSheetDetail;
  /** Duplicate: a new sheet prefilled from this one, dated today. */
  source?: EquipmentSheetDetail;
  /** `YYYY-MM-DD`; the device's today unless a story fixes it. */
  today?: string;
  /** Where to go after saving; `failed` names files that did not upload. */
  hrefFor: (id: string, failed?: readonly string[]) => string;
}) {
  const router = useRouter();
  const { data: options } = useSuspenseQuery(
    equipmentSheetFormOptionsQuery(projectId),
  );
  const access = useQuery(siteWorkAccessQuery(projectId)).data;
  const settings = options.settings;
  const create = useCreateEquipmentSheet();
  const update = useUpdateEquipmentSheet(sheet?.id ?? "");
  const uploads = useUploadPendingFiles("equipment_usage");
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const editing = sheet != null;
  const current = sheet ?? source;

  const machineRef = useRef<SheetMachine | null>(null);
  const resolver: Resolver<Values> = (values) => {
    const found = validate(values, settings, machineRef.current, editing);
    const errors = Object.fromEntries(
      Object.entries(found).map(([name, message]) => [
        name,
        { type: "custom", message },
      ]),
    );
    // react-hook-form reads nested names ("timeShifts.0.startTime") from a flat map
    // only through its own setter, so build the nested shape.
    const nested: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(errors)) {
      const parts = name.split(".");
      let node = nested;
      parts.forEach((part, index) => {
        if (index === parts.length - 1) node[part] = value;
        else {
          node[part] ??= /^\d+$/.test(parts[index + 1] ?? "") ? [] : {};
          node = node[part] as Record<string, unknown>;
        }
      });
    }
    return Object.keys(errors).length === 0
      ? { values, errors: {} }
      : { values: {}, errors: nested as never };
  };
  const form = useForm<Values>({
    resolver,
    defaultValues:
      sheet != null
        ? valuesFrom(sheet, sheet.sheetDate, false)
        : source != null
          ? valuesFrom(source, today, true)
          : blank(today),
  });
  const shiftRows = useFieldArray({
    control: form.control,
    name: "timeShifts",
  });
  const lines = useFieldArray({ control: form.control, name: "materials" });
  const values = useWatch({ control: form.control }) as Values;
  const errors = form.formState.errors;
  const message = (name: string): string | undefined => {
    let node: unknown = errors;
    for (const part of name.split("."))
      node = node == null ? undefined : (node as Record<string, unknown>)[part];
    const found = node as { message?: unknown } | undefined;
    return typeof found?.message === "string" ? found.message : undefined;
  };

  // The equipment free on the chosen date (new sheets only).
  const { data: sheetOptions, isFetching: optionsLoading } = useQuery({
    ...equipmentSheetOptionsQuery(projectId, values.sheetDate),
    enabled: !editing && values.sheetDate !== "",
    placeholderData: keepPreviousData,
  });
  const option = sheetOptions?.items.find(
    (item) => item.id === values.equipmentId,
  );
  const machine: SheetMachine | null =
    sheet != null
      ? machineFromSheet(sheet)
      : option != null
        ? machineFromOption(option)
        : null;
  useEffect(() => {
    machineRef.current = machine;
  });

  // A machine that is not free on a new date is unpicked.
  useEffect(() => {
    if (
      !editing &&
      sheetOptions != null &&
      !optionsLoading &&
      values.equipmentId !== "" &&
      option == null
    )
      form.setValue("equipmentId", "");
  }, [editing, form, option, optionsLoading, sheetOptions, values.equipmentId]);

  // The opening reading starts from the last closing (§12).
  const autoOpening = useRef<string | null>(null);
  const lastClosing =
    machine?.lastClosing == null ? null : text(machine.lastClosing.reading);
  useEffect(() => {
    if (editing || machine == null) return;
    const typed = form.getValues("openingReading");
    if (typed === "" || typed === autoOpening.current) {
      form.setValue("openingReading", lastClosing ?? "");
      autoOpening.current = lastClosing ?? "";
    }
  }, [editing, form, lastClosing, machine]);

  const canApprove =
    settings.approvalEnabled &&
    access != null &&
    canInSiteWork(access, "site_work.equipment_usage", "approve");
  const canAddEquipment =
    access != null &&
    (canInSiteWork(access, "site_work.equipment_usage", "create") ||
      canInSiteWork(access, "masters.equipments", "create"));

  // Contractor → Department.
  const contractorOptions = withCurrent(
    options.contractors.map((row) => ({ value: row.id, label: row.name })),
    current?.contractor,
  );
  const contractor = options.contractors.find(
    (row) => row.id === values.contractorId,
  );
  const departmentOptions = withCurrent(
    options.departments
      .filter((row) => contractor?.departmentIds.includes(row.id) === true)
      .map((row) => ({ value: row.id, label: row.name })),
    values.departmentId === current?.department?.id ? current.department : null,
  );
  const supervisorOptions = withCurrent(
    options.supervisors.map((row) => ({ value: row.userId, label: row.name })),
    current?.supervisor == null
      ? null
      : { id: current.supervisor.userId, name: current.supervisor.name },
  );
  const unitOptions = withCurrent(
    options.units.map((row) => ({ value: row.id, label: row.name })),
    current?.approxWorkUnit,
  );

  // Materials: units and the stock on the sheet date.
  const chosen = values.materials
    .map((line) => line.materialId)
    .filter((id) => id !== "");
  const { data: materialRows = [] } = useQuery({
    ...materialOptionsQuery({ ids: chosen }),
    enabled: chosen.length > 0,
    placeholderData: keepPreviousData,
  });
  const unitOf = new Map(materialRows.map((row) => [row.id, row.uomName]));
  const { data: stock } = useQuery({
    ...equipmentSheetStockQuery(
      projectId,
      values.sheetDate,
      chosen,
      sheet?.id ?? null,
    ),
    enabled:
      settings.showMaterials && chosen.length > 0 && values.sheetDate !== "",
    placeholderData: keepPreviousData,
  });

  const live = machine == null ? null : liveFigures(values, machine, settings);
  const fuelUnit =
    machine?.fuelUnit == null ? "units" : FUEL_UNIT_LABELS[machine.fuelUnit];
  const usagePer =
    machine == null
      ? ""
      : { hourly: "h", km: "km", trip: "trip" }[machine.utilisationBasis];
  const hireShown = machine?.ownership === "rented" && live?.hire != null;
  const overlap = overlapIndex(
    values.timeShifts.filter(
      (row) => row.startTime.trim() !== "" || row.endTime.trim() !== "",
    ),
  );

  const submit = async (
    input: Values,
    mode: "save" | "add-new" | "approve",
  ) => {
    if (machine == null) return;
    setError(null);
    setNotice(null);
    const trim = (raw: string) => raw.trim();
    const orNull = (raw: string) => (raw.trim() === "" ? null : raw.trim());
    const fuel = settings.showFuel ? orNull(input.fuelQty) : null;
    const body = {
      sheetDate: input.sheetDate,
      shift: input.shift as (typeof WORK_SHIFTS)[number],
      operatorName: settings.showOperator ? orNull(input.operatorName) : null,
      supervisorUserId: settings.showSupervisor
        ? orNull(input.supervisorUserId)
        : null,
      contractorId: orNull(input.contractorId),
      departmentId: orNull(input.departmentId),
      workItem: orNull(input.workItem),
      siteLocation: settings.showLocation
        ? siteLocationInput(input.siteLocation)
        : null,
      timeShifts: showsShifts(machine)
        ? input.timeShifts
            .filter(
              (row) => trim(row.startTime) !== "" || trim(row.endTime) !== "",
            )
            .map((row) => ({
              startTime: trim(row.startTime),
              endTime: trim(row.endTime),
            }))
        : [],
      openingReading: showsMeter(machine, settings)
        ? orNull(input.openingReading)
        : null,
      closingReading: showsMeter(machine, settings)
        ? orNull(input.closingReading)
        : null,
      usageHours: typesHours(machine, settings)
        ? orNull(input.usageHours)
        : null,
      distanceKm: typesDistance(machine, settings)
        ? orNull(input.distanceKm)
        : null,
      trips:
        machine.utilisationBasis === "trip" && trim(input.trips) !== ""
          ? Number(trim(input.trips))
          : null,
      idleHours: orNull(input.idleHours),
      breakdownHours: settings.showBreakdownHours
        ? orNull(input.breakdownHours)
        : null,
      approxWorkQty: settings.showApproxWorkDone
        ? orNull(input.approxWorkQty)
        : null,
      approxWorkUnitId:
        settings.showApproxWorkDone && trim(input.approxWorkQty) !== ""
          ? input.approxWorkUnitId
          : null,
      fuelQty: fuel,
      fuelBorneBy:
        fuel != null && machine.ownership === "rented"
          ? ((input.fuelBorneBy || null) as
              (typeof FUEL_BORNE_BY)[number] | null)
          : null,
      unitRate:
        hireShown && trim(input.unitRate) !== ""
          ? rupeesToPaise(input.unitRate)
          : null,
      billableQty:
        hireShown && settings.showBillableQty
          ? orNull(input.billableQty)
          : null,
      remark: settings.showRemarks ? orNull(input.remark) : null,
      materials: settings.showMaterials
        ? input.materials.map((line) => ({
            materialId: line.materialId,
            quantity: trim(line.quantity),
          }))
        : [],
      approve: mode === "approve",
    };
    try {
      const saved =
        sheet == null
          ? await create.mutateAsync({
              ...body,
              projectId,
              equipmentId: input.equipmentId,
              duplicatedFromId: source?.id ?? null,
            })
          : await update.mutateAsync({
              ...body,
              expectedUpdatedAt: sheet.updatedAt,
            });
      const { failed } =
        sheet == null && settings.showFiles
          ? await uploads.uploadAll(saved.id, input.files)
          : { failed: [] as string[] };
      if (mode === "add-new") {
        form.reset({
          ...blank(input.sheetDate),
          shift: input.shift,
          supervisorUserId: input.supervisorUserId,
        });
        autoOpening.current = null;
        setNotice(
          failed.length === 0
            ? `${saved.number} saved. Fill in the next usage sheet.`
            : `${saved.number} saved, but ${failed.join(", ")} did not upload. Add ${failed.length === 1 ? "it" : "them"} on the sheet.`,
        );
        return;
      }
      router.push(hrefFor(saved.id, failed));
    } catch (caught) {
      if (caught instanceof QueryHttpError) {
        const field = fieldFor(caught);
        if (field != null) {
          form.setError(field as FieldPath<Values>, {
            message: caught.message,
          });
          return;
        }
      }
      setError(caught);
    }
  };

  const busy = form.formState.isSubmitting;
  const id = (name: string) => `equipment-sheet-${name}`;

  const owned = sheetOptions?.items.filter(
    (item) => item.ownership === "owned",
  );
  const rented = sheetOptions?.items.filter(
    (item) => item.ownership === "rented",
  );

  const picker = !editing && (
    <Section id={id("equipment-heading")} title="Equipment" required>
      {sheetOptions == null ? (
        <p className="text-muted-foreground text-sm" aria-busy="true">
          Finding the equipment free on this date…
        </p>
      ) : sheetOptions.items.length === 0 &&
        sheetOptions.blocked.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No equipment was at this Project on {formatDate(values.sheetDate)}.
        </p>
      ) : (
        <Controller
          control={form.control}
          name="equipmentId"
          render={({ field }) => (
            <RadioGroup
              aria-label="Equipment"
              aria-required
              value={field.value === "" ? null : field.value}
              onValueChange={(value) => {
                field.onChange(value as string);
              }}
              className="space-y-3"
            >
              {(
                [
                  ["Company owned", owned ?? []],
                  ["Rented", rented ?? []],
                ] as const
              ).map(([label, items]) =>
                items.length === 0 ? null : (
                  <div
                    key={label}
                    role="group"
                    aria-label={label}
                    className="space-y-2"
                  >
                    <p className="text-muted-foreground text-xs font-medium">
                      {label}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {items.map((item) => (
                        <RadioCard
                          key={item.id}
                          value={item.id}
                          title={`${item.name} · ${item.equipmentNumber}`}
                          hint={`${UTILISATION_BASIS_LABELS[item.utilisationBasis]} · ${WORKING_TIME_METHOD_LABELS[item.workingTimeMethod]}`}
                          onSelect={(value) => {
                            field.onChange(value);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ),
              )}
              {sheetOptions.blocked.length > 0 && (
                <div role="group" aria-label="Not free" className="space-y-2">
                  <p className="text-muted-foreground text-xs font-medium">
                    Not free on {formatDate(values.sheetDate)}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {sheetOptions.blocked.map(({ equipment, reason }) => (
                      <RadioCard
                        key={equipment.id}
                        value={equipment.id}
                        disabled
                        title={`${equipment.name} · ${equipment.equipmentNumber}`}
                        hint={BLOCKED_REASONS[reason]}
                        onSelect={() => undefined}
                      />
                    ))}
                  </div>
                </div>
              )}
            </RadioGroup>
          )}
        />
      )}
      <FieldError message={errors.equipmentId?.message} />
      {canAddEquipment && (
        <p className="text-muted-foreground text-sm">
          Not listed?{" "}
          <Link
            href={`${equipmentModulePath(projectId, "register")}/new`}
            className="text-primary hover:underline"
          >
            Add equipment to this Project
          </Link>
        </p>
      )}
    </Section>
  );

  const capLine =
    live == null ? null : (
      <p
        role="status"
        className={
          live.overCap
            ? "text-destructive text-sm"
            : "text-muted-foreground text-sm"
        }
      >
        {machine?.utilisationBasis === "hourly"
          ? `Usage ${centiText(live.usage?.usageHours ?? 0)} h + idle + breakdown = ${centiText(live.dayTotal)} of 24 h`
          : `Idle + breakdown = ${centiText(live.dayTotal)} of 24 h`}
        {live.overCap && " — more than a day"}
      </p>
    );

  const working =
    machine == null || live == null ? null : (
      <Section id={id("working-heading")} title="Working time">
        <p className="text-muted-foreground text-xs">
          {UTILISATION_BASIS_LABELS[machine.utilisationBasis]} ·{" "}
          {WORKING_TIME_METHOD_LABELS[machine.workingTimeMethod]}
        </p>
        {showsShifts(machine) && (
          <div className="space-y-2">
            <ol aria-label="Time shifts" className="space-y-2">
              {shiftRows.fields.map((field, index) => {
                const hours = live.rowHours[index];
                const rowId = (name: string) =>
                  id(`shift-${String(index)}-${name}`);
                const rowError =
                  message(`timeShifts.${String(index)}.startTime`) ??
                  message(`timeShifts.${String(index)}.endTime`) ??
                  (overlap === index
                    ? "This shift overlaps another."
                    : undefined);
                return (
                  <li
                    key={field.id}
                    aria-label={`Time shift ${String(index + 1)}`}
                    className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 sm:grid-cols-[8rem_8rem_6rem_auto]"
                  >
                    <div className="space-y-1.5">
                      <Label htmlFor={rowId("start")} required>
                        Start
                      </Label>
                      <Input
                        id={rowId("start")}
                        placeholder="08:00"
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={5}
                        aria-required
                        aria-invalid={rowError != null}
                        {...form.register(`timeShifts.${index}.startTime`)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={rowId("end")} required>
                        End
                      </Label>
                      <Input
                        id={rowId("end")}
                        placeholder="17:30"
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={5}
                        aria-required
                        aria-invalid={rowError != null}
                        {...form.register(`timeShifts.${index}.endTime`)}
                      />
                    </div>
                    <p className="text-muted-foreground col-span-3 text-sm tabular-nums sm:col-span-1 sm:pb-2">
                      {hours == null ? "—" : `${trimDecimal(hours)} h`}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="row-start-1 self-end sm:row-start-auto"
                      aria-label={`Remove time shift ${String(index + 1)}`}
                      onClick={() => {
                        shiftRows.remove(index);
                      }}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                    <div className="col-span-3 sm:col-span-4">
                      <FieldError message={rowError} />
                    </div>
                  </li>
                );
              })}
            </ol>
            {shiftRows.fields.length < EQUIPMENT_SHEET_LIMITS.maxTimeShifts && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  shiftRows.append({ startTime: "", endTime: "" });
                }}
              >
                <Plus aria-hidden="true" />
                Add time shift
              </Button>
            )}
            <p className="text-sm">
              Shift hours:{" "}
              <span className="font-medium tabular-nums">
                {centiText(live.usage?.shiftHours ?? 0)} h
              </span>
              <span className="text-muted-foreground">
                {" "}
                · an end before the start runs past midnight
              </span>
            </p>
          </div>
        )}
        {showsMeter(machine, settings) && (
          <div className="space-y-2">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor={id("opening")} required>
                  Opening reading
                </Label>
                <Input
                  id={id("opening")}
                  inputMode="decimal"
                  autoComplete="off"
                  aria-required
                  aria-invalid={errors.openingReading != null}
                  {...form.register("openingReading")}
                />
                <FieldError message={errors.openingReading?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={id("closing")} required>
                  Closing reading
                </Label>
                <Input
                  id={id("closing")}
                  inputMode="decimal"
                  autoComplete="off"
                  aria-required
                  aria-invalid={errors.closingReading != null}
                  {...form.register("closingReading")}
                />
                <FieldError message={errors.closingReading?.message} />
              </div>
              <p className="text-sm sm:pt-7">
                {machine.utilisationBasis === "km" ? "Distance" : "Meter"}:{" "}
                <span className="font-medium tabular-nums">
                  {live.meterDelta == null
                    ? "—"
                    : `${centiText(live.meterDelta)} ${machine.utilisationBasis === "km" ? "km" : "h"}`}
                </span>
              </p>
            </div>
            {machine.lastClosing != null && (
              <p
                className={
                  live.gap != null && live.gap !== 0
                    ? "text-sm text-amber-700 dark:text-amber-400"
                    : "text-muted-foreground text-sm"
                }
              >
                Last closing {trimDecimal(machine.lastClosing.reading)} on{" "}
                {formatDate(machine.lastClosing.sheetDate)}
                {live.gap != null &&
                  live.gap !== 0 &&
                  ` — a gap of ${centiText(Math.abs(live.gap))} ${live.gap > 0 ? "since then" : "below it"}`}
              </p>
            )}
            {live.usage?.meterMismatch != null && (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                The shifts give {centiText(live.usage.meterMismatch.shiftHours)}{" "}
                h but the meter {centiText(live.usage.meterMismatch.meterHours)}{" "}
                h. Usage is taken from the shifts.
              </p>
            )}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          {typesHours(machine, settings) && (
            <div className="space-y-1.5">
              <Label htmlFor={id("usage-hours")} required>
                Usage hours
              </Label>
              <Input
                id={id("usage-hours")}
                inputMode="decimal"
                autoComplete="off"
                aria-required
                aria-invalid={errors.usageHours != null}
                {...form.register("usageHours")}
              />
              <FieldError message={errors.usageHours?.message} />
            </div>
          )}
          {typesDistance(machine, settings) && (
            <div className="space-y-1.5">
              <Label htmlFor={id("distance")} required>
                Distance (km)
              </Label>
              <Input
                id={id("distance")}
                inputMode="decimal"
                autoComplete="off"
                aria-required
                aria-invalid={errors.distanceKm != null}
                {...form.register("distanceKm")}
              />
              <FieldError message={errors.distanceKm?.message} />
            </div>
          )}
          {machine.utilisationBasis === "trip" && (
            <div className="space-y-1.5">
              <Label htmlFor={id("trips")} required>
                Trips
              </Label>
              <Input
                id={id("trips")}
                inputMode="numeric"
                autoComplete="off"
                aria-required
                aria-invalid={errors.trips != null}
                {...form.register("trips")}
              />
              <FieldError message={errors.trips?.message} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor={id("idle")}>Idle hours</Label>
            <Input
              id={id("idle")}
              inputMode="decimal"
              autoComplete="off"
              aria-invalid={errors.idleHours != null}
              {...form.register("idleHours")}
            />
            <FieldError message={errors.idleHours?.message} />
          </div>
          {settings.showBreakdownHours && (
            <div className="space-y-1.5">
              <Label htmlFor={id("breakdown")}>Breakdown hours</Label>
              <Input
                id={id("breakdown")}
                inputMode="decimal"
                autoComplete="off"
                aria-invalid={errors.breakdownHours != null}
                {...form.register("breakdownHours")}
              />
              <FieldError message={errors.breakdownHours?.message} />
            </div>
          )}
        </div>
        {capLine}
      </Section>
    );

  const work =
    machine == null ? null : (
      <Section id={id("work-heading")} title="Work">
        <div className="grid gap-4 sm:grid-cols-2">
          {settings.showOperator && (
            <div className="space-y-1.5">
              <Label htmlFor={id("operator")}>Operator</Label>
              <Input
                id={id("operator")}
                autoComplete="off"
                maxLength={EQUIPMENT_SHEET_LIMITS.operator}
                aria-invalid={errors.operatorName != null}
                {...form.register("operatorName")}
              />
              <FieldError message={errors.operatorName?.message} />
            </div>
          )}
          {settings.showSupervisor && (
            <SelectField
              id={id("supervisor")}
              label="Supervisor"
              placeholder="Choose a Team Member"
              value={values.supervisorUserId}
              options={supervisorOptions}
              error={errors.supervisorUserId?.message}
              onChange={(next) => {
                form.setValue("supervisorUserId", next, {
                  shouldValidate: true,
                });
              }}
            />
          )}
          <SelectField
            id={id("contractor")}
            label="Contractor (optional)"
            placeholder="No Contractor"
            value={values.contractorId}
            options={contractorOptions}
            error={errors.contractorId?.message}
            onChange={(next) => {
              form.setValue("contractorId", next, { shouldValidate: true });
              const picked = options.contractors.find((row) => row.id === next);
              if (picked?.departmentIds.includes(values.departmentId) !== true)
                form.setValue("departmentId", "");
            }}
          />
          <SelectField
            id={id("department")}
            label="Department (optional)"
            placeholder={
              values.contractorId === ""
                ? "Choose the Contractor first"
                : "No Department"
            }
            disabled={values.contractorId === ""}
            value={values.departmentId}
            options={departmentOptions}
            error={errors.departmentId?.message}
            onChange={(next) => {
              form.setValue("departmentId", next, { shouldValidate: true });
            }}
          />
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={id("work-item")}>Work Item</Label>
            <Input
              id={id("work-item")}
              autoComplete="off"
              maxLength={EQUIPMENT_SHEET_LIMITS.workItem}
              aria-invalid={errors.workItem != null}
              {...form.register("workItem")}
            />
            <FieldError message={errors.workItem?.message} />
          </div>
          {(values.contractorId !== "" || values.departmentId !== "") && (
            <div className="sm:col-span-2">
              <Button
                type="button"
                variant="link"
                size="sm"
                className="px-0"
                onClick={() => {
                  form.setValue("contractorId", "");
                  form.setValue("departmentId", "");
                }}
              >
                Clear Contractor and Department
              </Button>
            </div>
          )}
        </div>
        {settings.showLocation && (
          <div className="max-w-xl space-y-1.5">
            <Controller
              control={form.control}
              name="siteLocation"
              render={({ field }) => (
                <LocationPicker
                  projectId={projectId}
                  id={id("location")}
                  label="Location (optional)"
                  value={field.value}
                  invalid={errors.siteLocation != null}
                  onChange={field.onChange}
                />
              )}
            />
            <FieldError message={errors.siteLocation?.message} />
          </div>
        )}
        {settings.showApproxWorkDone && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={id("approx-qty")}>Approx Work Done</Label>
              <Input
                id={id("approx-qty")}
                inputMode="decimal"
                autoComplete="off"
                aria-invalid={errors.approxWorkQty != null}
                {...form.register("approxWorkQty")}
              />
              <FieldError message={errors.approxWorkQty?.message} />
            </div>
            <SelectField
              id={id("approx-unit")}
              label="Unit"
              placeholder="Choose a unit"
              required={values.approxWorkQty.trim() !== ""}
              value={values.approxWorkUnitId}
              options={unitOptions}
              error={errors.approxWorkUnitId?.message}
              onChange={(next) => {
                form.setValue("approxWorkUnitId", next, {
                  shouldValidate: true,
                });
              }}
            />
          </div>
        )}
      </Section>
    );

  const fuel =
    machine == null || live == null || !settings.showFuel ? null : (
      <Section id={id("fuel-heading")} title="Fuel">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={id("fuel")}>Fuel consumed ({fuelUnit})</Label>
            <Input
              id={id("fuel")}
              inputMode="decimal"
              autoComplete="off"
              aria-invalid={errors.fuelQty != null}
              {...form.register("fuelQty")}
            />
            <FieldError message={errors.fuelQty?.message} />
          </div>
          {machine.ownership === "rented" ? (
            <SelectField
              id={id("fuel-borne-by")}
              label="Borne by"
              placeholder="Who pays for the fuel"
              required={values.fuelQty.trim() !== ""}
              value={values.fuelBorneBy}
              options={FUEL_BORNE_BY.map((value) => ({
                value,
                label: FUEL_BORNE_BY_LABELS[value],
              }))}
              error={errors.fuelBorneBy?.message}
              onChange={(next) => {
                form.setValue("fuelBorneBy", next, { shouldValidate: true });
              }}
            />
          ) : (
            <p className="text-muted-foreground text-sm sm:pt-7">
              Borne by the Company
            </p>
          )}
        </div>
        {live.fuelRate != null && (
          <p
            className={
              live.overrun
                ? "text-destructive text-sm"
                : "text-muted-foreground text-sm"
            }
            role={live.overrun ? "alert" : undefined}
          >
            {live.fuelRate} {fuelUnit}/{usagePer}
            {machine.expectedFuelEfficiency != null &&
              (live.overrun
                ? ` — fuel overrun: above the expected ${trimDecimal(machine.expectedFuelEfficiency)} ${fuelUnit}/${usagePer}`
                : ` (expected up to ${trimDecimal(machine.expectedFuelEfficiency)})`)}
          </p>
        )}
      </Section>
    );

  const hire =
    machine == null || live?.hire == null || !hireShown ? null : (
      <Section id={id("hire-heading")} title="Hire">
        <p className="text-muted-foreground text-xs">
          {machine.hirePartyName ?? "Hire party"} ·{" "}
          {machine.hireBasis == null
            ? ""
            : HIRE_BASIS_LABELS[machine.hireBasis]}{" "}
          at {formatPaise(machine.hireRate ?? 0)}
          {machine.idleChargeable ? " · idle hours are charged" : ""}
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor={id("unit-rate")}>Unit Rate</Label>
            <MoneyInput
              id={id("unit-rate")}
              placeholder={paiseToRupees(Number(live.hire.defaultUnitRate))}
              aria-invalid={errors.unitRate != null}
              {...form.register("unitRate")}
            />
            <FieldError message={errors.unitRate?.message} />
          </div>
          {settings.showBillableQty && (
            <div className="space-y-1.5">
              <Label htmlFor={id("billable")}>
                Billable {billableUnit(machine.hireBasis)}
              </Label>
              <Input
                id={id("billable")}
                inputMode="decimal"
                autoComplete="off"
                placeholder={trimDecimal(
                  decimalText(live.hire.defaultBillableMilli, 3),
                )}
                aria-invalid={errors.billableQty != null}
                {...form.register("billableQty")}
              />
              <FieldError message={errors.billableQty?.message} />
            </div>
          )}
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Hire Cost</p>
            <p
              className="text-lg font-semibold tabular-nums"
              aria-label="Hire Cost"
            >
              {formatPaise(Number(live.hire.hireCost))}
            </p>
            <p className="text-muted-foreground text-xs">
              {formatPaise(Number(live.hire.unitRate))} ×{" "}
              {trimDecimal(decimalText(live.hire.billableMilli, 3))}
            </p>
          </div>
        </div>
        {machine.hireBasis === "monthly" && (
          <p className="text-muted-foreground text-xs">
            A monthly hire bills a day&apos;s share: the monthly rate ÷ the days
            in the month.
          </p>
        )}
      </Section>
    );

  const materials =
    machine == null || !settings.showMaterials ? null : (
      <Section id={id("materials-heading")} title="Material Consumption">
        {lines.fields.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No material consumed. Add grease, oil or spares used, if any.
          </p>
        ) : (
          <ol className="space-y-3">
            {lines.fields.map((field, index) => {
              const line = values.materials[index];
              const lineErrors = errors.materials?.[index];
              const lineId = (name: string) =>
                id(`material-${String(index)}-${name}`);
              const available =
                line == null || line.materialId === "" || stock == null
                  ? null
                  : (stock[line.materialId] ?? "0.000");
              const unit =
                line == null ? undefined : unitOf.get(line.materialId);
              const short =
                available != null &&
                line != null &&
                QUANTITY_PATTERN.test(line.quantity.trim()) &&
                Number(line.quantity) > Number(available);
              return (
                <li
                  key={field.id}
                  aria-label={`Material ${String(index + 1)}`}
                  className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_10rem_auto] sm:items-start"
                >
                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor={lineId("material")} required>
                      Material
                    </Label>
                    <Controller
                      control={form.control}
                      name={`materials.${index}.materialId`}
                      render={({ field: control }) => (
                        <MaterialPicker
                          required
                          id={lineId("material")}
                          value={control.value === "" ? null : control.value}
                          excludeIds={chosen.filter(
                            (value) => value !== control.value,
                          )}
                          invalid={lineErrors?.materialId != null}
                          onChange={(material) => {
                            control.onChange(material?.id ?? "");
                          }}
                        />
                      )}
                    />
                    <FieldError message={lineErrors?.materialId?.message} />
                    {available != null && (
                      <p
                        className={
                          short
                            ? "text-destructive text-xs"
                            : "text-muted-foreground text-xs"
                        }
                      >
                        Available: {formatQuantity(available)}
                        {unit == null ? "" : ` ${unit}`}
                        {short && " — more than the stock on this date"}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={lineId("quantity")} required>
                      Used Qty{unit == null ? "" : ` (${unit})`}
                    </Label>
                    <Input
                      id={lineId("quantity")}
                      inputMode="decimal"
                      autoComplete="off"
                      aria-required
                      aria-invalid={lineErrors?.quantity != null}
                      {...form.register(`materials.${index}.quantity`)}
                    />
                    <FieldError message={lineErrors?.quantity?.message} />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="sm:mt-6"
                    aria-label={`Remove material ${String(index + 1)}`}
                    onClick={() => {
                      lines.remove(index);
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
          </ol>
        )}
        {lines.fields.length < WORKSHEET_LIMITS.maxMaterials && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              lines.append({ materialId: "", quantity: "" });
            }}
          >
            <Plus aria-hidden="true" />
            Add material
          </Button>
        )}
      </Section>
    );

  const other =
    machine == null || (!settings.showRemarks && !settings.showFiles) ? null : (
      <Section id={id("other-heading")} title="Other Details">
        {settings.showRemarks && (
          <div className="space-y-1.5">
            <Label htmlFor={id("remark")}>Remark</Label>
            <Textarea
              id={id("remark")}
              rows={3}
              maxLength={500}
              aria-invalid={errors.remark != null}
              {...form.register("remark")}
            />
            <FieldError message={errors.remark?.message} />
          </div>
        )}
        {settings.showFiles &&
          (editing ? (
            <p className="text-muted-foreground text-sm">
              Add or remove files on the usage sheet page.
            </p>
          ) : (
            <Controller
              control={form.control}
              name="files"
              render={({ field }) => (
                <PendingFilesField
                  documentType="equipment_usage"
                  label="Files"
                  value={field.value}
                  disabled={busy}
                  onChange={field.onChange}
                />
              )}
            />
          ))}
      </Section>
    );

  return (
    <form
      noValidate
      aria-label={
        sheet != null
          ? `Edit ${sheet.number}`
          : source != null
            ? `Duplicate of ${source.number}`
            : "New Equipment Usage sheet"
      }
      className="w-full max-w-4xl space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit((input) => submit(input, "save"))(event);
      }}
    >
      {notice != null && (
        <p
          role="status"
          className="text-sm text-emerald-700 dark:text-emerald-400"
        >
          {notice}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={id("date")} required>
            Sheet Date
          </Label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Previous day"
              disabled={values.sheetDate === ""}
              onClick={() => {
                form.setValue("sheetDate", addDays(values.sheetDate, -1), {
                  shouldValidate: form.formState.isSubmitted,
                });
              }}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Input
              id={id("date")}
              type="date"
              max={today}
              className="min-w-0 flex-1"
              aria-required
              aria-invalid={errors.sheetDate != null}
              {...form.register("sheetDate")}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Next day"
              disabled={values.sheetDate === "" || values.sheetDate >= today}
              onClick={() => {
                form.setValue("sheetDate", addDays(values.sheetDate, 1), {
                  shouldValidate: form.formState.isSubmitted,
                });
              }}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
          <FieldError message={errors.sheetDate?.message} />
        </div>
        <SelectField
          id={id("shift")}
          label="Work Shift"
          placeholder="Choose the shift"
          required
          value={values.shift}
          options={WORK_SHIFTS.map((shift) => ({
            value: shift,
            label: WORK_SHIFT_LABELS[shift],
          }))}
          error={errors.shift?.message}
          onChange={(next) => {
            form.setValue("shift", next, { shouldValidate: true });
          }}
        />
      </div>

      {picker}
      {editing && machine != null && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
          <span className="font-medium">
            {machine.name} · {machine.equipmentNumber}
          </span>
          <OwnershipBadge ownership={machine.ownership} />
          <span className="text-muted-foreground text-xs">
            {UTILISATION_BASIS_LABELS[machine.utilisationBasis]} ·{" "}
            {WORKING_TIME_METHOD_LABELS[machine.workingTimeMethod]}
          </span>
        </div>
      )}
      {working}
      {work}
      {fuel}
      {hire}
      {materials}
      {other}

      <StockErrorAlert error={error} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            router.back();
          }}
        >
          Cancel
        </Button>
        {!editing && (
          <Button
            type="button"
            variant="outline"
            disabled={busy || machine == null}
            onClick={() => {
              void form.handleSubmit((input) => submit(input, "add-new"))();
            }}
          >
            Save &amp; Add New
          </Button>
        )}
        {canApprove && (
          <Button
            type="button"
            variant="outline"
            disabled={busy || machine == null}
            onClick={() => {
              void form.handleSubmit((input) => submit(input, "approve"))();
            }}
          >
            Save &amp; Approve
          </Button>
        )}
        <Button type="submit" disabled={busy}>
          {uploads.uploading
            ? `Uploading files ${String(uploads.done)} of ${String(uploads.total)}`
            : busy
              ? "Saving…"
              : "Save"}
        </Button>
      </div>
    </form>
  );
}
