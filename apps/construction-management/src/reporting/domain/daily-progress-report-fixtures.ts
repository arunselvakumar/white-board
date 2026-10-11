import type {
  DprEquipmentUsage,
  DprReadModel,
  DprWorksheet,
} from "./daily-progress-report";

/** A worksheet for unit tests: one RCC crew on Shift 1. */
export function dprWorksheet(
  overrides: Partial<DprWorksheet> = {},
): DprWorksheet {
  return {
    id: "ws-1",
    number: "WS/26-27/00001",
    shift: "Shift 1",
    approvalStatus: "not_required",
    contractor: "Sri Balaji Builders",
    department: "RCC",
    workType: "Slab casting",
    location: "Wing A · Floor 3",
    skilled: 4,
    unskilled: 6,
    approxWork: { quantity: "12.500", unit: "Cum" },
    materials: [{ name: "Cement OPC 53", quantity: "10.000", unit: "Bag" }],
    remark: null,
    ...overrides,
  };
}

/** A rented JCB with hire cost, for unit tests. */
export function dprEquipment(
  overrides: Partial<DprEquipmentUsage> = {},
): DprEquipmentUsage {
  return {
    id: "eu-1",
    number: "EU/26-27/00001",
    shift: "Shift 1",
    approvalStatus: "not_required",
    equipmentName: "JCB 3DX",
    equipmentNumber: "TN-09-AB-1234",
    ownership: "rented",
    operator: "Murugan",
    basis: "hourly",
    usageHours: "6.50",
    distanceKm: null,
    trips: null,
    openingReading: "1200.00",
    closingReading: "1206.50",
    idleHours: "1.00",
    breakdownHours: "0.00",
    fuel: { quantity: "18.000", unit: "Litre", borneBy: "company" },
    hireCost: 650_000n,
    location: null,
    workItem: "Excavation",
    ...overrides,
  };
}

/** A full day at Tower A for unit tests; override what a test is about. */
export function dprReadModel(
  overrides: Partial<DprReadModel> = {},
): DprReadModel {
  return {
    company: "Anugraha Engineers",
    project: { name: "Tower A", address: "12 Anna Salai, Chennai" },
    logo: null,
    number: "DPR/26-27/00001",
    date: "2026-10-08",
    filledBy: null,
    money: true,
    includeImages: false,
    diary: {
      weatherMorning: "Sunny",
      weatherAfternoon: "Light rain",
      rainfallMm: "12.5",
      siteCondition: "Wet near the north gate",
      notes: "Slab of the 3rd floor cast.",
      visitors: [
        {
          name: "R. Kannan",
          organisation: "Client",
          purpose: "Slab inspection",
          timeIn: "10:00",
          timeOut: "11:30",
        },
      ],
      instructions: [
        {
          givenBy: "Architect",
          givenTo: "Site Engineer",
          instruction: "Cure the slab for 7 days",
          actionTaken: null,
        },
      ],
    },
    attendance: {
      labourPresent: { skilled: 3, unskilled: 5 },
      labourHalfDay: { skilled: 0, unskilled: 1 },
      vendorFullDay: { skilled: 2, unskilled: 2 },
      vendorHalfDay: { skilled: 0, unskilled: 0 },
    },
    worksheets: [dprWorksheet()],
    equipment: [dprEquipment()],
    received: [
      {
        source: "goods_receipt",
        document: "GRN/26-27/00004",
        from: "Ramco Cements",
        material: "Cement OPC 53",
        quantity: "100.000",
        unit: "Bag",
      },
    ],
    consumed: [
      {
        material: "Cement OPC 53",
        quantity: "10.000",
        unit: "Bag",
        source: "Consumed by WS/26-27/00001",
      },
    ],
    hindrances: [
      {
        number: "HR/26-27/00002",
        cause: "Weather",
        activity: "Slab casting",
        party: "Force majeure",
        since: "2026-10-07",
        daysLost: 2,
        hoursLost: "3.50",
        status: "open",
        location: null,
      },
    ],
    photos: [],
    photosLeftOut: 0,
    ...overrides,
  };
}
