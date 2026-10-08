/**
 * Countries a Company can be registered in, with their default currency and
 * time zone. India first; the rest are where Indian builders also work.
 */
export const COUNTRIES = [
  { code: "IN", name: "India", currency: "INR", timezone: "Asia/Kolkata" },
  {
    code: "AE",
    name: "United Arab Emirates",
    currency: "AED",
    timezone: "Asia/Dubai",
  },
  {
    code: "SA",
    name: "Saudi Arabia",
    currency: "SAR",
    timezone: "Asia/Riyadh",
  },
  { code: "QA", name: "Qatar", currency: "QAR", timezone: "Asia/Qatar" },
  { code: "OM", name: "Oman", currency: "OMR", timezone: "Asia/Muscat" },
  { code: "KW", name: "Kuwait", currency: "KWD", timezone: "Asia/Kuwait" },
  { code: "BH", name: "Bahrain", currency: "BHD", timezone: "Asia/Bahrain" },
  { code: "NP", name: "Nepal", currency: "NPR", timezone: "Asia/Kathmandu" },
  { code: "LK", name: "Sri Lanka", currency: "LKR", timezone: "Asia/Colombo" },
  { code: "BD", name: "Bangladesh", currency: "BDT", timezone: "Asia/Dhaka" },
  {
    code: "SG",
    name: "Singapore",
    currency: "SGD",
    timezone: "Asia/Singapore",
  },
  {
    code: "MY",
    name: "Malaysia",
    currency: "MYR",
    timezone: "Asia/Kuala_Lumpur",
  },
  { code: "KE", name: "Kenya", currency: "KES", timezone: "Africa/Nairobi" },
  {
    code: "GB",
    name: "United Kingdom",
    currency: "GBP",
    timezone: "Europe/London",
  },
  {
    code: "US",
    name: "United States",
    currency: "USD",
    timezone: "America/New_York",
  },
  { code: "CA", name: "Canada", currency: "CAD", timezone: "America/Toronto" },
  {
    code: "AU",
    name: "Australia",
    currency: "AUD",
    timezone: "Australia/Sydney",
  },
] as const;

export type CountryCode = (typeof COUNTRIES)[number]["code"];

export const CURRENCIES = [
  ...new Set(COUNTRIES.map((country) => country.currency)),
] as const;

export function countryByCode(code: string) {
  return COUNTRIES.find((country) => country.code === code) ?? null;
}

export function isCurrency(code: string): boolean {
  return (CURRENCIES as readonly string[]).includes(code);
}

/** Time zones offered on the Company profile: one per listed country. */
export const TIMEZONES = [
  ...new Set(COUNTRIES.map((country) => country.timezone)),
] as const;

export function isTimezone(value: string): boolean {
  return (TIMEZONES as readonly string[]).includes(value);
}
