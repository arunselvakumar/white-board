import { mockApi, type ApiCall } from "../../../.storybook/mocks/api";
import type {
  FunnelStage,
  SalesPickListItem,
  SalesSettings,
} from "@/src/queries/sales-settings";

/** Story fixtures for Inquiries → Settings (CM-1002). */

export const SETTINGS_PROJECT_ID = "0199c4a0-0000-7000-8000-0000000f0001";
const AT = "2026-10-14T06:30:00.000Z";
const LATER = "2026-10-14T07:00:00.000Z";

let next = 0;
function idOf(): string {
  next += 1;
  return `0199c4a0-0000-7000-8000-0000000f${String(next).padStart(4, "0")}`;
}

export function storyStage(
  name: string,
  sortOrder: number,
  extra: Partial<FunnelStage> = {},
): FunnelStage {
  return {
    id: idOf(),
    projectId: SETTINGS_PROJECT_ID,
    name,
    isSeed: true,
    createdAt: AT,
    updatedAt: AT,
    sortOrder,
    openCount: 0,
    ...extra,
  };
}

export function storyPick(
  name: string,
  extra: Partial<SalesPickListItem> = {},
): SalesPickListItem {
  return {
    id: idOf(),
    projectId: SETTINGS_PROJECT_ID,
    name,
    isSeed: true,
    createdAt: AT,
    updatedAt: AT,
    isActive: true,
    usedCount: 0,
    ...extra,
  };
}

/** The seeds, with inquiries in two stages, a source in use and one disabled. */
export function storySettings(
  extra: Partial<SalesSettings> = {},
): SalesSettings {
  return {
    funnelStages: [
      storyStage("New", 1, { openCount: 4 }),
      storyStage("Contacted", 2, { openCount: 1 }),
      storyStage("Site Visit", 3),
      storyStage("Negotiation", 4),
    ],
    leadSources: [
      storyPick("Hoarding", { isActive: false }),
      storyPick("Referral", { usedCount: 3 }),
      storyPick("Walk-in", { usedCount: 6 }),
      storyPick("Website"),
    ],
    lostReasons: [
      storyPick("Budget", { usedCount: 2 }),
      storyPick("Location"),
      storyPick("Wants ready to move", { isSeed: false }),
    ],
    canManage: true,
    ...extra,
  };
}

const LISTS = {
  "funnel-stages": { key: "funnelStages", code: "FUNNEL_STAGE" },
  "lead-sources": { key: "leadSources", code: "LEAD_SOURCE" },
  "lost-reasons": { key: "lostReasons", code: "LOST_REASON" },
} as const;

type ListPath = keyof typeof LISTS;
type Row = FunnelStage | SalesPickListItem;

function conflict(code: string, message: string, details?: unknown): Response {
  return Response.json({ code, message, details }, { status: 409 });
}

/**
 * An in-memory settings API for one story: read, add, rename, move,
 * disable, enable and delete, with the server's 409s for a taken name,
 * a stage with open inquiries and a source or reason in use.
 */
export function salesSettingsHandler(
  initial: SalesSettings = storySettings(),
): (call: ApiCall) => Response | undefined {
  let settings: SalesSettings = structuredClone(initial);
  const base = "/api/construction/sales/settings";
  const rows = (path: ListPath): Row[] => settings[LISTS[path].key];
  const put = (path: ListPath, items: Row[]) => {
    settings = { ...settings, [LISTS[path].key]: items };
  };
  const taken = (path: ListPath, name: string, id?: string) =>
    rows(path).some(
      (row) =>
        row.id !== id && row.name.toLowerCase() === name.trim().toLowerCase(),
    );
  return (call) => {
    const path = call.path.split("?")[0] ?? "";
    if (call.method === "GET" && path === base) return Response.json(settings);
    const body = (call.body ?? {}) as { name?: string; direction?: string };
    const create = /^\/api\/construction\/sales\/settings\/([a-z-]+)$/.exec(
      path,
    );
    if (create != null && call.method === "POST") {
      const list = create[1] as ListPath;
      const name = (body.name ?? "").trim();
      if (taken(list, name))
        return conflict(
          `${LISTS[list].code}_NAME_IN_USE`,
          "A row with this name already exists in this Project.",
          { field: "name" },
        );
      const row: Row =
        list === "funnel-stages"
          ? storyStage(name, rows(list).length + 1, {
              isSeed: false,
              updatedAt: LATER,
            })
          : storyPick(name, { isSeed: false, updatedAt: LATER });
      put(list, [...rows(list), row]);
      return Response.json(row, { status: 201 });
    }
    const item =
      /^\/api\/construction\/sales\/settings\/([a-z-]+)\/([^/]+)\/([a-z]+)$/.exec(
        path,
      );
    if (item == null || call.method !== "POST") return undefined;
    const list = item[1] as ListPath;
    const id = item[2];
    const action = item[3];
    const current = rows(list).find((row) => row.id === id);
    if (current == null) return undefined;
    const replace = (changed: Row) => {
      put(
        list,
        rows(list).map((row) => (row.id === changed.id ? changed : row)),
      );
      return Response.json(changed);
    };
    switch (action) {
      case "update":
        if (taken(list, body.name ?? "", current.id))
          return conflict(
            `${LISTS[list].code}_NAME_IN_USE`,
            "A row with this name already exists in this Project.",
            { field: "name" },
          );
        return replace({
          ...current,
          name: (body.name ?? "").trim(),
          updatedAt: LATER,
        });
      case "disable":
      case "enable":
        return replace({
          ...current,
          isActive: action === "enable",
          updatedAt: LATER,
        });
      case "move": {
        const stages = [...settings.funnelStages];
        const at = stages.findIndex((stage) => stage.id === id);
        const to = body.direction === "up" ? at - 1 : at + 1;
        const moved = stages[at];
        const other = stages[to];
        if (moved != null && other != null) {
          stages[to] = moved;
          stages[at] = other;
        }
        settings = {
          ...settings,
          funnelStages: stages.map((stage, index) => ({
            ...stage,
            sortOrder: index + 1,
          })),
        };
        return Response.json({ items: settings.funnelStages });
      }
      case "delete": {
        if ("openCount" in current && current.openCount > 0)
          return conflict(
            "FUNNEL_STAGE_IN_USE",
            `${String(current.openCount)} open inquiries are in this stage. Move them to another stage first.`,
            { openCount: current.openCount },
          );
        if ("usedCount" in current && current.usedCount > 0)
          return conflict(
            `${LISTS[list].code}_IN_USE`,
            "Inquiries use this, so it cannot be deleted. Disable it instead.",
            { count: current.usedCount },
          );
        put(
          list,
          rows(list).filter((row) => row.id !== current.id),
        );
        return new Response(null, { status: 204 });
      }
      default:
        return undefined;
    }
  };
}

export function mockSalesSettingsApi(initial?: SalesSettings) {
  return mockApi(salesSettingsHandler(initial));
}
