import type {
  MeasurementFormOptions,
  MeasurementPage,
  MeasurementPhotos,
  MeasurementQuantities,
  MeasurementSheet,
  MeasurementSummary,
} from "@/src/queries/contracts-measurements";

/* Measurement Book story data (CM-1105): a metro depot's footings. */

export const PROJECT = "0199c0de-1105-7000-8000-000000000001";
export const EXCAVATION = "0199c0de-1105-7000-8000-0000000000b1";
export const PCC = "0199c0de-1105-7000-8000-0000000000b2";
export const WORK_ORDER = "0199c0de-1105-7000-8000-0000000000c1";
export const WO_LINE = "0199c0de-1105-7000-8000-0000000000d1";
export const WO_EXTRA = "0199c0de-1105-7000-8000-0000000000d2";
export const SHEET = "0199c0de-1105-7000-8000-000000000101";
const USER = "user-engineer";

export const FORM_OPTIONS: MeasurementFormOptions = {
  role: "contract",
  structure: "locations",
  clientName: "Chennai Metro Rail",
  boqItems: [
    {
      id: EXCAVATION,
      itemNo: "1.1",
      description: "Excavation in ordinary soil",
      uomName: "cum",
      quantity: "100.0000",
      sectionTitle: "Earthwork",
    },
    {
      id: PCC,
      itemNo: "2.1",
      description: "PCC 1:4:8 below footings",
      uomName: "cum",
      quantity: "10.0000",
      sectionTitle: "Concrete",
    },
  ],
  workOrders: [
    {
      id: WORK_ORDER,
      number: "WO/26-27/00001",
      contractorName: "Velan Constructions",
      lines: [
        {
          id: WO_LINE,
          itemNo: "1.1",
          description: "Excavation in ordinary soil",
          uomName: "cum",
          quantity: "40.0000",
        },
        {
          id: WO_EXTRA,
          itemNo: "NB-1",
          description: "Dewatering",
          uomName: "cum",
          quantity: "5.0000",
        },
      ],
    },
  ],
};

export function quantitiesOf(
  side: "client" | "contractor",
  checked: Record<string, string> = {},
): MeasurementQuantities {
  const items =
    side === "client"
      ? FORM_OPTIONS.boqItems
      : (FORM_OPTIONS.workOrders[0]?.lines ?? []);
  return {
    side,
    workOrderId: side === "client" ? null : WORK_ORDER,
    deviationLimitPercent: side === "client" ? "25.00" : null,
    items: items.map((item) => ({
      id: item.id,
      itemNo: item.itemNo,
      description: item.description,
      uomName: item.uomName,
      quantity: item.quantity,
      checked: checked[item.id] ?? "0.0000",
      pending: "0.0000",
      over: false,
      overLimit: false,
      percentOver: null,
    })),
  };
}

const excavationItem = {
  id: EXCAVATION,
  itemNo: "1.1",
  description: "Excavation in ordinary soil",
  uomName: "cum",
  quantity: "100.0000",
};

const pccItem = {
  id: PCC,
  itemNo: "2.1",
  description: "PCC 1:4:8 below footings",
  uomName: "cum",
  quantity: "10.0000",
};

type Row = MeasurementSheet["rows"][number];

function row(id: string, values: Partial<Row>): Row {
  return {
    id,
    boqItemId: EXCAVATION,
    workOrderLineId: null,
    item: excavationItem,
    description: null,
    location: null,
    nos: null,
    length: null,
    breadth: null,
    depth: null,
    direct: false,
    quantity: "0.0000",
    billId: null,
    over: false,
    ...values,
  };
}

const EXCAVATION_MEASURED: MeasurementSheet["items"][number] = {
  itemId: EXCAVATION,
  item: excavationItem,
  planned: "100.0000",
  checked: "0.0000",
  thisSheet: "5.4883",
  total: "5.4883",
  over: false,
  overLimit: false,
  percentOver: null,
};

const ALL_ALLOWED = {
  edit: true,
  delete: true,
  submit: true,
  check: false,
  return: false,
  reopen: false,
  photos: true,
};

/** A client-side sheet: two footings, a strip and an opening deducted. */
export function sheetOf(overrides: Partial<MeasurementSheet> = {}) {
  const sheet: MeasurementSheet = {
    id: SHEET,
    projectId: PROJECT,
    side: "client",
    workOrderId: null,
    workOrderNumber: null,
    partyLabel: "Chennai Metro Rail",
    measuredOn: "2026-10-20",
    title: "Footings F1–F4",
    status: "draft",
    rowCount: 4,
    photoCount: 0,
    billed: false,
    partyName: null,
    partyRole: null,
    jointOn: null,
    createdAt: "2026-10-20T06:00:00.000Z",
    updatedAt: "2026-10-20T06:00:00.000Z",
    remarks: "Measured with the site engineer at 10 am.",
    returnReason: null,
    reopenReason: null,
    submittedAt: null,
    submittedBy: null,
    submittedByName: null,
    checkedAt: null,
    checkedBy: null,
    checkedByName: null,
    createdBy: USER,
    createdByName: "Priya Raman",
    projectName: "Metro Depot",
    role: "contract",
    rows: [
      row("0199c0de-1105-7000-8000-000000000201", {
        description: "Footing F1",
        nos: "2.0000",
        length: "3.5000",
        breadth: "1.2000",
        depth: "0.4500",
        quantity: "3.7800",
      }),
      row("0199c0de-1105-7000-8000-000000000202", {
        description: "Strip footing",
        length: "12.5000",
        depth: "0.1500",
        quantity: "1.8750",
      }),
      row("0199c0de-1105-7000-8000-000000000203", {
        description: "Sump opening",
        nos: "-1.0000",
        length: "0.3333",
        breadth: "0.5000",
        quantity: "-0.1667",
      }),
      row("0199c0de-1105-7000-8000-000000000204", {
        boqItemId: PCC,
        item: pccItem,
        description: "PCC bed",
        direct: true,
        quantity: "4.2500",
      }),
    ],
    items: [
      EXCAVATION_MEASURED,
      {
        itemId: PCC,
        item: pccItem,
        planned: "10.0000",
        checked: "0.0000",
        thisSheet: "4.2500",
        total: "4.2500",
        over: false,
        overLimit: false,
        percentOver: null,
      },
    ],
    deviationLimitPercent: "25.00",
    warnings: [],
    viewerFlags: [
      "create",
      "read",
      "update",
      "delete",
      "approve",
      "print",
      "report",
      "notification",
    ],
    allowed: ALL_ALLOWED,
    ...overrides,
  };
  return sheet;
}

/** Submitted and waiting for the joint measurement. */
export function submittedSheet(): MeasurementSheet {
  return sheetOf({
    status: "submitted",
    submittedAt: "2026-10-20T08:00:00.000Z",
    submittedBy: USER,
    submittedByName: "Priya Raman",
    allowed: {
      ...ALL_ALLOWED,
      edit: false,
      submit: false,
      check: true,
      return: true,
    },
  });
}

/** Checked (the JMR), with PCC measured past the BOQ and the limit. */
export function checkedSheet(
  overrides: Partial<MeasurementSheet> = {},
): MeasurementSheet {
  const base = sheetOf();
  return sheetOf({
    status: "checked",
    submittedAt: "2026-10-20T08:00:00.000Z",
    submittedBy: USER,
    submittedByName: "Priya Raman",
    checkedAt: "2026-10-21T05:00:00.000Z",
    checkedBy: "user-pm",
    checkedByName: "Arun Kumar",
    partyName: "R. Kumar",
    partyRole: "Client's engineer",
    jointOn: "2026-10-21",
    rows: base.rows.map((entry, index) =>
      index === 3 ? { ...entry, over: true } : entry,
    ),
    items: [
      EXCAVATION_MEASURED,
      {
        itemId: PCC,
        item: pccItem,
        planned: "10.0000",
        checked: "9.0000",
        thisSheet: "4.2500",
        total: "13.2500",
        over: true,
        overLimit: true,
        percentOver: "32.50",
      },
    ],
    allowed: {
      edit: false,
      delete: true,
      submit: false,
      check: false,
      return: false,
      reopen: true,
      photos: true,
    },
    ...overrides,
  });
}

/** A contractor-side sheet measuring line 1.1 past the Work Order. */
export function contractorSheet(): MeasurementSheet {
  const lineItem = {
    id: WO_LINE,
    itemNo: "1.1",
    description: "Excavation in ordinary soil",
    uomName: "cum",
    quantity: "40.0000",
  };
  return sheetOf({
    side: "contractor",
    workOrderId: WORK_ORDER,
    workOrderNumber: "WO/26-27/00001",
    partyLabel: "Velan Constructions",
    status: "submitted",
    title: "Pit excavation",
    deviationLimitPercent: null,
    rowCount: 2,
    rows: [
      row("0199c0de-1105-7000-8000-000000000301", {
        boqItemId: null,
        workOrderLineId: WO_LINE,
        item: lineItem,
        description: "Pits P1–P8",
        nos: "8.0000",
        quantity: "8.0000",
      }),
      row("0199c0de-1105-7000-8000-000000000302", {
        boqItemId: null,
        workOrderLineId: WO_LINE,
        item: lineItem,
        description: "Pits P9–P12",
        nos: "4.0000",
        quantity: "4.0000",
        over: true,
      }),
    ],
    items: [
      {
        itemId: WO_LINE,
        item: lineItem,
        planned: "40.0000",
        checked: "30.0000",
        thisSheet: "12.0000",
        total: "42.0000",
        over: true,
        overLimit: false,
        percentOver: "5.00",
      },
    ],
    warnings: [
      {
        lineId: WO_LINE,
        message:
          "Line 1.1 is measured at 42 against 40 on the Work Order. A bill will refuse the extra (WORK_ORDER_QUANTITY_EXCEEDED): amend the Work Order first.",
      },
    ],
    allowed: {
      edit: false,
      delete: true,
      submit: false,
      check: true,
      return: true,
      reopen: false,
      photos: true,
    },
  });
}

function summaryOf(sheet: MeasurementSheet): MeasurementSummary {
  return {
    id: sheet.id,
    projectId: sheet.projectId,
    side: sheet.side,
    workOrderId: sheet.workOrderId,
    workOrderNumber: sheet.workOrderNumber,
    partyLabel: sheet.partyLabel,
    measuredOn: sheet.measuredOn,
    title: sheet.title,
    status: sheet.status,
    rowCount: sheet.rowCount,
    photoCount: sheet.photoCount,
    billed: sheet.billed,
    partyName: sheet.partyName,
    partyRole: sheet.partyRole,
    jointOn: sheet.jointOn,
    createdAt: sheet.createdAt,
    updatedAt: sheet.updatedAt,
  };
}

export const SUMMARIES: MeasurementSummary[] = [
  summaryOf(sheetOf({ id: "0199c0de-1105-7000-8000-000000000111" })),
  summaryOf({
    ...contractorSheet(),
    id: "0199c0de-1105-7000-8000-000000000112",
    measuredOn: "2026-10-19",
  }),
  summaryOf({
    ...checkedSheet(),
    id: "0199c0de-1105-7000-8000-000000000113",
    measuredOn: "2026-10-18",
  }),
  summaryOf({
    ...checkedSheet({ billed: true }),
    id: "0199c0de-1105-7000-8000-000000000114",
    measuredOn: "2026-10-12",
    title: "Raft, first pour",
  }),
];

export function pageOf(
  items: MeasurementSummary[] = SUMMARIES,
): MeasurementPage {
  return {
    items,
    nextCursor: null,
    prevCursor: null,
    total: items.length,
    viewerFlags: ["create", "read", "update", "approve"],
  };
}

export const NO_PHOTOS: MeasurementPhotos = { items: [], canUpload: true };
