import { can, type Flag, type MemberAccess } from "@/src/shared-kernel/access";
import {
  DomainError,
  forbidden,
  notFound,
} from "@/src/shared-kernel/domain-error";

import type { PartyType } from "../domain/ledger";
import {
  PARTY_TYPE_LABELS,
  type PartyFacts,
  type PartyPlace,
} from "../domain/party";
import type { FinanceTx, PartyFinanceDeps } from "./party-ports";

/** Contractor, Supplier, Other Party and Client money (ADR CM-0017 §14, CM-1107). */
export const PARTIES_MENU = "finance.parties" as const;

/**
 * May the member use `flag` on Parties at this place? A Project checks the
 * Permission Matrix on it; a Store is the Owner's alone in M7 (§14).
 */
export function canOnPlace(
  access: MemberAccess,
  flag: Flag,
  place: PartyPlace,
): boolean {
  if (place.kind === "store") return access.role === "owner";
  return can(access, PARTIES_MENU, flag, { projectId: place.id });
}

export function assertOnPlace(
  access: MemberAccess,
  flag: Flag,
  place: PartyPlace,
): void {
  if (!canOnPlace(access, flag, place))
    throw forbidden(
      "PERMISSION_DENIED",
      place.kind === "store"
        ? "Only the Owner records a Store's supplier invoices and payments."
        : "You do not have permission to do this. Ask the Owner to change your Permission Matrix.",
    );
}

export const partyNotFound = (type: PartyType) =>
  notFound("PARTY_NOT_FOUND", `This ${PARTY_TYPE_LABELS[type]} was not found.`);

/** A live party of any type, with its Projects (and Departments). */
export async function loadParty(
  deps: Pick<PartyFinanceDeps, "directory" | "store">,
  db: FinanceTx,
  workspaceId: string,
  type: PartyType,
  id: string,
): Promise<PartyFacts> {
  if (type === "contractor") {
    const row = (await deps.directory.contractors(db, workspaceId, [id])).get(
      id,
    );
    if (row == null) throw partyNotFound(type);
    return {
      type,
      id,
      name: row.name,
      pan: row.pan,
      projectIds: row.projectIds,
      departmentIds: row.departmentIds,
    };
  }
  if (type === "client") {
    const row = (await deps.directory.clients(db, workspaceId, [id])).get(id);
    if (row == null) throw partyNotFound(type);
    return {
      type,
      id,
      name: row.name,
      pan: row.pan,
      projectIds: row.projectIds,
      departmentIds: [],
    };
  }
  if (type === "supplier") {
    const row = (await deps.directory.suppliers(db, workspaceId, [id])).get(id);
    if (row == null) throw partyNotFound(type);
    return {
      type,
      id,
      name: row.name,
      pan: row.pan,
      projectIds: row.projectIds,
      departmentIds: [],
    };
  }
  const row = (await deps.store.otherParties(db, workspaceId, [id])).get(id);
  if (row == null) throw partyNotFound(type);
  return {
    type,
    id,
    name: row.name,
    pan: row.pan,
    projectIds: row.projectIds,
    departmentIds: [],
  };
}

/** A live Project, or a live Store; 404 otherwise. */
export async function assertPlaceExists(
  deps: Pick<PartyFinanceDeps, "directory">,
  db: FinanceTx,
  workspaceId: string,
  place: PartyPlace,
): Promise<string> {
  const names =
    place.kind === "project"
      ? await deps.directory.projects(db, workspaceId, [place.id])
      : await deps.directory.stores(db, workspaceId, [place.id]);
  const found = names.get(place.id);
  if (found == null)
    throw new DomainError(
      place.kind === "project" ? "PROJECT_NOT_FOUND" : "STORE_NOT_FOUND",
      `This ${place.kind === "project" ? "Project" : "Store"} was not found.`,
      { kind: "not_found" },
    );
  return found.name;
}

export const partyKey = (type: PartyType, id: string) => `${type}:${id}`;

/** Names of parties of any type (deleted ones are left out). */
export async function partyNames(
  deps: Pick<PartyFinanceDeps, "directory" | "store">,
  db: FinanceTx,
  workspaceId: string,
  refs: readonly { partyType: PartyType; partyId: string }[],
): Promise<Map<string, string>> {
  const ids = (type: PartyType) => [
    ...new Set(
      refs.filter((ref) => ref.partyType === type).map((ref) => ref.partyId),
    ),
  ];
  const [contractors, suppliers, others, clients] = await Promise.all([
    deps.directory.contractors(db, workspaceId, ids("contractor")),
    deps.directory.suppliers(db, workspaceId, ids("supplier")),
    deps.store.otherParties(db, workspaceId, ids("other_party")),
    deps.directory.clients(db, workspaceId, ids("client")),
  ]);
  const names = new Map<string, string>();
  for (const [id, row] of contractors)
    names.set(partyKey("contractor", id), row.name);
  for (const [id, row] of suppliers)
    names.set(partyKey("supplier", id), row.name);
  for (const [id, row] of others)
    names.set(partyKey("other_party", id), row.name);
  for (const [id, row] of clients) names.set(partyKey("client", id), row.name);
  return names;
}

export const placeKey = (place: PartyPlace) => `${place.kind}:${place.id}`;

/** Names of Projects and Stores. */
export async function placeNames(
  deps: Pick<PartyFinanceDeps, "directory">,
  db: FinanceTx,
  workspaceId: string,
  places: readonly PartyPlace[],
): Promise<Map<string, string>> {
  const ids = (kind: PartyPlace["kind"]) => [
    ...new Set(places.filter((p) => p.kind === kind).map((p) => p.id)),
  ];
  const [projects, stores] = await Promise.all([
    deps.directory.projects(db, workspaceId, ids("project")),
    deps.directory.stores(db, workspaceId, ids("store")),
  ]);
  const names = new Map<string, string>();
  for (const [id, row] of projects) names.set(`project:${id}`, row.name);
  for (const [id, row] of stores) names.set(`store:${id}`, row.name);
  return names;
}

/** What the audit log keeps: bigints as numbers. */
export function auditable(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      typeof item === "bigint" ? Number(item) : item,
    ]),
  );
}
