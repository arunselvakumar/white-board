/**
 * The columns of the labour Excel template, import and export (CM-206), in
 * sheet order. Amounts in the sheet are rupees; the API is paise.
 */
export const LABOUR_COLUMNS = [
  {
    key: "name",
    header: "Labour Name*",
    example: "Dhuresh Nawin",
    width: 24,
  },
  {
    key: "labourCode",
    header: "Labour Id",
    example: "L-001",
    width: 12,
    text: true,
  },
  {
    key: "fatherName",
    header: "Father's Name",
    example: "Nawin Kumar",
    width: 22,
  },
  {
    key: "joiningDate",
    header: "Joining Date*",
    example: "2026-10-01",
    width: 14,
    date: true,
  },
  { key: "wageType", header: "Wage Type*", example: "Daily", width: 12 },
  {
    key: "wagePerDay",
    header: "Wage per Day (₹)",
    example: 700,
    width: 16,
    money: true,
  },
  {
    key: "wagePerMonth",
    header: "Wage per Month (₹)",
    example: null,
    width: 18,
    money: true,
  },
  {
    key: "overtimeWagePerHour",
    header: "Overtime Wage per Hour (₹)*",
    example: 100,
    width: 24,
    money: true,
  },
  {
    key: "workingHoursPerDay",
    header: "Working Hours per Day",
    example: 8,
    width: 20,
  },
  {
    key: "weeklyHolidays",
    header: "Weekly Holidays",
    example: "Sun",
    width: 18,
  },
  {
    key: "openingBalance",
    header: "Opening Balance (₹)",
    example: 0,
    width: 18,
    money: true,
  },
  { key: "project", header: "Project*", example: null, width: 24 },
  {
    key: "labourCategory",
    header: "Labour Category",
    example: null,
    width: 18,
  },
  { key: "supervisor", header: "Supervisor", example: null, width: 18 },
  {
    key: "contactNumber",
    header: "Contact Number",
    example: "7708165767",
    width: 16,
    text: true,
  },
  { key: "gender", header: "Gender", example: "Male", width: 10 },
  {
    key: "uanNumber",
    header: "UAN Number",
    example: null,
    width: 16,
    text: true,
  },
  {
    key: "esicNumber",
    header: "ESIC Number",
    example: null,
    width: 20,
    text: true,
  },
  {
    key: "aadhaar",
    header: "Aadhaar Number",
    example: null,
    width: 18,
    text: true,
  },
] as const satisfies readonly {
  key: string;
  header: string;
  example: string | number | null;
  width: number;
  text?: boolean;
  date?: boolean;
  money?: boolean;
}[];

export type LabourColumnKey = (typeof LABOUR_COLUMNS)[number]["key"];

/** A cell as the workbook reader hands it over. */
export type LabourCell = string | number | Date | null;

/** One data row of an uploaded sheet; `row` is the Excel row number. */
export type LabourSheetRow = {
  row: number;
  cells: Partial<Record<LabourColumnKey, LabourCell>>;
};

export const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const MAX_IMPORT_ROWS = 1000;
