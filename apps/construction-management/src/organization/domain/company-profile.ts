/** A Company's details beyond its name (ADR CM-0001). One per Company. */
export type CompanyProfile = {
  id: string;
  workspaceId: string;
  name: string;
  mobile: string | null;
  email: string | null;
  country: string;
  gstin: string | null;
  pan: string | null;
  address: string | null;
  /** ISO 4217, INR unless the Company is not Indian. */
  currency: string;
  isIndian: boolean;
  /** IANA time zone. */
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
};
