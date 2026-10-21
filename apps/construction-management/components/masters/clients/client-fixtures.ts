import type {
  Client,
  ClientOption,
  ClientPage,
} from "@/src/queries/masters-clients";

/** Story data for Master records → Clients (CM-1101). */

const AT = "2026-10-21T06:30:00.000Z";

export const BALAJI: Client = {
  id: "0199a1b2-0000-7000-8000-0000000000c1",
  name: "Sri Balaji Developers",
  contactPerson: "Ravi Kumar",
  mobile: "+917708165767",
  email: "accounts@balaji.in",
  address: "12, Anna Salai, Chennai",
  pinCode: "600002",
  gstin: "33AAPFA0939F1ZM",
  pan: "AAPFA0939F",
  tan: "CHEA12345B",
  stateCode: "33",
  stateName: "Tamil Nadu",
  isActive: true,
  createdAt: AT,
  updatedAt: AT,
};

export const HIGHWAYS: Client = {
  id: "0199a1b2-0000-7000-8000-0000000000c2",
  name: "Highways Department",
  contactPerson: null,
  mobile: null,
  email: null,
  address: null,
  pinCode: null,
  gstin: null,
  pan: null,
  tan: null,
  stateCode: "29",
  stateName: "Karnataka",
  isActive: false,
  createdAt: AT,
  updatedAt: AT,
};

export function clientPage(items: Client[]): ClientPage {
  return { items, nextCursor: null, prevCursor: null, total: items.length };
}

export function clientOption(client: Client): ClientOption {
  return {
    id: client.id,
    name: client.name,
    gstin: client.gstin,
    stateCode: client.stateCode,
    isActive: client.isActive,
  };
}
