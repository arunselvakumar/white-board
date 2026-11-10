import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";

import {
  mockUnitsApi,
  SALES_PROJECT_ID,
  TOWER_B_ID,
  UNITS_API,
  type UnitsApiOptions,
} from "./units-fixtures";
import { UnitsTab } from "./units-tab";

let api: ReturnType<typeof mockUnitsApi>;

function unitsApi(options: UnitsApiOptions = {}) {
  return () => {
    api = mockUnitsApi(options);
    return api.restore;
  };
}

const meta = {
  title: "Sales/Units/Units tab",
  component: UnitsTab,
  args: { projectId: SALES_PROJECT_ID },
  beforeEach: unitsApi(),
  parameters: {
    nextjs: {
      navigation: {
        pathname: `/app/projects/${SALES_PROJECT_ID}/bookings/units`,
      },
    },
  },
  render: (args) => (
    <StoryQueries>
      <UnitsTab {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof UnitsTab>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every unit coloured and named by its sales status, with counts. */
export const Chart: Story = {
  play: async ({ canvas }) => {
    const all = within(
      await canvas.findByRole("list", { name: "Units by sales status" }),
    );
    await expect(all.getByText("Available").nextSibling).toHaveTextContent("5");
    await expect(all.getByText("Booked").nextSibling).toHaveTextContent("1");
    await expect(all.getByText("On Hold").nextSibling).toHaveTextContent("1");
    await expect(all.getByText("Unavailable").nextSibling).toHaveTextContent(
      "1",
    );
    const chart = within(canvas.getByRole("region", { name: "Tower A units" }));
    await expect(
      chart.getByRole("button", { name: "201, Booked, 2BHK" }),
    ).toBeVisible();
    await expect(
      chart.getByRole("button", { name: "G01, Unavailable, Shop" }),
    ).toBeVisible();
    // A hold past its Hold until date counts as Available.
    await expect(
      chart.getByRole("button", { name: "302, Available, 2BHK" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Import unit details" }),
    ).toBeVisible();
  },
};

/** Selecting a unit opens its panel with Hold and Book. */
export const UnitPanelOpens: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "101, Available, 2BHK" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const panel = within(await body.findByRole("dialog"));
    await expect(await panel.findByText("Unit type")).toBeVisible();
    await expect(panel.getByText("850 sq ft")).toBeVisible();
    await expect(panel.getByRole("link", { name: "Hold" })).toHaveAttribute(
      "href",
      expect.stringContaining("status=on_hold"),
    );
    await expect(panel.getByRole("link", { name: "Book" })).toHaveAttribute(
      "href",
      expect.stringContaining("/bookings/list/new?unitId="),
    );
    await expect(
      panel.getByRole("button", { name: "Mark unavailable" }),
    ).toBeVisible();
  },
};

/** A booked unit's panel shows its booking and earlier ones, no Hold or Book. */
export const BookedUnit: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "201, Booked, 2BHK" }),
    );
    const panel = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    await expect(await panel.findByText("Meena Raghavan")).toBeVisible();
    await expect(panel.getByText("Suresh P")).toBeVisible();
    await expect(panel.queryByRole("link", { name: "Book" })).toBeNull();
    await expect(
      panel.getByRole("link", { name: "Open booking" }),
    ).toBeVisible();
  },
};

/** Read only: no import, no Hold or Book, no unit actions. */
export const ReadOnly: Story = {
  beforeEach: unitsApi({ canUpdate: false, canCreate: false }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "101, Available, 2BHK" }),
    );
    const panel = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    await expect(await panel.findByText("Unit type")).toBeVisible();
    await expect(panel.queryByRole("link", { name: "Hold" })).toBeNull();
    await expect(
      panel.queryByRole("button", { name: "Unit details" }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "Import unit details" }),
    ).toBeNull();
  },
};

/** Two Wings: the picker loads the other Wing's grid. */
export const WingPicker: Story = {
  beforeEach: unitsApi({ wings: "two" }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(await canvas.findByLabelText("Wing"));
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", {
        name: "Tower B · 2",
      }),
    );
    await waitFor(async () => {
      await expect(
        api.calls.mock.calls.some(
          ([call]) =>
            call.path.startsWith(`${UNITS_API}?`) &&
            call.path.includes(`wingId=${TOWER_B_ID}`),
        ),
      ).toBe(true);
    });
    await expect(
      await canvas.findByRole("button", { name: "B01, Available, 2BHK" }),
    ).toBeVisible();
  },
};

/** A Project without Wings yet. */
export const NoWings: Story = {
  beforeEach: unitsApi({ wings: "none" }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Wings yet")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Open Wings" }),
    ).toBeVisible();
  },
};
