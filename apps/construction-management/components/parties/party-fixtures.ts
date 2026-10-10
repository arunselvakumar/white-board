import type { LookupItem } from "@/src/queries/masters";
import type { Party } from "@/src/queries/parties";
import type { ProjectOption } from "@/src/queries/projects";
import type { Quotation } from "@/src/queries/quotations";

/** Story data for the Contractor and Supplier masters (CM-406). */

const AT = "2026-10-08T06:30:00.000Z";

export const TOWER_A: ProjectOption = {
  id: "0199a1b2-0000-7000-8000-0000000000a1",
  name: "Tower A",
  status: "ongoing",
};

export const VILLA: ProjectOption = {
  id: "0199a1b2-0000-7000-8000-0000000000a2",
  name: "Villa Phase 2",
  status: "ongoing",
};

export const PROJECT_OPTIONS: ProjectOption[] = [TOWER_A, VILLA];

function department(id: string, name: string, disabled = false): LookupItem {
  return { id, name, isSeed: true, disabled, createdAt: AT, updatedAt: AT };
}

export const RCC = department("0199a1b2-0000-7000-8000-0000000000d1", "RCC");
export const PLUMBING = department(
  "0199a1b2-0000-7000-8000-0000000000d2",
  "Plumbing",
);
export const PAINTING = department(
  "0199a1b2-0000-7000-8000-0000000000d3",
  "Painting",
  true,
);

export const DEPARTMENT_LIST = {
  items: [PAINTING, PLUMBING, RCC],
  total: 3,
};

export const BALAJI: Party = {
  id: "0199a1b2-0000-7000-8000-0000000000e1",
  name: "Sri Balaji Constructions",
  contactPerson: "Murugan",
  mobile: "+917708165767",
  email: "office@balaji.example",
  address: "12, Anna Nagar, Chennai",
  gstin: "33AAPFA0939F1ZM",
  pan: "AAPFA0939F",
  stateCode: "33",
  stateName: "Tamil Nadu",
  contactPerson2: "Senthil",
  mobile2: "+919840056789",
  isActive: true,
  departments: [
    { id: PAINTING.id, name: PAINTING.name },
    { id: RCC.id, name: RCC.name },
  ],
  projects: [
    { id: TOWER_A.id, name: TOWER_A.name },
    { id: VILLA.id, name: VILLA.name },
  ],
  createdAt: AT,
  updatedAt: AT,
};

export const RAMCO: Party = {
  id: "0199a1b2-0000-7000-8000-0000000000e2",
  name: "Ramco Builders",
  contactPerson: null,
  mobile: null,
  email: null,
  address: null,
  gstin: null,
  pan: null,
  stateCode: null,
  stateName: null,
  contactPerson2: null,
  mobile2: null,
  isActive: false,
  departments: [],
  projects: [],
  createdAt: AT,
  updatedAt: AT,
};

export const KAVERI: Party = {
  id: "0199a1b2-0000-7000-8000-0000000000f1",
  name: "Kaveri Cements",
  contactPerson: "Selvam",
  mobile: "+919840012345",
  email: null,
  address: null,
  gstin: null,
  pan: null,
  stateCode: null,
  stateName: null,
  contactPerson2: null,
  mobile2: null,
  isActive: true,
  departments: [],
  projects: [{ id: TOWER_A.id, name: TOWER_A.name }],
  createdAt: AT,
  updatedAt: AT,
};

export function page(items: Party[]) {
  return { items, nextCursor: null, prevCursor: null, total: items.length };
}

function quotation(
  n: number,
  party: Party,
  partyKind: Quotation["partyKind"],
  fileName: string,
  bytes: number,
  createdAt: string,
  createdByName: string | null,
): Quotation {
  const id = `0199a1b2-0000-7000-8000-0000000001${String(n).padStart(2, "0")}`;
  const list = partyKind === "contractor" ? "contractors" : "suppliers";
  const url = `/api/construction/masters/${list}/${party.id}/quotations/${id}`;
  const pdf = fileName.endsWith(".pdf");
  return {
    id,
    partyKind,
    partyId: party.id,
    partyName: party.name,
    fileName,
    contentType: pdf ? "application/pdf" : "image/jpeg",
    bytes,
    viewable: true,
    url,
    thumbUrl: pdf ? null : `${url}/thumbnail`,
    createdAt,
    createdBy: "user-karthik",
    createdByName,
  };
}

/** Balaji's quotations, newest first. */
export const BALAJI_QUOTATIONS: Quotation[] = [
  quotation(
    1,
    BALAJI,
    "contractor",
    "RCC labour rates Oct 2026.pdf",
    1_258_291,
    "2026-10-08T06:30:00.000Z",
    "Karthik R",
  ),
  quotation(
    2,
    BALAJI,
    "contractor",
    "Plastering quote photo.jpg",
    420 * 1024,
    "2026-09-15T04:00:00.000Z",
    null,
  ),
];

/** Kaveri's quotation, for View Quotations. */
export const KAVERI_QUOTATION = quotation(
  3,
  KAVERI,
  "supplier",
  "Cement OPC 53 rates.pdf",
  310 * 1024,
  "2026-10-02T09:15:00.000Z",
  "Karthik R",
);
