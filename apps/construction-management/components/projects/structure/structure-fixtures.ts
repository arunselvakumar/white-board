import {
  generateWingFloors,
  wingConfig,
  type WingConfigInput,
  type WingType,
} from "@/src/projects/domain/wing-generator";
import type {
  ProjectLocation,
  WingResponse,
  WingsOverview,
} from "@/src/queries/project-structure";

import { mockApi } from "../../../.storybook/mocks/api";
import { project } from "../project-fixtures";

/** Story fixtures for Phases, Wings (CM-402) and Locations (CM-405). */
export const KUMARI_HEIGHTS = project({
  id: "0199c4a0-0000-7000-8000-0000000000b1",
  name: "Kumari Heights",
});

const PROJECT_API = `/api/construction/projects/projects/${KUMARI_HEIGHTS.id}`;
export const WINGS_API = `${PROJECT_API}/wings`;
export const PHASES_API = `${PROJECT_API}/phases`;
export const LOCATIONS_API = `${PROJECT_API}/locations`;

const AT = "2026-10-08T06:30:00.000Z";

let sequence = 0;

function id(): string {
  sequence += 1;
  return `0199c4a0-0000-7000-8000-${sequence.toString(16).padStart(12, "0")}`;
}

type StoryPhase = { id: string; name: string; updatedAt: string };

export const PHASE_1: StoryPhase = {
  id: "0199c4a0-0000-7000-8000-0000000000f1",
  name: "Phase 1",
  updatedAt: AT,
};

export const PHASE_2: StoryPhase = {
  id: "0199c4a0-0000-7000-8000-0000000000f2",
  name: "Phase 2",
  updatedAt: AT,
};

/** A stored Wing generated from a configuration, ids and all. */
export function storyWing(
  phaseId: string,
  type: WingType,
  name: string,
  input: WingConfigInput,
  wingId = id(),
): WingResponse {
  const config = wingConfig(type, input);
  const generated = generateWingFloors(type, config);
  const levels = generated.map(
    (_, index) =>
      generated.length -
      index -
      1 -
      generated.filter((f) => f.kind === "basement").length,
  );
  const floors = generated.map((floor, index) => ({
    id: id(),
    kind: floor.kind,
    name: floor.name,
    level: levels[index] ?? 0,
    units: floor.units.map((unit, position) => ({
      id: id(),
      name: unit,
      position,
    })),
  }));
  return {
    id: wingId,
    phaseId,
    type,
    name,
    config,
    position: 0,
    floors,
    totals: {
      floors: floors.length,
      units: floors.reduce((sum, floor) => sum + floor.units.length, 0),
    },
    createdAt: AT,
    updatedAt: AT,
  };
}

/** Tower A: Commercial, 5 floors × 4, 2 basements (the legacy example). */
export const TOWER_A = storyWing(
  PHASE_1.id,
  "commercial",
  "Tower A",
  { floors: 5, startNumber: 1, unitsPerFloor: 4, basements: 2 },
  "0199c4a0-0000-7000-8000-0000000000a1",
);

export const TOWER_B = storyWing(
  PHASE_1.id,
  "residential",
  "Tower B",
  { floors: 12, startNumber: 1, unitsPerFloor: 6, basements: 1 },
  "0199c4a0-0000-7000-8000-0000000000a2",
);

export const LAYOUT_EAST = storyWing(
  PHASE_2.id,
  "plotting_scheme",
  "Layout East",
  { units: 24, startNumber: 1 },
  "0199c4a0-0000-7000-8000-0000000000a3",
);

export const CHAINAGE: ProjectLocation = {
  id: "0199c4a0-0000-7000-8000-0000000000c1",
  name: "Chainage 0+000 – 2+500",
  description: "Earthwork, GSB and WMM",
  position: 0,
  createdAt: AT,
  updatedAt: AT,
};

export const CULVERT: ProjectLocation = {
  id: "0199c4a0-0000-7000-8000-0000000000c2",
  name: "Culvert C3",
  description: null,
  position: 1,
  createdAt: AT,
  updatedAt: AT,
};

export const TOLL_PLAZA: ProjectLocation = {
  id: "0199c4a0-0000-7000-8000-0000000000c3",
  name: "Toll plaza",
  description: "Six lanes with the admin block",
  position: 2,
  createdAt: AT,
  updatedAt: AT,
};

function overview(
  phases: readonly StoryPhase[],
  wings: readonly WingResponse[],
): WingsOverview {
  const grouped = phases.map((phase, position) => {
    const items = wings
      .filter((wing) => wing.phaseId === phase.id)
      .map((wing) => ({
        id: wing.id,
        phaseId: wing.phaseId,
        type: wing.type,
        name: wing.name,
        position: wing.position,
        floors: wing.totals.floors,
        units: wing.totals.units,
        updatedAt: wing.updatedAt,
      }));
    return {
      id: phase.id,
      name: phase.name,
      position,
      wings: items.length,
      createdAt: AT,
      updatedAt: phase.updatedAt,
      items,
      floors: items.reduce((sum, item) => sum + item.floors, 0),
      units: items.reduce((sum, item) => sum + item.units, 0),
    };
  });
  return {
    phases: grouped,
    totals: {
      wings: wings.length,
      floors: grouped.reduce((sum, phase) => sum + phase.floors, 0),
      units: grouped.reduce((sum, phase) => sum + phase.units, 0),
    },
  };
}

type ApiError = {
  status: number;
  code: string;
  message: string;
  details?: unknown;
};

function refuse(error: ApiError): Response {
  return Response.json(
    { code: error.code, message: error.message, details: error.details },
    { status: error.status },
  );
}

type FloorBody = {
  id?: string;
  kind: WingResponse["floors"][number]["kind"];
  name: string;
  units: { id?: string; name: string }[];
};

function stored(floors: FloorBody[]): WingResponse["floors"] {
  return floors.map((floor, index) => ({
    id: floor.id ?? id(),
    kind: floor.kind,
    name: floor.name,
    level: floors.length - index,
    units: floor.units.map((unit, position) => ({
      id: unit.id ?? id(),
      name: unit.name,
      position,
    })),
  }));
}

/**
 * A structure API that remembers changes for one story: Phases, Wings
 * (with their floors) and Locations. `saveError` refuses the next Wing
 * save; `locationError` the next Location write.
 */
export function mockStructureApi(
  options: {
    phases?: StoryPhase[];
    wings?: WingResponse[];
    locations?: ProjectLocation[];
    saveError?: ApiError;
    locationError?: ApiError;
  } = {},
) {
  let phases = [...(options.phases ?? [PHASE_1, PHASE_2])];
  let wings = [...(options.wings ?? [TOWER_A, TOWER_B, LAYOUT_EAST])];
  let locations = [...(options.locations ?? [CHAINAGE, CULVERT, TOLL_PLAZA])];
  let saveError = options.saveError;
  let locationError = options.locationError;
  const now = () => new Date().toISOString();

  return mockApi((call) => {
    if (call.method === "GET" && call.path === PROJECT_API)
      return Response.json(KUMARI_HEIGHTS);
    if (call.method === "GET" && call.path === WINGS_API)
      return Response.json(overview(phases, wings));
    if (call.method === "POST" && call.path === WINGS_API) {
      if (saveError != null) {
        const error = saveError;
        saveError = undefined;
        return refuse(error);
      }
      const body = call.body as {
        phaseId?: string | null;
        type: WingType;
        name: string;
        config: WingConfigInput;
        floors: FloorBody[];
      };
      if (phases.length === 0) phases = [{ ...PHASE_1, updatedAt: now() }];
      const floors = stored(body.floors);
      const wing: WingResponse = {
        id: id(),
        phaseId: body.phaseId ?? phases[0]?.id ?? PHASE_1.id,
        type: body.type,
        name: body.name.trim(),
        config: wingConfig(body.type, body.config),
        position: wings.length,
        floors,
        totals: {
          floors: floors.length,
          units: floors.reduce((sum, floor) => sum + floor.units.length, 0),
        },
        createdAt: now(),
        updatedAt: now(),
      };
      wings = [...wings, wing];
      return Response.json(wing, { status: 201 });
    }
    const wingMatch = /\/wings\/([^/]+)(\/update|\/delete)?$/.exec(call.path);
    if (wingMatch != null) {
      const found = wings.find((wing) => wing.id === wingMatch[1]);
      if (found == null)
        return refuse({
          status: 404,
          code: "WING_NOT_FOUND",
          message: "This Wing was not found.",
        });
      if (call.method === "GET" && wingMatch[2] == null)
        return Response.json(found);
      if (call.method === "POST" && wingMatch[2] === "/delete") {
        wings = wings.filter((wing) => wing.id !== found.id);
        return new Response(null, { status: 204 });
      }
      if (call.method === "POST" && wingMatch[2] === "/update") {
        if (saveError != null) {
          const error = saveError;
          saveError = undefined;
          return refuse(error);
        }
        const body = call.body as {
          name: string;
          phaseId?: string | null;
          floors: FloorBody[];
        };
        const floors = stored(body.floors);
        const saved: WingResponse = {
          ...found,
          name: body.name.trim(),
          phaseId: body.phaseId ?? found.phaseId,
          floors,
          totals: {
            floors: floors.length,
            units: floors.reduce((sum, floor) => sum + floor.units.length, 0),
          },
          updatedAt: now(),
        };
        wings = wings.map((wing) => (wing.id === found.id ? saved : wing));
        return Response.json(saved);
      }
    }
    if (call.method === "POST" && call.path === PHASES_API) {
      const { name } = call.body as { name: string };
      const phase = { id: id(), name: name.trim(), updatedAt: now() };
      phases = [...phases, phase];
      return Response.json(
        { ...phase, position: phases.length - 1, wings: 0, createdAt: now() },
        { status: 201 },
      );
    }
    const phaseMatch = /\/phases\/([^/]+)\/(rename|delete)$/.exec(call.path);
    if (call.method === "POST" && phaseMatch != null) {
      if (phaseMatch[2] === "delete") {
        phases = phases.filter((phase) => phase.id !== phaseMatch[1]);
        return new Response(null, { status: 204 });
      }
      const { name } = call.body as { name: string };
      phases = phases.map((phase) =>
        phase.id === phaseMatch[1]
          ? { ...phase, name: name.trim(), updatedAt: now() }
          : phase,
      );
      const phase = phases.find((item) => item.id === phaseMatch[1]);
      return Response.json({ ...phase, position: 0, wings: 0, createdAt: AT });
    }
    if (call.method === "GET" && call.path === LOCATIONS_API)
      return Response.json({ items: locations });
    if (call.method === "POST" && call.path.startsWith(LOCATIONS_API)) {
      if (locationError != null) {
        const error = locationError;
        locationError = undefined;
        return refuse(error);
      }
      if (call.path === LOCATIONS_API) {
        const body = call.body as { name: string; description: string | null };
        const location: ProjectLocation = {
          id: id(),
          name: body.name.trim(),
          description: body.description,
          position: locations.length,
          createdAt: now(),
          updatedAt: now(),
        };
        locations = [...locations, location];
        return Response.json(location, { status: 201 });
      }
      const match = /\/locations\/([^/]+)\/(update|move|delete)$/.exec(
        call.path,
      );
      const index = locations.findIndex((item) => item.id === match?.[1]);
      const current = locations[index];
      if (match == null || current == null) return undefined;
      if (match[2] === "delete") {
        locations = locations.filter((item) => item.id !== current.id);
        return new Response(null, { status: 204 });
      }
      if (match[2] === "move") {
        const { direction } = call.body as { direction: "up" | "down" };
        const other = direction === "up" ? index - 1 : index + 1;
        const neighbour = locations[other];
        if (neighbour != null) {
          const next = [...locations];
          next[other] = current;
          next[index] = neighbour;
          locations = next.map((item, position) => ({ ...item, position }));
        }
        return Response.json({ items: locations });
      }
      const body = call.body as { name: string; description: string | null };
      const updated = {
        ...current,
        name: body.name.trim(),
        description: body.description,
        updatedAt: now(),
      };
      locations = locations.map((item) =>
        item.id === current.id ? updated : item,
      );
      return Response.json(updated);
    }
    return undefined;
  });
}
