/**
 * The columns of the Employee Excel template, import and export (CM-206,
 * ADR CM-0055), in sheet order. Amounts in the sheet are rupees; the API
 * is paise. Department and Role are names; a blank Role is the Company's
 * default "Labour" Role, so sheets made before Employees still import.
 */
export const EMPLOYEE_COLUMNS = [
  {
    key: "name",
    header: "Employee Name*",
    example: "Dhuresh Nawin",
    width: 24,
  },
  {
    key: "employeeCode",
    header: "Employee Id",
    example: "E-001",
    width: 12,
    text: true,
  },
  {
    key: "department",
    header: "Department",
    example: "Human Resources",
    width: 20,
  },
  { key: "role", header: "Role", example: "Labour", width: 18 },
  {
    key: "fatherName",
    header: "Father's Name",
    example: "Nawin Kumar",
    width: 22,
  },
  {
    key: "dateOfBirth",
    header: "Date of Birth",
    example: null,
    width: 14,
    date: true,
  },
  { key: "gender", header: "Gender", example: "Male", width: 10 },
  { key: "bloodGroup", header: "Blood Group", example: null, width: 12 },
  {
    key: "joiningDate",
    header: "Joining Date*",
    example: "2026-10-01",
    width: 14,
    date: true,
  },
  {
    key: "mobile",
    header: "Mobile",
    example: "7708165767",
    width: 16,
    text: true,
  },
  { key: "email", header: "Email", example: null, width: 24 },
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
  // None, one or many, separated by ";" (ADR CM-0033).
  { key: "projects", header: "Projects", example: null, width: 28 },
  {
    key: "labourCategory",
    header: "Labour Category",
    example: null,
    width: 18,
  },
  { key: "address", header: "Address", example: null, width: 30 },
  {
    key: "emergencyContact",
    header: "Emergency Contact",
    example: null,
    width: 20,
  },
  { key: "qualification", header: "Qualification", example: null, width: 20 },
  {
    key: "experienceYears",
    header: "Experience (Years)",
    example: null,
    width: 16,
  },
  {
    key: "specialisation",
    header: "Specialisation",
    example: null,
    width: 18,
  },
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
  { key: "pan", header: "PAN", example: null, width: 14, text: true },
  {
    key: "bankAccountHolder",
    header: "Account Holder",
    example: null,
    width: 22,
  },
  {
    key: "bankAccountNumber",
    header: "Account Number",
    example: null,
    width: 20,
    text: true,
  },
  { key: "bankIfsc", header: "IFSC", example: null, width: 14, text: true },
  { key: "bankName", header: "Bank Name", example: null, width: 20 },
] as const satisfies readonly {
  key: string;
  header: string;
  example: string | number | null;
  width: number;
  text?: boolean;
  date?: boolean;
  money?: boolean;
}[];

export type EmployeeColumnKey = (typeof EMPLOYEE_COLUMNS)[number]["key"];

/** A cell as the workbook reader hands it over. */
export type EmployeeCell = string | number | Date | null;

/** One data row of an uploaded sheet; `row` is the Excel row number. */
export type EmployeeSheetRow = {
  row: number;
  cells: Partial<Record<EmployeeColumnKey, EmployeeCell>>;
};

export const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Between Project names in the Projects column. */
export const PROJECT_SEPARATOR = ";";

export const MAX_IMPORT_ROWS = 1000;

/** What a blank Role cell means: the Company's default Labour Role. */
export const DEFAULT_IMPORT_ROLE = "Labour";
