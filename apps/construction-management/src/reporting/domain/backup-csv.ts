/**
 * How a backup writes its files (ADR CM-0021 §8): CSV columns carry the
 * screens' labels and values as people read them (amounts in rupees with
 * two decimals, dates as `YYYY-MM-DD`, enums in words); JSON keeps the
 * raw field names and values (ids, ISO times), with amounts in rupees too
 * so neither file can be misread as paise.
 */

export type BackupColumnType =
  | "id"
  | "text"
  | "number"
  | "money"
  | "date"
  | "datetime"
  | "bool"
  | "enum"
  | "json";

export type BackupColumn = {
  /** JSON field name. */
  field: string;
  /** CSV heading: the screen's label. */
  label: string;
  type: BackupColumnType;
};

/** A raw value as the database returns it. */
export type BackupRawValue = unknown;

/** `12345` paise → `"123.45"`; bigint-safe, negative-safe. */
export function rupeesFromPaise(paise: bigint | number | string): string {
  const value = typeof paise === "bigint" ? paise : BigInt(paise);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const rupees = abs / 100n;
  const rest = String(abs % 100n).padStart(2, "0");
  return `${negative ? "-" : ""}${String(rupees)}.${rest}`;
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function dateOf(value: BackupRawValue): Date | null {
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" && value.length > 0) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/** `not_required` → `Not required`. */
export function enumLabel(value: string): string {
  const words = value.replaceAll("_", " ").trim();
  return words.length === 0
    ? words
    : words.charAt(0).toUpperCase() + words.slice(1);
}

function plainText(value: BackupRawValue): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint")
    return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(plainText).join(", ");
  // Prisma's Decimal (numeric columns) prints itself.
  if (typeof value === "object" && "toFixed" in value && "toString" in value)
    return (value as { toString(): string }).toString();
  return JSON.stringify(value);
}

/** The value as a CSV cell shows it. */
export function csvCell(type: BackupColumnType, value: BackupRawValue): string {
  if (value == null) return "";
  switch (type) {
    case "money":
      return rupeesFromPaise(value as bigint | number | string);
    case "date": {
      const date = dateOf(value);
      return date == null ? plainText(value) : isoDate(date);
    }
    case "datetime": {
      const date = dateOf(value);
      return date == null ? plainText(value) : date.toISOString();
    }
    case "bool":
      return value === true ? "Yes" : value === false ? "No" : plainText(value);
    case "enum":
      return enumLabel(plainText(value));
    case "json":
      return typeof value === "string" ? value : JSON.stringify(value);
    default:
      return plainText(value);
  }
}

/** The value as the JSON file keeps it. */
export function jsonCell(
  type: BackupColumnType,
  value: BackupRawValue,
): unknown {
  if (value == null) return null;
  switch (type) {
    case "money":
      return rupeesFromPaise(value as bigint | number | string);
    case "date": {
      const date = dateOf(value);
      return date == null ? plainText(value) : isoDate(date);
    }
    case "datetime": {
      const date = dateOf(value);
      return date == null ? plainText(value) : date.toISOString();
    }
    case "number":
      if (typeof value === "number") return value;
      if (typeof value === "bigint") return Number(value);
      return plainText(value);
    case "bool":
      return value === true || value === false ? value : plainText(value);
    case "json":
      return value;
    default:
      return plainText(value);
  }
}

/** Spreadsheet apps run a cell that starts with these as a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * One CSV field (RFC 4180): quoted when it holds a comma, quote or line
 * break, or starts or ends with a space; quotes doubled. Text that would
 * start a formula is prefixed with `'` (CSV injection).
 */
export function csvField(
  value: string,
  type: BackupColumnType = "text",
): string {
  let text = value;
  if (
    (type === "text" || type === "enum" || type === "json") &&
    FORMULA_START.test(text)
  )
    text = `'${text}`;
  if (/[",\r\n]/.test(text) || /^\s|\s$/.test(text))
    return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export const CSV_LINE_END = "\r\n";

/** UTF-8 byte order mark: Excel then reads ₹ and Indian scripts right. */
export const CSV_BOM = "\uFEFF";

export function csvHeader(columns: readonly BackupColumn[]): string {
  return (
    columns.map((column) => csvField(column.label)).join(",") + CSV_LINE_END
  );
}

export function csvRow(
  columns: readonly BackupColumn[],
  row: Record<string, BackupRawValue>,
): string {
  return (
    columns
      .map((column) =>
        csvField(csvCell(column.type, row[column.field]), column.type),
      )
      .join(",") + CSV_LINE_END
  );
}

export function jsonRow(
  columns: readonly BackupColumn[],
  row: Record<string, BackupRawValue>,
): Record<string, unknown> {
  return Object.fromEntries(
    columns.map((column) => [
      column.field,
      jsonCell(column.type, row[column.field]),
    ]),
  );
}

/**
 * Collects one entity's CSV and JSON as rows arrive a page at a time:
 * header first, then `add(rows)`, then `finish()` for the two files.
 */
export class BackupEntityWriter {
  private readonly csv: string[];
  private readonly json: string[] = [];
  private count = 0;
  private size: number;

  constructor(private readonly columns: readonly BackupColumn[]) {
    const head = CSV_BOM + csvHeader(columns);
    this.csv = [head];
    this.size = head.length;
  }

  add(rows: readonly Record<string, BackupRawValue>[]): void {
    for (const row of rows) {
      const line = csvRow(this.columns, row);
      const json = JSON.stringify(jsonRow(this.columns, row));
      this.csv.push(line);
      this.json.push(json);
      this.size += line.length + json.length + 2;
      this.count += 1;
    }
  }

  get rows(): number {
    return this.count;
  }

  /** About the files' size in bytes so far (UTF-16 length; close enough). */
  get approximateBytes(): number {
    return this.size;
  }

  finish(): { csv: string; json: string } {
    return {
      csv: this.csv.join(""),
      json:
        this.json.length === 0 ? "[]\n" : `[\n${this.json.join(",\n")}\n]\n`,
    };
  }
}
