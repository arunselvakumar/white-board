import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";
import { ProjectShell } from "../project-shell";
import { AddWingScreen } from "./add-wing-screen";
import {
  KUMARI_HEIGHTS,
  PHASE_2,
  WINGS_API,
  mockStructureApi,
} from "./structure-fixtures";

let api: ReturnType<typeof mockStructureApi>;

function structureApi(options: Parameters<typeof mockStructureApi>[0] = {}) {
  return () => {
    api = mockStructureApi(options);
    return api.restore;
  };
}

function calls(method: string, path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === method && call.path === path);
}

type Play = NonNullable<Story["play"]>;
type PlayContext = Parameters<Play>[0];

async function chooseType(
  { canvas, canvasElement, userEvent }: PlayContext,
  label: string,
) {
  const body = within(canvasElement.ownerDocument.body);
  await userEvent.click(await canvas.findByLabelText("Wing Type"));
  await userEvent.click(await body.findByRole("option", { name: label }));
}

async function fill(
  { canvas, userEvent }: PlayContext,
  label: string,
  value: string,
) {
  const field = canvas.getByLabelText(label);
  await userEvent.clear(field);
  if (value !== "") await userEvent.type(field, value);
}

/** Commercial, 5 floors × 4 from 1, 2 basements: the legacy example. */
async function continueWithCommercial(context: PlayContext) {
  const { canvas, userEvent } = context;
  await chooseType(context, "Commercial");
  await fill(context, "Wing Name", "Tower C");
  await fill(context, "Commercial floors", "5");
  await fill(context, "Units per floor", "4");
  await fill(context, "Basement parking floors (optional)", "2");
  await userEvent.click(
    canvas.getByRole("button", { name: "Continue to Units" }),
  );
  await expect(await canvas.findByText("Floors 9 · Units 24")).toBeVisible();
}

const meta = {
  title: "Projects/Structure/Add Wing",
  component: AddWingScreen,
  args: { projectId: KUMARI_HEIGHTS.id },
  beforeEach: structureApi(),
  parameters: {
    nextjs: {
      navigation: {
        pathname: `/app/projects/${KUMARI_HEIGHTS.id}/wings/new`,
      },
    },
  },
  render: (args) => (
    <StoryQueries>
      <ProjectShell id={KUMARI_HEIGHTS.id}>
        <AddWingScreen {...args} />
      </ProjectShell>
    </StoryQueries>
  ),
} satisfies Meta<typeof AddWingScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Step 1: Wing Type and Wing Name are required; the type brings its fields. */
export const Details: Story = {
  play: async (context) => {
    const { canvas, userEvent } = context;
    await expect(
      await canvas.findByText("Step 1 of 2 · Wing details"),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Continue to Units" }),
    );
    await expect(await canvas.findByText("Choose the Wing Type")).toBeVisible();
    await expect(canvas.getByText("Enter the Wing name")).toBeVisible();

    await chooseType(context, "Residential & Commercial");
    for (const label of [
      "Commercial floors",
      "Commercial units per floor",
      "Residential floors",
      "Residential units per floor",
      "Start number",
    ])
      await expect(canvas.getByLabelText(label)).toBeVisible();
    await expect(
      canvas.getByRole("switch", { name: "Terrace floor" }),
    ).toBeChecked();

    await chooseType(context, "Individual Unit");
    await expect(canvas.getByLabelText("Floors")).toHaveValue("");
    await expect(canvas.getByLabelText("Units per floor")).toHaveValue("1");
  },
};

/** The bounds are the domain's; the field says which one. */
export const ValidationErrors: Story = {
  args: { phaseId: PHASE_2.id },
  play: async (context) => {
    const { canvas, userEvent } = context;
    await chooseType(context, "Commercial");
    await fill(context, "Wing Name", "Tower C");
    await fill(context, "Commercial floors", "151");
    await fill(context, "Units per floor", "0");
    await fill(context, "Start number", "");
    await userEvent.click(
      canvas.getByRole("button", { name: "Continue to Units" }),
    );
    await expect(
      await canvas.findByText("Enter 0 to 150 floors"),
    ).toBeVisible();
    await expect(canvas.getByText("Enter 1 to 50 units")).toBeVisible();
    await expect(canvas.getByText("Enter 0 to 999")).toBeVisible();
    // 100 floors + Ground at 50 is more than a Wing holds.
    await fill(context, "Commercial floors", "100");
    await fill(context, "Units per floor", "50");
    await fill(context, "Start number", "1");
    await userEvent.click(
      canvas.getByRole("button", { name: "Continue to Units" }),
    );
    await expect(
      await canvas.findByText("A Wing holds at most 5,000 units."),
    ).toBeVisible();
  },
};

/** Step 2: Terrace, typed floors high to low, Ground, basements. */
export const ContinueToUnits: Story = {
  play: async (context) => {
    const { canvas } = context;
    await continueWithCommercial(context);
    const floors = within(canvas.getByRole("list", { name: "Floors" }));
    await expect(
      floors.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toEqual([
      "Terrace Floor",
      "Commercial Floor 5",
      "Commercial Floor 4",
      "Commercial Floor 3",
      "Commercial Floor 2",
      "Commercial Floor 1",
      "Ground Floor",
      "Basement Floor 2",
      "Basement Floor 1",
    ]);
    const first = within(
      canvas.getByRole("list", { name: "Units on Commercial Floor 1" }),
    );
    await expect(
      first
        .getAllByRole("button", { name: /^Rename unit/ })
        .map((b) => b.textContent),
    ).toEqual(["101", "102", "103", "104"]);
    await expect(
      canvas.getByRole("button", { name: "Rename unit G01" }),
    ).toBeVisible();
  },
};

/** The editor: rename, add and remove units, rename a floor, add a named floor, Save. */
export const EditUnits: Story = {
  play: async (context) => {
    const { canvas, canvasElement, userEvent } = context;
    const body = within(canvasElement.ownerDocument.body);
    await continueWithCommercial(context);

    // Rename 101 → Shop 1; a name already in the Wing is refused.
    await userEvent.click(
      canvas.getByRole("button", { name: "Rename unit 101" }),
    );
    let dialog = within(await body.findByRole("dialog"));
    const unitName = dialog.getByLabelText("Unit name");
    await userEvent.clear(unitName);
    await userEvent.type(unitName, "g01");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(
      await dialog.findByText("Another unit in this Wing has this name"),
    ).toBeVisible();
    await userEvent.clear(unitName);
    await userEvent.type(unitName, "Shop 1");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
    await expect(
      canvas.getByRole("button", { name: "Rename unit Shop 1" }),
    ).toBeVisible();

    // Remove 502, add a unit to Ground (G05).
    await userEvent.click(
      canvas.getByRole("button", { name: "Remove unit 502" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Add a unit to Ground Floor" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Rename unit G05" }),
    ).toBeVisible();
    await expect(canvas.getByText("Floors 9 · Units 24")).toBeVisible();

    // Rename a floor.
    await userEvent.click(
      canvas.getByRole("button", { name: "Rename Commercial Floor 5" }),
    );
    dialog = within(await body.findByRole("dialog"));
    const floorName = dialog.getByLabelText("Floor name");
    await userEvent.clear(floorName);
    await userEvent.type(floorName, "Office Floor 5");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());

    // A Stilt floor just above Ground.
    await userEvent.click(canvas.getByRole("button", { name: "Add floor" }));
    dialog = within(await body.findByRole("dialog"));
    await userEvent.type(dialog.getByLabelText("Floor name"), "Stilt Floor");
    await expect(dialog.getByLabelText("Where")).toHaveTextContent(
      "Above Ground Floor",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Add floor" }));
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
    await expect(canvas.getByText("Floors 10 · Units 24")).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Save Wing" }));
    await waitFor(() => expect(calls("POST", WINGS_API)).toHaveLength(1));
    const sent = calls("POST", WINGS_API)[0]?.body as {
      phaseId: string;
      type: string;
      name: string;
      config: unknown;
      floors: { kind: string; name: string; units: { name: string }[] }[];
    };
    await expect(sent.type).toBe("commercial");
    await expect(sent.name).toBe("Tower C");
    await expect(sent.config).toEqual({
      floors: 5,
      startNumber: 1,
      unitsPerFloor: 4,
      basements: 2,
      terrace: true,
    });
    await expect(sent.floors.map((floor) => floor.name)).toEqual([
      "Terrace Floor",
      "Office Floor 5",
      "Commercial Floor 4",
      "Commercial Floor 3",
      "Commercial Floor 2",
      "Commercial Floor 1",
      "Stilt Floor",
      "Ground Floor",
      "Basement Floor 2",
      "Basement Floor 1",
    ]);
    await expect(sent.floors[6]?.kind).toBe("other");
    await expect(sent.floors[5]?.units.map((unit) => unit.name)).toEqual([
      "Shop 1",
      "102",
      "103",
      "104",
    ]);
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(
        `/app/projects/${KUMARI_HEIGHTS.id}/wings`,
      ),
    );
  },
};

/** A plotting scheme is one row of plots; the floor row is hidden. */
export const PlottingScheme: Story = {
  play: async (context) => {
    const { canvas, userEvent } = context;
    await chooseType(context, "Plotting scheme");
    await fill(context, "Wing Name", "Layout West");
    await fill(context, "Number of plots", "6");
    await userEvent.click(
      canvas.getByRole("button", { name: "Continue to Units" }),
    );
    await expect(await canvas.findByText("Plots 6")).toBeVisible();
    await expect(
      within(canvas.getByRole("list", { name: "Floors" })).queryByRole(
        "heading",
      ),
    ).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "Add floor" }),
    ).toBeNull();
    await userEvent.click(
      canvas.getByRole("button", { name: "Add a unit to Plots" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Rename unit Plot 7" }),
    ).toBeVisible();
  },
};

/** A refused name sends you back to the details with the message under it. */
export const NameInUse: Story = {
  beforeEach: structureApi({
    saveError: {
      status: 409,
      code: "WING_NAME_IN_USE",
      message: "A Wing with this name already exists on this Project.",
    },
  }),
  play: async (context) => {
    const { canvas, userEvent } = context;
    await continueWithCommercial(context);
    await userEvent.click(canvas.getByRole("button", { name: "Save Wing" }));
    await expect(
      await canvas.findByText(
        "A Wing with this name already exists on this Project.",
      ),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Wing Name")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(canvas.getByText("Step 1 of 2 · Wing details")).toBeVisible();
  },
};
