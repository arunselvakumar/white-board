import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

/**
 * The Daily Progress Report as a site diary (CM-606, ADR CM-0016 §15): a
 * typed read model of one Project's day, and the pure builder that lays it
 * out as sections in the order the ADR fixes. The PDF writer prints the
 * sections; nothing here reads a database or draws a page.
 *
 * Labels arrive resolved (Contractor, Department, Work Type, location,
 * shift, weather, cause and party names), so reporting imports no
 * site-work, masters or procurement code.
 */

/** At most this many photos print, using their thumbnails (§15). */
export const DPR_MAX_PHOTOS = 60;

/** What an empty section or table prints instead of being dropped. */
export const NONE_RECORDED = "None recorded.";

export type DprHeadcount = { skilled: number; unskilled: number };

/** An image in private storage the PDF embeds (a thumbnail when there is one). */
export type DprImageRef = { key: string; contentType: string };

export type DprWorksheet = {
  id: string;
  number: string;
  /** "Shift 1". */
  shift: string;
  approvalStatus: "not_required" | "pending" | "approved" | "rejected";
  contractor: string;
  department: string;
  workType: string | null;
  /** One line from the projects context's names ("Wing A · Floor 1"). */
  location: string | null;
  skilled: number | null;
  unskilled: number | null;
  /** Decimal string and its Measurement Unit. */
  approxWork: { quantity: string; unit: string | null } | null;
  materials: { name: string; quantity: string; unit: string }[];
  remark: string | null;
};

export type DprEquipmentUsage = {
  id: string;
  number: string;
  shift: string;
  approvalStatus: DprWorksheet["approvalStatus"];
  equipmentName: string;
  equipmentNumber: string;
  ownership: "owned" | "rented";
  operator: string | null;
  basis: "hourly" | "km" | "trip";
  /** Decimal strings; the one the basis uses is set. */
  usageHours: string | null;
  distanceKm: string | null;
  trips: number | null;
  openingReading: string | null;
  closingReading: string | null;
  idleHours: string;
  breakdownHours: string;
  fuel: {
    quantity: string;
    /** "Litre". */
    unit: string | null;
    borneBy: "company" | "hire_party" | null;
  } | null;
  /** Paise; null when owned, not costed, or the report carries no money. */
  hireCost: bigint | null;
  location: string | null;
  workItem: string | null;
};

/**
 * The Project's attendance that day (CM-0016 §6): Labours present or on a
 * half day count one head each; vendor gangs their full-day and half-day
 * heads. Split by the Labour Category's skill; no category is unskilled.
 */
export type DprAttendance = {
  labourPresent: DprHeadcount;
  labourHalfDay: DprHeadcount;
  vendorFullDay: DprHeadcount;
  vendorHalfDay: DprHeadcount;
};

export type DprReceivedLine = {
  source: "goods_receipt" | "delivery_note";
  /** GRN or Delivery Note number. */
  document: string;
  /** The supplier, or the Central Store it came from. */
  from: string;
  material: string;
  quantity: string;
  unit: string;
};

export type DprConsumedLine = {
  material: string;
  /** Net of reversals, positive. */
  quantity: string;
  unit: string;
  /** "Consumed by WS/26-27/00001", "Current Inventory". */
  source: string;
};

export type DprDiary = {
  weatherMorning: string | null;
  weatherAfternoon: string | null;
  rainfallMm: string | null;
  siteCondition: string | null;
  notes: string | null;
  visitors: {
    name: string;
    organisation: string | null;
    purpose: string | null;
    timeIn: string | null;
    timeOut: string | null;
  }[];
  instructions: {
    givenBy: string;
    givenTo: string | null;
    instruction: string;
    actionTaken: string | null;
  }[];
};

export type DprHindrance = {
  number: string;
  cause: string;
  activity: string;
  /** "Contractor · Sri Balaji Builders", "Client". */
  party: string;
  since: CalendarDate;
  daysLost: number;
  hoursLost: string | null;
  status: "open" | "closed";
  location: string | null;
};

export type DprPhoto = DprImageRef & {
  /** "Worksheet WS/26-27/00001", "Site Diary". */
  caption: string;
};

export type DprReadModel = {
  company: string;
  project: { name: string; address: string | null };
  /** The Project logo, when "Use Project logo on reports" is on. */
  logo: DprImageRef | null;
  number: string;
  date: CalendarDate;
  /** The Filled By Team Member's name; null for everyone. */
  filledBy: string | null;
  /** Hire cost prints (Financial on Equipment Usage at generation). */
  money: boolean;
  includeImages: boolean;
  diary: DprDiary | null;
  attendance: DprAttendance;
  worksheets: DprWorksheet[];
  equipment: DprEquipmentUsage[];
  received: DprReceivedLine[];
  consumed: DprConsumedLine[];
  hindrances: DprHindrance[];
  /** At most `DPR_MAX_PHOTOS`, in print order. */
  photos: DprPhoto[];
  /** Images of the day beyond the limit, not printed. */
  photosLeftOut: number;
};

// ---------------------------------------------------------------------------
// The laid-out document
// ---------------------------------------------------------------------------

export type DprColumn = {
  label: string;
  /** Relative width; the writer scales the row to the page. */
  width: number;
  align?: "left" | "right";
};

export type DprBlock =
  | { type: "facts"; facts: [label: string, value: string][] }
  | {
      type: "table";
      /** A sub-heading above the table. */
      title?: string;
      columns: DprColumn[];
      rows: string[][];
      totals?: string[];
    }
  | { type: "text"; text: string; muted?: boolean }
  | { type: "photos"; photos: DprPhoto[] };

export type DprSection = { title: string; blocks: DprBlock[] };

export type DprDocument = {
  title: string;
  header: {
    company: string;
    project: string;
    address: string | null;
    number: string;
    /** "08 Oct 2026". */
    date: string;
    filledBy: string;
    logo: DprImageRef | null;
    /**
     * The facts under the header; the DPR's number, date and Filled By
     * when left out. Other PDFs on the DPR's layout (the Task Progress
     * Report, CM-805) pass their own.
     */
    facts?: [label: string, value: string][];
    /** What the running header and footer name; number and date by default. */
    reference?: string;
  };
  sections: DprSection[];
};

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** `2026-10-08` → `08 Oct 2026`. */
export function dprDate(value: CalendarDate): string {
  return dateFormat.format(new Date(`${value}T00:00:00.000Z`));
}

/** `12.500` → `12.5`, `10.000` → `10`. */
export function dprQuantity(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

const rupees = new Intl.NumberFormat("en-IN");

/** Paise as `1,23,456.78` (Indian grouping, no symbol). */
export function dprMoney(paise: bigint): string {
  const negative = paise < 0n;
  const absolute = negative ? -paise : paise;
  const whole = rupees.format(absolute / 100n);
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

const text = (value: string | null | undefined): string =>
  value == null || value.trim() === "" ? "—" : value;

const count = (value: number | null): string =>
  value == null ? "—" : String(value);

const empty = (): DprBlock => ({ type: "text", text: NONE_RECORDED });

const sum = (a: DprHeadcount, b: DprHeadcount): DprHeadcount => ({
  skilled: a.skilled + b.skilled,
  unskilled: a.unskilled + b.unskilled,
});

const ZERO: DprHeadcount = { skilled: 0, unskilled: 0 };

function headcountRow(label: string, heads: DprHeadcount): string[] {
  return [
    label,
    String(heads.skilled),
    String(heads.unskilled),
    String(heads.skilled + heads.unskilled),
  ];
}

const APPROVAL_NOTE: Record<DprWorksheet["approvalStatus"], string | null> = {
  not_required: null,
  approved: null,
  pending: "Pending approval",
  rejected: "Rejected",
};

function numbered(sheet: {
  number: string;
  shift: string;
  approvalStatus: DprWorksheet["approvalStatus"];
}): string {
  const note = APPROVAL_NOTE[sheet.approvalStatus];
  return [sheet.number, sheet.shift, note].filter(Boolean).join("\n");
}

function weatherSection(model: DprReadModel): DprSection {
  const diary = model.diary;
  if (diary == null)
    return { title: "Weather and site condition", blocks: [empty()] };
  return {
    title: "Weather and site condition",
    blocks: [
      {
        type: "facts",
        facts: [
          ["Weather, morning", text(diary.weatherMorning)],
          ["Weather, afternoon", text(diary.weatherAfternoon)],
          [
            "Rainfall",
            diary.rainfallMm == null
              ? "—"
              : `${dprQuantity(diary.rainfallMm)} mm`,
          ],
          ["Site condition", text(diary.siteCondition)],
        ],
      },
    ],
  };
}

/** Skilled and unskilled per Contractor and Department, from the worksheets. */
export function labourByContractor(
  worksheets: readonly DprWorksheet[],
): { contractor: string; department: string; heads: DprHeadcount }[] {
  const rows = new Map<
    string,
    { contractor: string; department: string; heads: DprHeadcount }
  >();
  for (const sheet of worksheets) {
    const key = `${sheet.contractor}\u0000${sheet.department}`;
    const row = rows.get(key) ?? {
      contractor: sheet.contractor,
      department: sheet.department,
      heads: ZERO,
    };
    row.heads = sum(row.heads, {
      skilled: sheet.skilled ?? 0,
      unskilled: sheet.unskilled ?? 0,
    });
    rows.set(key, row);
  }
  return [...rows.values()].sort(
    (a, b) =>
      a.contractor.localeCompare(b.contractor) ||
      a.department.localeCompare(b.department),
  );
}

function labourSection(model: DprReadModel): DprSection {
  const byContractor = labourByContractor(model.worksheets);
  const onSheets = byContractor.reduce(
    (total, row) => sum(total, row.heads),
    ZERO,
  );
  const a = model.attendance;
  const attended = [
    a.labourPresent,
    a.labourHalfDay,
    a.vendorFullDay,
    a.vendorHalfDay,
  ].reduce(sum, ZERO);
  const anything =
    byContractor.length > 0 || attended.skilled + attended.unskilled > 0;
  if (!anything) return { title: "Labour", blocks: [empty()] };
  const headColumns: DprColumn[] = [
    { label: "", width: 40 },
    { label: "Skilled", width: 14, align: "right" },
    { label: "Unskilled", width: 14, align: "right" },
    { label: "Total", width: 14, align: "right" },
  ];
  const blocks: DprBlock[] = [
    byContractor.length === 0
      ? { type: "text", text: `By Contractor and Department: ${NONE_RECORDED}` }
      : {
          type: "table",
          title: "By Contractor and Department (worksheets)",
          columns: [
            { label: "Contractor", width: 30 },
            { label: "Department", width: 22 },
            { label: "Skilled", width: 10, align: "right" },
            { label: "Unskilled", width: 10, align: "right" },
            { label: "Total", width: 10, align: "right" },
          ],
          rows: byContractor.map((row) => [
            row.contractor,
            row.department,
            String(row.heads.skilled),
            String(row.heads.unskilled),
            String(row.heads.skilled + row.heads.unskilled),
          ]),
          totals: [
            "Total",
            "",
            String(onSheets.skilled),
            String(onSheets.unskilled),
            String(onSheets.skilled + onSheets.unskilled),
          ],
        },
    {
      type: "table",
      title: "Attendance and worksheets",
      columns: headColumns,
      rows: [
        headcountRow("Labour present", a.labourPresent),
        headcountRow("Labour half day", a.labourHalfDay),
        headcountRow("Vendor full day", a.vendorFullDay),
        headcountRow("Vendor half day", a.vendorHalfDay),
        headcountRow("Attendance", attended),
        headcountRow("On worksheets", onSheets),
      ],
      totals: headcountRow("Difference", {
        skilled: attended.skilled - onSheets.skilled,
        unskilled: attended.unskilled - onSheets.unskilled,
      }),
    },
  ];
  if (model.filledBy != null)
    blocks.push({
      type: "text",
      muted: true,
      text: `Worksheets filled by ${model.filledBy} only; attendance is the whole Project's.`,
    });
  return { title: "Labour", blocks };
}

function worksheetSection(model: DprReadModel): DprSection {
  if (model.worksheets.length === 0)
    return { title: "Worksheets", blocks: [empty()] };
  return {
    title: "Worksheets",
    blocks: [
      {
        type: "table",
        columns: [
          { label: "Number", width: 15 },
          { label: "Contractor / Department", width: 17 },
          { label: "Work Type", width: 11 },
          { label: "Location", width: 14 },
          { label: "Skilled", width: 7, align: "right" },
          { label: "Unskilled", width: 9, align: "right" },
          { label: "Work done", width: 10 },
          { label: "Materials used", width: 16 },
          { label: "Remark", width: 12 },
        ],
        rows: model.worksheets.map((sheet) => [
          numbered(sheet),
          `${sheet.contractor}\n${sheet.department}`,
          text(sheet.workType),
          text(sheet.location),
          count(sheet.skilled),
          count(sheet.unskilled),
          sheet.approxWork == null
            ? "—"
            : `${dprQuantity(sheet.approxWork.quantity)}${sheet.approxWork.unit == null ? "" : ` ${sheet.approxWork.unit}`}`,
          sheet.materials.length === 0
            ? "—"
            : sheet.materials
                .map(
                  (line) =>
                    `${line.name}: ${dprQuantity(line.quantity)} ${line.unit}`,
                )
                .join("\n"),
          text(sheet.remark),
        ]),
      },
    ],
  };
}

const OWNERSHIP: Record<DprEquipmentUsage["ownership"], string> = {
  owned: "Owned",
  rented: "Rented",
};

/** "6.5 h", "42 km", "8 trips", with the meter when read. */
export function utilisation(sheet: DprEquipmentUsage): string {
  const used =
    sheet.basis === "km"
      ? sheet.distanceKm == null
        ? null
        : `${dprQuantity(sheet.distanceKm)} km`
      : sheet.basis === "trip"
        ? sheet.trips == null
          ? null
          : `${String(sheet.trips)} ${sheet.trips === 1 ? "trip" : "trips"}`
        : sheet.usageHours == null
          ? null
          : `${dprQuantity(sheet.usageHours)} h`;
  const meter =
    sheet.openingReading != null && sheet.closingReading != null
      ? `Meter ${dprQuantity(sheet.openingReading)} to ${dprQuantity(sheet.closingReading)}`
      : null;
  return [used ?? "—", meter].filter(Boolean).join("\n");
}

function fuel(sheet: DprEquipmentUsage): string {
  if (sheet.fuel == null) return "—";
  const amount = `${dprQuantity(sheet.fuel.quantity)}${sheet.fuel.unit == null ? "" : ` ${sheet.fuel.unit}`}`;
  const borne =
    sheet.fuel.borneBy == null
      ? null
      : sheet.fuel.borneBy === "company"
        ? "Borne by Company"
        : "Borne by hire party";
  return [amount, borne].filter(Boolean).join("\n");
}

function equipmentSection(model: DprReadModel): DprSection {
  if (model.equipment.length === 0)
    return { title: "Equipment usage", blocks: [empty()] };
  const columns: DprColumn[] = [
    { label: "Equipment", width: 16 },
    { label: "Sheet", width: 14 },
    { label: "Owned / Rented", width: 9 },
    { label: "Operator", width: 12 },
    { label: "Utilisation", width: 14 },
    { label: "Idle h", width: 7, align: "right" },
    { label: "Breakdown h", width: 10, align: "right" },
    { label: "Fuel", width: 12 },
  ];
  if (model.money)
    columns.push({ label: "Hire cost", width: 11, align: "right" });
  const rows = model.equipment.map((sheet) => {
    const row = [
      `${sheet.equipmentName}\n${sheet.equipmentNumber}`,
      numbered(sheet),
      OWNERSHIP[sheet.ownership],
      text(sheet.operator),
      utilisation(sheet),
      dprQuantity(sheet.idleHours),
      dprQuantity(sheet.breakdownHours),
      fuel(sheet),
    ];
    if (model.money)
      row.push(sheet.hireCost == null ? "—" : dprMoney(sheet.hireCost));
    return row;
  });
  // A total only when the day has rented sheets; owned plant has no hire.
  if (!model.money || !model.equipment.some((sheet) => sheet.hireCost != null))
    return {
      title: "Equipment usage",
      blocks: [{ type: "table", columns, rows }],
    };
  const total = model.equipment.reduce(
    (all, sheet) => all + (sheet.hireCost ?? 0n),
    0n,
  );
  const totals = columns.map(() => "");
  totals[0] = "Total hire cost";
  totals[totals.length - 1] = dprMoney(total);
  return {
    title: "Equipment usage",
    blocks: [{ type: "table", columns, rows, totals }],
  };
}

function materialSection(model: DprReadModel): DprSection {
  const blocks: DprBlock[] = [];
  blocks.push(
    model.received.length === 0
      ? { type: "text", text: `Received: ${NONE_RECORDED}` }
      : {
          type: "table",
          title: "Received",
          columns: [
            { label: "Document", width: 18 },
            { label: "From", width: 22 },
            { label: "Material", width: 30 },
            { label: "Quantity", width: 16, align: "right" },
          ],
          rows: model.received.map((line) => [
            `${line.source === "goods_receipt" ? "GRN" : "Delivery Note"}\n${line.document}`,
            line.from,
            line.material,
            `${dprQuantity(line.quantity)} ${line.unit}`,
          ]),
        },
  );
  blocks.push(
    model.consumed.length === 0
      ? { type: "text", text: `Consumed: ${NONE_RECORDED}` }
      : {
          type: "table",
          title: "Consumed",
          columns: [
            { label: "Material", width: 34 },
            { label: "Quantity", width: 18, align: "right" },
            { label: "Source", width: 34 },
          ],
          rows: model.consumed.map((line) => [
            line.material,
            `${dprQuantity(line.quantity)} ${line.unit}`,
            line.source,
          ]),
        },
  );
  return { title: "Materials", blocks };
}

function visitorSection(model: DprReadModel): DprSection {
  const visitors = model.diary?.visitors ?? [];
  if (visitors.length === 0) return { title: "Visitors", blocks: [empty()] };
  return {
    title: "Visitors",
    blocks: [
      {
        type: "table",
        columns: [
          { label: "Name", width: 22 },
          { label: "Organisation", width: 22 },
          { label: "Purpose", width: 30 },
          { label: "In", width: 8 },
          { label: "Out", width: 8 },
        ],
        rows: visitors.map((visitor) => [
          visitor.name,
          text(visitor.organisation),
          text(visitor.purpose),
          text(visitor.timeIn),
          text(visitor.timeOut),
        ]),
      },
    ],
  };
}

function instructionSection(model: DprReadModel): DprSection {
  const instructions = model.diary?.instructions ?? [];
  if (instructions.length === 0)
    return { title: "Instructions", blocks: [empty()] };
  return {
    title: "Instructions",
    blocks: [
      {
        type: "table",
        columns: [
          { label: "Given by", width: 16 },
          { label: "Given to", width: 16 },
          { label: "Instruction", width: 34 },
          { label: "Action taken", width: 26 },
        ],
        rows: instructions.map((row) => [
          row.givenBy,
          text(row.givenTo),
          row.instruction,
          text(row.actionTaken),
        ]),
      },
    ],
  };
}

function hindranceSection(model: DprReadModel): DprSection {
  if (model.hindrances.length === 0)
    return { title: "Hindrances", blocks: [empty()] };
  return {
    title: "Hindrances",
    blocks: [
      {
        type: "table",
        columns: [
          { label: "Number", width: 15 },
          { label: "Cause", width: 14 },
          { label: "Activity", width: 22 },
          { label: "Party", width: 16 },
          { label: "Since", width: 12 },
          { label: "Days lost", width: 8, align: "right" },
          { label: "Status", width: 8 },
        ],
        rows: model.hindrances.map((row) => [
          row.number,
          row.cause,
          row.location == null
            ? row.activity
            : `${row.activity}\n${row.location}`,
          row.party,
          dprDate(row.since),
          row.hoursLost == null
            ? String(row.daysLost)
            : `${String(row.daysLost)}\n(${dprQuantity(row.hoursLost)} h)`,
          row.status === "open" ? "Open" : "Closed",
        ]),
      },
    ],
  };
}

function notesSection(model: DprReadModel): DprSection {
  const notes = model.diary?.notes;
  return {
    title: "Notes",
    blocks: [
      notes == null || notes.trim() === ""
        ? empty()
        : { type: "text", text: notes },
    ],
  };
}

function photoSection(model: DprReadModel): DprSection {
  if (model.photos.length === 0) return { title: "Photos", blocks: [empty()] };
  const blocks: DprBlock[] = [{ type: "photos", photos: model.photos }];
  if (model.photosLeftOut > 0)
    blocks.push({
      type: "text",
      muted: true,
      text: `${String(model.photosLeftOut)} more ${model.photosLeftOut === 1 ? "image was" : "images were"} not printed: a report prints at most ${String(DPR_MAX_PHOTOS)}.`,
    });
  return { title: "Photos", blocks };
}

/**
 * Lays the day out in the ADR's order: weather and site condition; labour
 * (by Contractor and Department, then attendance against worksheets and
 * the difference); worksheets; equipment usage (hire cost only with
 * money); materials received and consumed; visitors; instructions;
 * hindrances; notes; and photos when Include images was ticked. An empty
 * section prints "None recorded.".
 */
export function buildDailyProgressReport(model: DprReadModel): DprDocument {
  const sections = [
    weatherSection(model),
    labourSection(model),
    worksheetSection(model),
    equipmentSection(model),
    materialSection(model),
    visitorSection(model),
    instructionSection(model),
    hindranceSection(model),
    notesSection(model),
  ];
  if (model.includeImages) sections.push(photoSection(model));
  return {
    title: "Daily Progress Report",
    header: {
      company: model.company,
      project: model.project.name,
      address: model.project.address,
      number: model.number,
      date: dprDate(model.date),
      filledBy: model.filledBy ?? "All Team Members",
      logo: model.logo,
    },
    sections,
  };
}
