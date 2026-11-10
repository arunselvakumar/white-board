import type {
  OtherParty,
  OtherPartyPage,
} from "@/src/queries/finance-other-parties";
import type { ProjectOption } from "@/src/queries/projects";

/** Story data for Masters → Other Parties (CM-704). */

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

export const LAKSHMI: OtherParty = {
  id: "0199a1b2-0000-7000-8000-0000000000f1",
  name: "Sri Lakshmi Traders",
  mobile: "+917708165767",
  email: "accounts@lakshmi.in",
  gstin: "33AAPFA0939F1ZM",
  pan: "AAPFA0939F",
  stateCode: "33",
  stateName: "Tamil Nadu",
  address: "12, Anna Salai, Chennai",
  projects: [{ id: TOWER_A.id, name: TOWER_A.name }],
  createdAt: AT,
  updatedAt: AT,
};

export const MURUGAN: OtherParty = {
  id: "0199a1b2-0000-7000-8000-0000000000f2",
  name: "Landlord Murugan",
  mobile: null,
  email: null,
  gstin: null,
  pan: null,
  stateCode: null,
  stateName: null,
  address: null,
  projects: [
    { id: TOWER_A.id, name: TOWER_A.name },
    { id: VILLA.id, name: VILLA.name },
  ],
  createdAt: AT,
  updatedAt: AT,
};

export function otherPartyPage(items: OtherParty[]): OtherPartyPage {
  return { items, nextCursor: null, prevCursor: null, total: items.length };
}
