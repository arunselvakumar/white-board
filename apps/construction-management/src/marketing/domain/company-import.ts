import { invalidField } from "./marketing-errors";
import { MARKETING_LIMITS } from "./marketing-terms";
import {
  contactDetails,
  contactMobile,
  optionalText,
  prospectCompanyDetails,
  type ContactDetails,
  type ProspectCompanyDetails,
} from "./prospect-company";

/**
 * The Prospect Company import's columns (PRD §3.3, ADR CM-0040 §11): name,
 * city, phone, and the primary Contact's name and mobile. The template's
 * headers; the reader also takes the other spellings below.
 */
export const COMPANY_IMPORT_COLUMNS = [
  { key: "name", header: "Name", width: 34, example: "Anugraha Steel" },
  { key: "city", header: "City", width: 20, example: "Coimbatore" },
  { key: "phone", header: "Phone", width: 18, example: "0422 2345678" },
  {
    key: "contactName",
    header: "Primary Contact name",
    width: 26,
    example: "Ravi Kumar",
  },
  {
    key: "contactMobile",
    header: "Primary Contact mobile",
    width: 22,
    example: "98765 43210",
  },
] as const;

export type CompanyImportColumnKey =
  (typeof COMPANY_IMPORT_COLUMNS)[number]["key"];

/** Rows one upload may hold; each is its own create. */
export const MAX_COMPANY_IMPORT_ROWS = 500;

export type CompanySheetRow = {
  /** The row number in the sheet (the header is row 1). */
  row: number;
  /** Each cell as text; an empty one is left out. */
  cells: Partial<Record<CompanyImportColumnKey, string>>;
};

export type ImportedCompany = {
  details: ProspectCompanyDetails;
  contact: ContactDetails | null;
};

/**
 * One row checked with the company form's rules: a name, a city and a
 * phone as the form takes them, and a primary Contact when the row names
 * one. A Contact mobile needs the Contact's name. Throws the first
 * problem, its `details.field` a column key.
 */
export function importedCompany(
  cells: CompanySheetRow["cells"],
): ImportedCompany {
  const details = prospectCompanyDetails({
    name: cells.name ?? "",
    city: cells.city ?? null,
    phone: cells.phone ?? null,
  });
  const name = optionalText(cells.contactName);
  const mobile = contactMobile(cells.contactMobile, "contactMobile");
  if (name == null) {
    if (mobile != null)
      throw invalidField(
        "CONTACT_NAME_REQUIRED",
        "Enter the primary Contact's name for this mobile.",
        "contactName",
      );
    return { details, contact: null };
  }
  if (name.length > MARKETING_LIMITS.name)
    throw invalidField(
      "CONTACT_NAME_TOO_LONG",
      `Keep the Contact's name to ${MARKETING_LIMITS.name} characters.`,
      "contactName",
    );
  return { details, contact: contactDetails({ name, mobile }) };
}
