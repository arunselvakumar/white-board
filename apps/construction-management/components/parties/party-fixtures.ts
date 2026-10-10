import type { LookupItem } from "@/src/queries/masters";
import type { Party } from "@/src/queries/parties";
import type { ProjectOption } from "@/src/queries/projects";

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
  stateCode: null,
  stateName: null,
  contactPerson2: null,
  mobile2: null,
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
