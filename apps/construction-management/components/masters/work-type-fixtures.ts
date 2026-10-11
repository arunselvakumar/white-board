import type { ApiCall } from "../../.storybook/mocks/api";
import {
  materialOptionsHandler,
  MATERIAL_OPTIONS,
} from "@/components/procurement/material-options-fixtures";
import type { WorkTypeItem } from "@/src/queries/work-types";

import { STORY_DEPARTMENTS } from "./masters-story-support";

/** Story fixtures for Masters → Work Types (CM-601). */

const AT = "2026-10-08T06:30:00.000Z";
const LATER = "2026-10-08T07:00:00.000Z";

const BASE = "/api/construction/masters/work-types";
const DEPARTMENTS = "/api/construction/masters/departments";

function department(name: string) {
  const found = STORY_DEPARTMENTS.find((item) => item.name === name);
  if (found == null) throw new Error(`No story department ${name}`);
  return found;
}

const [CEMENT, STEEL, SAND] = MATERIAL_OPTIONS;

function material(option: (typeof MATERIAL_OPTIONS)[number] | undefined) {
  if (option == null) throw new Error("Missing material option");
  return {
    id: option.id,
    name: option.name,
    unitName: option.uomName,
    disabled: false,
  };
}

function workType(
  n: number,
  name: string,
  departmentName: string,
  extra: Partial<WorkTypeItem> = {},
): WorkTypeItem {
  const dept = department(departmentName);
  return {
    id: `0199a1b2-0000-7000-8000-0000000006${String(n).padStart(2, "0")}`,
    name,
    departmentId: dept.id,
    departmentName: dept.name,
    departmentDisabled: dept.disabled,
    materials: [],
    isSeed: false,
    disabled: false,
    createdAt: AT,
    updatedAt: AT,
    ...extra,
  };
}

export const STORY_WORK_TYPES: WorkTypeItem[] = [
  workType(1, "RCC", "RCC", { isSeed: true }),
  workType(2, "Column casting", "RCC", {
    materials: [material(CEMENT), material(STEEL)],
  }),
  workType(3, "Brick work", "Masonry & Plaster", {
    materials: [material(SAND)],
  }),
  workType(4, "Pipe laying", "Plumbing", { disabled: true }),
];

function conflict(code: string, message: string): Response {
  return Response.json({ code, message }, { status: 409 });
}

/**
 * An in-memory Work Types API for one story, with the departments list and
 * the material picker: list, create, update, disable, enable, delete, with
 * the server's 409s for a taken name, the seed, and Work Types in `inUse`.
 */
export function workTypesHandler(
  options: { initial?: WorkTypeItem[]; inUse?: string[] } = {},
): (call: ApiCall) => Response | undefined {
  let items = [...(options.initial ?? STORY_WORK_TYPES)];
  const taken = (name: string, id?: string) =>
    items.some(
      (item) =>
        item.id !== id && item.name.toLowerCase() === name.trim().toLowerCase(),
    );
  const build = (
    body: { name: string; departmentId: string; materialIds?: string[] },
    current: WorkTypeItem | null,
  ): WorkTypeItem => {
    const dept =
      STORY_DEPARTMENTS.find((item) => item.id === body.departmentId) ??
      department("RCC");
    const known = new Map(
      [
        ...(current?.materials ?? []),
        ...MATERIAL_OPTIONS.map((option) => material(option)),
      ].map((item) => [item.id, item]),
    );
    return {
      ...(current ?? workType(99, "", dept.name)),
      name: body.name.trim(),
      departmentId: dept.id,
      departmentName: dept.name,
      materials: (body.materialIds ?? []).flatMap((id) => {
        const found = known.get(id);
        return found == null ? [] : [found];
      }),
      updatedAt: LATER,
    };
  };
  return (call) => {
    const path = call.path.split("?")[0] ?? "";
    if (call.method === "GET" && path === DEPARTMENTS)
      return Response.json({
        items: STORY_DEPARTMENTS,
        total: STORY_DEPARTMENTS.length,
      });
    const picked = materialOptionsHandler(call);
    if (picked != null) return picked;
    if (call.method === "GET" && path === BASE)
      return Response.json({ items, total: items.length });
    const body = call.body as {
      name: string;
      departmentId: string;
      materialIds?: string[];
    };
    if (call.method === "POST" && path === BASE) {
      if (taken(body.name))
        return conflict(
          "WORK_TYPE_NAME_IN_USE",
          "A Work Type with this name already exists.",
        );
      const created = build(body, null);
      items = [...items, created];
      return Response.json(created, { status: 201 });
    }
    const [, id, action] =
      /^\/api\/construction\/masters\/work-types\/([^/]+)\/(\w+)$/.exec(path) ??
      [];
    const current = items.find((item) => item.id === id);
    if (current == null || call.method !== "POST") return undefined;
    const replace = (next: WorkTypeItem) => {
      items = items.map((item) => (item.id === next.id ? next : item));
      return Response.json(next);
    };
    switch (action) {
      case "update":
        if (taken(body.name, current.id))
          return conflict(
            "WORK_TYPE_NAME_IN_USE",
            "A Work Type with this name already exists.",
          );
        return replace(build(body, current));
      case "disable":
      case "enable":
        return replace({
          ...current,
          disabled: action === "disable",
          updatedAt: LATER,
        });
      case "delete":
        if (current.isSeed)
          return conflict("SEED_IS_READ_ONLY", "This came with the app.");
        if (options.inUse?.includes(current.name) === true)
          return conflict(
            "WORK_TYPE_IN_USE",
            "Daily Worksheets use this Work Type, so it cannot be deleted. Disable it instead.",
          );
        items = items.filter((item) => item.id !== current.id);
        return new Response(null, { status: 204 });
      default:
        return undefined;
    }
  };
}
