import { royaltyBpsToPercent } from "../domain/centre";
import type { CentreCounts, CentreRecord } from "./centre-ports";

// JSON-ready. Calendar dates are YYYY-MM-DD; instants are ISO strings.

export type CentreView = {
  id: string;
  name: string;
  code: string;
  ownership: "company_owned" | "franchised";
  status: "active" | "closed";
  phone: string | null;
  email: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  franchiseeName: string | null;
  franchiseePhone: string | null;
  franchiseeEmail: string | null;
  agreementStartOn: string | null;
  agreementEndOn: string | null;
  /** 0–100, up to two decimals. */
  royaltyPercent: number;
  mayOverrideFees: boolean;
  activeChildren: number;
  classrooms: number;
  createdAt: string;
  updatedAt: string;
};

export type CentreListView = { items: CentreView[] };

export function centreView(
  record: CentreRecord,
  counts: CentreCounts,
): CentreView {
  return {
    id: record.id,
    name: record.name,
    code: record.code,
    ownership: record.ownership,
    status: record.status,
    phone: record.phone,
    email: record.email,
    addressLine: record.addressLine,
    city: record.city,
    state: record.state,
    pincode: record.pincode,
    franchiseeName: record.franchiseeName,
    franchiseePhone: record.franchiseePhone,
    franchiseeEmail: record.franchiseeEmail,
    agreementStartOn: record.agreementStartOn,
    agreementEndOn: record.agreementEndOn,
    royaltyPercent: royaltyBpsToPercent(record.royaltyBps),
    mayOverrideFees: record.mayOverrideFees,
    activeChildren: counts.activeChildren,
    classrooms: counts.classrooms,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
