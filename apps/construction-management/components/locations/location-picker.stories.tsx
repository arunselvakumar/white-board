import { zodResolver } from "@hookform/resolvers/zod";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { expect, waitFor, within } from "storybook/test";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";

import { FieldError } from "@/components/auth/field-error";
import type {
  LocationOptions,
  LocationOptionWing,
} from "@/src/queries/location-options";
import type { LocationRef } from "@/src/shared-kernel/location-ref";

import { mockApi, StoryQueries } from "../../.storybook/mocks/api";
import { LocationLabel, LocationPicker, UNITS_SHOWN } from "./location-picker";

const PROJECT = "0199c0de-0000-7000-8000-00000000a001";
const PATH = `/api/construction/projects/projects/${PROJECT}/location-options`;

let serial = 0;
/** A fresh v7-shaped id per row, so ids never collide between fixtures. */
function nextId(): string {
  serial += 1;
  return `0199c0de-0000-7000-8000-${String(serial).padStart(12, "0")}`;
}

function commercialWing(
  name: string,
  phaseName: string,
  floors = 1,
  unitsPerFloor = 2,
): LocationOptionWing {
  const unitsOn = (prefix: string) =>
    Array.from({ length: unitsPerFloor }, (_, index) => ({
      id: nextId(),
      name: `${prefix}${String(index + 1).padStart(2, "0")}`,
    }));
  return {
    id: nextId(),
    name,
    phaseName,
    floors: [
      { id: nextId(), name: "Terrace Floor", kind: "terrace", units: [] },
      ...Array.from({ length: floors }, (_, index) => {
        const number = floors - index;
        return {
          id: nextId(),
          name: `Commercial Floor ${String(number)}`,
          kind: "typed" as const,
          units: unitsOn(String(number)),
        };
      }),
      {
        id: nextId(),
        name: "Ground Floor",
        kind: "ground",
        units: unitsOn("G"),
      },
    ],
  };
}

const WING_A = commercialWing("Wing A", "Phase 1");
const WING_B = commercialWing("Wing B", "Phase 2");
const PLOTS: LocationOptionWing = {
  id: nextId(),
  name: "Plots East",
  phaseName: "Phase 2",
  floors: [
    {
      id: nextId(),
      name: "Plots",
      kind: "site",
      units: [1, 2, 3].map((n) => ({
        id: nextId(),
        name: `Plot ${String(n)}`,
      })),
    },
  ],
};
const POOL = { id: nextId(), name: "Swimming Pool" };
const CLUB = { id: nextId(), name: "Club House" };
const WALL = { id: nextId(), name: "Compound Wall" };
const CULVERT = { id: nextId(), name: "Culvert C3" };
const TOLL = { id: nextId(), name: "Toll plaza" };

const EVERYTHING: LocationOptions = {
  structure: "wings",
  types: ["wing", "amenity", "common_development", "location"],
  wings: [WING_A, WING_B, PLOTS],
  amenities: [CLUB, POOL],
  commonDevelopments: [WALL],
  locations: [CULVERT],
};

const ROAD: LocationOptions = {
  structure: "locations",
  types: ["location"],
  wings: [],
  amenities: [],
  commonDevelopments: [],
  locations: [CULVERT, TOLL],
};

/** 40 typed floors of 50 units: 2,050 Units with Ground. */
const TOWER = commercialWing("Tower 1", "Phase 1", 40, 50);
const BIG: LocationOptions = {
  structure: "wings",
  types: ["wing"],
  wings: [TOWER],
  amenities: [],
  commonDevelopments: [],
  locations: [],
};

const EMPTY = (structure: LocationOptions["structure"]): LocationOptions => ({
  structure,
  types: [],
  wings: [],
  amenities: [],
  commonDevelopments: [],
  locations: [],
});

function serve(options: LocationOptions) {
  return () => {
    const api = mockApi(({ method, path }) =>
      method === "GET" && path === PATH ? Response.json(options) : undefined,
    );
    return api.restore;
  };
}

/** The picker with its value shown, as a site entry form would hold it. */
function Harness({ initial = null }: { initial?: LocationRef | null }) {
  const [value, setValue] = useState<LocationRef | null>(initial);
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-4">
        <LocationPicker projectId={PROJECT} value={value} onChange={setValue} />
        <p className="text-sm">
          Chosen:{" "}
          <output aria-label="Chosen location">
            {value == null ? (
              "Nothing yet"
            ) : (
              <LocationLabel projectId={PROJECT} value={value} />
            )}
          </output>
        </p>
        <pre
          aria-label="LocationRef"
          className="text-muted-foreground text-xs break-all whitespace-pre-wrap"
        >
          {JSON.stringify(value)}
        </pre>
      </div>
    </div>
  );
}

const meta = {
  title: "Locations/LocationPicker",
  component: Harness,
  beforeEach: serve(EVERYTHING),
  render: (args) => (
    <StoryQueries>
      <Harness {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof Harness>;

export default meta;
type Story = StoryObj<typeof meta>;

type Canvas = {
  findByLabelText: (
    text: string,
    options?: { selector: string },
  ) => Promise<HTMLElement>;
  getByLabelText: (text: string) => HTMLElement;
};
type Body = {
  findByRole: (
    role: "option",
    options: { name: string | RegExp },
  ) => Promise<HTMLElement>;
};
type User = { click: (element: Element) => Promise<void> };

/** The control a label names, not the group named after it. */
const CONTROL = { selector: "button, input" };

async function choose(
  canvas: Canvas,
  body: Body,
  userEvent: User,
  field: string,
  option: string | RegExp,
): Promise<void> {
  await userEvent.click(await canvas.findByLabelText(field, CONTROL));
  await userEvent.click(await body.findByRole("option", { name: option }));
}

function chosenRef(canvas: Canvas): unknown {
  return JSON.parse(
    canvas.getByLabelText("LocationRef").textContent,
  ) as unknown;
}

const floorOf = (wing: LocationOptionWing, index: number) => {
  const floor = wing.floors[index];
  if (floor === undefined) throw new Error(`No floor ${String(index)}`);
  return floor;
};

export const WingFloorsAndUnits: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await choose(canvas, body, userEvent, "Location Type", "Wing");
    // Wings grouped by Phase.
    await userEvent.click(canvas.getByLabelText("Wing"));
    const wings = within(await body.findByRole("listbox", { name: "Wings" }));
    await expect(wings.getByText("Phase 1")).toBeVisible();
    await expect(wings.getByText("Phase 2")).toBeVisible();
    await userEvent.click(wings.getByRole("option", { name: "Wing B" }));
    await expect(chosenRef(canvas)).toEqual({
      type: "wing",
      wingId: WING_B.id,
      floorIds: [],
      unitIds: [],
    });

    await choose(canvas, body, userEvent, "Floors", "Commercial Floor 1");
    await userEvent.keyboard("{Escape}");
    // Units: only the chosen Floor's.
    await userEvent.click(canvas.getByLabelText("Units"));
    const units = within(await body.findByRole("listbox", { name: "Units" }));
    await expect(
      units.getAllByRole("option").map((option) => option.textContent),
    ).toEqual(["101Commercial Floor 1", "102Commercial Floor 1"]);
    await userEvent.click(units.getByRole("option", { name: /^102/ }));
    await userEvent.keyboard("{Escape}");

    await expect(canvas.getByLabelText("Chosen location")).toHaveTextContent(
      "Wing B · Commercial Floor 1 · Unit 102",
    );
    await expect(chosenRef(canvas)).toEqual({
      type: "wing",
      wingId: WING_B.id,
      floorIds: [floorOf(WING_B, 1).id],
      unitIds: [floorOf(WING_B, 1).units[1]?.id],
    });
  },
};

export const UnitsFollowTheFloors: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await choose(canvas, body, userEvent, "Location Type", "Wing");
    await choose(canvas, body, userEvent, "Wing", "Wing A");
    // No Floor chosen: every Unit of the Wing.
    await userEvent.click(canvas.getByLabelText("Units"));
    const units = within(await body.findByRole("listbox", { name: "Units" }));
    await expect(units.getAllByRole("option")).toHaveLength(4);
    await userEvent.click(units.getByRole("option", { name: /^G01/ }));
    await userEvent.click(units.getByRole("option", { name: /^101/ }));
    await userEvent.keyboard("{Escape}");
    await expect(canvas.getByLabelText("Chosen location")).toHaveTextContent(
      "Wing A · Units G01, 101",
    );

    // Choosing Commercial Floor 1 drops the Ground Floor's G01.
    await choose(canvas, body, userEvent, "Floors", "Commercial Floor 1");
    await userEvent.keyboard("{Escape}");
    await expect(canvas.getByLabelText("Chosen location")).toHaveTextContent(
      "Wing A · Commercial Floor 1 · Unit 101",
    );
    await expect(
      canvas.queryByRole("button", { name: "Remove G01" }),
    ).toBeNull();

    // Changing the Wing clears Floors and Units.
    await choose(canvas, body, userEvent, "Wing", "Wing B");
    await expect(chosenRef(canvas)).toEqual({
      type: "wing",
      wingId: WING_B.id,
      floorIds: [],
      unitIds: [],
    });
  },
};

export const SchemeHasNoFloors: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await choose(canvas, body, userEvent, "Location Type", "Wing");
    await choose(canvas, body, userEvent, "Wing", "Plots East");
    await expect(canvas.queryByLabelText("Floors")).toBeNull();
    await choose(canvas, body, userEvent, "Units", "Plot 2");
    await userEvent.keyboard("{Escape}");
    await expect(canvas.getByLabelText("Chosen location")).toHaveTextContent(
      "Plots East · Unit Plot 2",
    );
  },
};

export const Amenity: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByLabelText("Location Type"));
    // Only the types the Project has rows for, in order.
    await expect(
      (await body.findAllByRole("option")).map((option) => option.textContent),
    ).toEqual(["Wing", "Amenities", "Common Developments", "Location"]);
    await userEvent.click(body.getByRole("option", { name: "Amenities" }));
    await choose(canvas, body, userEvent, "Amenity", "Swimming Pool");
    await expect(canvas.getByLabelText("Chosen location")).toHaveTextContent(
      "Amenity · Swimming Pool",
    );
    await expect(chosenRef(canvas)).toEqual({
      type: "amenity",
      developmentId: POOL.id,
    });
  },
};

export const CommonDevelopment: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await choose(
      canvas,
      body,
      userEvent,
      "Location Type",
      "Common Developments",
    );
    await choose(
      canvas,
      body,
      userEvent,
      "Common Development",
      "Compound Wall",
    );
    await expect(chosenRef(canvas)).toEqual({
      type: "common_development",
      developmentId: WALL.id,
    });
    await expect(canvas.getByLabelText("Chosen location")).toHaveTextContent(
      "Common Development · Compound Wall",
    );
  },
};

export const LocationOnlyProject: Story = {
  beforeEach: serve(ROAD),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    // One type: no Location Type to choose.
    await expect(
      await canvas.findByLabelText("Location", CONTROL),
    ).toBeVisible();
    await expect(canvas.queryByLabelText("Location Type")).toBeNull();
    await choose(canvas, body, userEvent, "Location", "Toll plaza");
    await expect(chosenRef(canvas)).toEqual({
      type: "location",
      locationId: TOLL.id,
    });
    await expect(canvas.getByLabelText("Chosen location")).toHaveTextContent(
      "Location · Toll plaza",
    );
  },
};

export const ClearsOnTypeChange: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await choose(canvas, body, userEvent, "Location Type", "Wing");
    await choose(canvas, body, userEvent, "Wing", "Wing A");
    await choose(canvas, body, userEvent, "Units", /^G02/);
    await userEvent.keyboard("{Escape}");
    await expect(canvas.getByLabelText("Chosen location")).toHaveTextContent(
      "Wing A · Unit G02",
    );

    await choose(canvas, body, userEvent, "Location Type", "Location");
    await expect(canvas.getByLabelText("Chosen location")).toHaveTextContent(
      "Nothing yet",
    );
    await expect(canvas.queryByLabelText("Wing")).toBeNull();
    await expect(canvas.queryByLabelText("Units")).toBeNull();
    await choose(canvas, body, userEvent, "Location", "Culvert C3");
    await expect(chosenRef(canvas)).toEqual({
      type: "location",
      locationId: CULVERT.id,
    });
  },
};

export const KeepsAStoredValue: Story = {
  args: {
    initial: {
      type: "wing",
      wingId: WING_A.id,
      floorIds: [floorOf(WING_A, 2).id],
      unitIds: [floorOf(WING_A, 2).units[0]?.id ?? ""],
    },
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByLabelText("Chosen location"),
    ).toHaveTextContent("Wing A · Ground Floor · Unit G01");
    await expect(canvas.getByLabelText("Wing")).toHaveTextContent("Wing A");
    await expect(
      canvas.getByRole("button", { name: "Remove Ground Floor" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Remove G01" }),
    ).toBeVisible();
  },
};

export const EmptyWingsProject: Story = {
  beforeEach: serve(EMPTY("wings")),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Nothing to locate this at yet"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Open Wings" }),
    ).toHaveAttribute("href", `/app/projects/${PROJECT}/wings`);
    await expect(canvas.queryByLabelText("Location Type")).toBeNull();
  },
};

export const EmptyLocationsProject: Story = {
  beforeEach: serve(EMPTY("locations")),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("link", { name: "Open Locations" }),
    ).toHaveAttribute("href", `/app/projects/${PROJECT}/locations`);
  },
};

export const BigWingSearch: Story = {
  beforeEach: serve(BIG),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    // One type and one Wing: straight to the Wing.
    await choose(canvas, body, userEvent, "Wing", "Tower 1");
    await expect(
      canvas.getByText(
        `Showing ${String(UNITS_SHOWN)} of 2,050 Units. Type a Unit number to find the rest.`,
      ),
    ).toBeVisible();
    const units = canvas.getByLabelText("Units");
    await userEvent.click(units);
    await expect(
      within(await body.findByRole("listbox", { name: "Units" })).getAllByRole(
        "option",
      ),
    ).toHaveLength(UNITS_SHOWN);
    await userEvent.type(units, "3742");
    await waitFor(() =>
      expect(
        body.getAllByRole("option").map((option) => option.textContent),
      ).toEqual(["3742Commercial Floor 37"]),
    );
    await userEvent.click(body.getByRole("option", { name: /^3742/ }));
    // The search resets after a pick, so the popup has closed: no Escape
    // here (Escape on a closed chips box clears it, as Base UI does).
    await expect(
      canvas.getByRole("button", { name: "Remove 3742" }),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Chosen location")).toHaveTextContent(
      "Tower 1 · Unit 3742",
    );
  },
};

const entrySchema = z.object({
  location: z
    .custom<LocationRef | null>()
    .refine((value) => value != null, "Choose where the work happened."),
});

type EntryInput = z.input<typeof entrySchema>;
type EntryValues = z.output<typeof entrySchema>;

/** A site entry form that requires a location, as M5 / M6 / M8 will. */
function EntryForm() {
  const [saved, setSaved] = useState<LocationRef | null>(null);
  const form = useForm<EntryInput, unknown, EntryValues>({
    resolver: zodResolver(entrySchema),
    defaultValues: { location: null },
  });
  return (
    <form
      noValidate
      className="w-full p-6"
      onSubmit={(event) => {
        void form.handleSubmit((values) => {
          setSaved(values.location);
        })(event);
      }}
    >
      <div className="w-full max-w-4xl space-y-4">
        <Controller
          name="location"
          control={form.control}
          render={({ field, fieldState }) => (
            <div className="space-y-1.5">
              <LocationPicker
                projectId={PROJECT}
                value={field.value}
                onChange={field.onChange}
                ref={field.ref}
                required
                invalid={fieldState.error != null}
              />
              <FieldError message={fieldState.error?.message} />
            </div>
          )}
        />
        <Button type="submit">Save entry</Button>
        {saved == null ? null : (
          <p role="status">
            Saved at <LocationLabel projectId={PROJECT} value={saved} />
          </p>
        )}
      </div>
    </form>
  );
}

export const InsideAForm: Story = {
  render: () => (
    <StoryQueries>
      <EntryForm />
    </StoryQueries>
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Save entry" }),
    );
    await expect(
      await canvas.findByText("Choose where the work happened."),
    ).toBeVisible();
    const type = canvas.getByLabelText("Location Type");
    await expect(type).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(type).toHaveFocus());

    // A type alone is not a location yet.
    await choose(canvas, body, userEvent, "Location Type", "Amenities");
    await userEvent.click(canvas.getByRole("button", { name: "Save entry" }));
    await expect(
      canvas.getByText("Choose where the work happened."),
    ).toBeVisible();

    await choose(canvas, body, userEvent, "Amenity", "Club House");
    await userEvent.click(canvas.getByRole("button", { name: "Save entry" }));
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "Saved at Amenity · Club House",
    );
    await expect(
      canvas.queryByText("Choose where the work happened."),
    ).toBeNull();
  },
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile1" } },
  args: {
    initial: {
      type: "wing",
      wingId: TOWER.id,
      floorIds: TOWER.floors.slice(1, 8).map((floor) => floor.id),
      unitIds: [],
    },
  },
  beforeEach: serve(BIG),
  play: async ({ canvas, canvasElement }) => {
    await expect(
      await canvas.findByRole("button", { name: "Remove Commercial Floor 40" }),
    ).toBeVisible();
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};
