import type { ApiClient } from "./ApiClient";
import { unique } from "./session";

const MASTERS = "/api/construction/masters";

/** A seeded Measurement Unit's id, e.g. "Bag". */
export async function unitId(api: ApiClient, name: string): Promise<string> {
  const { items } = await api.get<{ items: { id: string; name: string }[] }>(
    `${MASTERS}/measurement-units?limit=100`,
  );
  const found = items.find((item) => item.name === name);
  if (found == null) throw new Error(`No Measurement Unit ${name}`);
  return found.id;
}

/** A Material with a rate and GST, counted in `unit`. */
export async function createMaterial(
  api: ApiClient,
  input: {
    name?: string;
    unit?: string;
    rateRupees?: number;
    gstRate?: string;
    hsnCode?: string;
  } = {},
): Promise<{ id: string; name: string }> {
  const name = input.name ?? unique("OPC 53 Grade Cement");
  const created = await api.post<{ id: string }>(`${MASTERS}/materials`, {
    name,
    uomId: await unitId(api, input.unit ?? "Bag"),
    itemType: "consumable",
    unitRate: (input.rateRupees ?? 400) * 100,
    gstRate: input.gstRate ?? "18",
    hsnCode: input.hsnCode ?? "2523",
  });
  return { id: created.id, name };
}

/** A Supplier in Tamil Nadu (state 33) on `projectIds`. */
export async function createSupplier(
  api: ApiClient,
  input: { name?: string; projectIds?: string[]; gstin?: string } = {},
): Promise<{ id: string; name: string }> {
  const name = input.name ?? unique("Sri Balaji Traders");
  const created = await api.post<{ id: string }>(`${MASTERS}/suppliers`, {
    name,
    gstin: input.gstin ?? null,
    stateCode: "33",
    projectIds: input.projectIds ?? [],
  });
  return { id: created.id, name };
}

/** The id of a seeded entry of a Masters list, e.g. a Department. */
export async function lookupId(
  api: ApiClient,
  list: "departments" | "labour-categories" | "issue-categories" | "work-types",
  name: string,
): Promise<string> {
  const { items } = await api.get<{ items: { id: string; name: string }[] }>(
    `${MASTERS}/${list}?limit=100`,
  );
  const found = items.find((item) => item.name === name);
  if (found == null) throw new Error(`No ${list} entry ${name}`);
  return found.id;
}

/** A Contractor on `projectIds`, working in `departments`. */
export async function createContractor(
  api: ApiClient,
  input: {
    name?: string;
    projectIds?: string[];
    pan?: string;
    departments?: string[];
  } = {},
): Promise<{ id: string; name: string }> {
  const name = input.name ?? unique("Kumar Constructions");
  const departmentIds = await Promise.all(
    (input.departments ?? ["Masonry & Plaster"]).map((department) =>
      lookupId(api, "departments", department),
    ),
  );
  const created = await api.post<{ id: string }>(`${MASTERS}/contractors`, {
    name,
    pan: input.pan ?? null,
    stateCode: "33",
    projectIds: input.projectIds ?? [],
    departmentIds,
  });
  return { id: created.id, name };
}
