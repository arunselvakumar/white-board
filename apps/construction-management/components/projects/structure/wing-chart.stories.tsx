import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";
import { ProjectShell } from "../project-shell";
import { EditWingScreen } from "./edit-wing-screen";
import {
  KUMARI_HEIGHTS,
  LAYOUT_EAST,
  TOWER_A,
  TOWER_B,
  WINGS_API,
  mockStructureApi,
} from "./structure-fixtures";
import { WingChartScreen } from "./wing-chart";

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

const ALL = { create: true, update: true, delete: true };

const meta = {
  title: "Projects/Structure/Wing chart",
  component: WingChartScreen,
  args: { projectId: KUMARI_HEIGHTS.id, wingId: TOWER_A.id, access: ALL },
  beforeEach: structureApi(),
  parameters: {
    nextjs: {
      navigation: {
        pathname: `/app/projects/${KUMARI_HEIGHTS.id}/wings/${TOWER_A.id}`,
      },
    },
  },
  render: (args) => (
    <StoryQueries>
      <ProjectShell id={KUMARI_HEIGHTS.id}>
        <WingChartScreen {...args} />
      </ProjectShell>
    </StoryQueries>
  ),
} satisfies Meta<typeof WingChartScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Floors × units, top to bottom; empty floors say so. */
export const Chart: Story = {
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { level: 2, name: "Tower A" }),
    ).toBeVisible();
    await expect(
      canvas.getByText("Commercial · Phase 1 · Floors 9 · Units 24"),
    ).toBeVisible();
    const chart = within(canvas.getByRole("region", { name: "Tower A chart" }));
    const rows = chart.getAllByRole("row");
    await expect(rows).toHaveLength(9);
    await expect(
      within(rows[0] ?? document.body).getByText("No units"),
    ).toBeVisible();
    await expect(
      within(rows[5] ?? document.body)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual(["101", "102", "103", "104"]);
    await expect(
      canvas.getByRole("link", { name: "Edit Wing" }),
    ).toHaveAttribute(
      "href",
      `/app/projects/${KUMARI_HEIGHTS.id}/wings/${TOWER_A.id}/edit`,
    );
  },
};

/**
 * A tall, wide Wing scrolls inside its frame: the page itself never
 * scrolls sideways.
 */
export const WideWingScrollsInItsFrame: Story = {
  args: {
    wingId: TOWER_B.id,
    access: { create: false, update: false, delete: false },
  },
  play: async ({ canvas, canvasElement }) => {
    const chart = await canvas.findByRole("region", { name: "Tower B chart" });
    await waitFor(() =>
      expect(chart.scrollWidth).toBeGreaterThanOrEqual(chart.clientWidth),
    );
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
    await expect(canvas.queryByRole("link", { name: "Edit Wing" })).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Delete" })).toBeNull();
  },
};

/** A plotting scheme shows its plots, no floor names. */
export const SchemeChart: Story = {
  args: { wingId: LAYOUT_EAST.id },
  play: async ({ canvas }) => {
    const chart = within(
      await canvas.findByRole("list", { name: "Layout East chart" }),
    );
    await expect(chart.getAllByRole("listitem")).toHaveLength(24);
    await expect(
      canvas.getByText("Plotting scheme · Phase 2 · Plots 24"),
    ).toBeVisible();
  },
};

/** Delete asks first, then goes back to the Wings. */
export const DeleteWing: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Delete" }),
    );
    const dialog = within(await body.findByRole("alertdialog"));
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(calls("POST", `${WINGS_API}/${TOWER_A.id}/delete`)).toHaveLength(
        1,
      ),
    );
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(
        `/app/projects/${KUMARI_HEIGHTS.id}/wings`,
      ),
    );
  },
};

/** Edit Wing loads the saved floors; Save sends their ids back. */
export const EditWing: Story = {
  render: (args) => (
    <StoryQueries>
      <ProjectShell id={KUMARI_HEIGHTS.id}>
        <EditWingScreen projectId={args.projectId} wingId={args.wingId} />
      </ProjectShell>
    </StoryQueries>
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByRole("heading", { level: 2, name: "Edit Tower A" }),
    ).toBeVisible();
    await expect(
      canvas.getByText(
        "Commercial · generated from 5 floors from 1 · 4 units per floor · 2 basements · Terrace",
      ),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Rename unit 101" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    const name = dialog.getByLabelText("Unit name");
    await userEvent.clear(name);
    await userEvent.type(name, "Shop 1");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
    await userEvent.click(
      canvas.getByRole("button", { name: "Remove unit 104" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save Wing" }));

    const path = `${WINGS_API}/${TOWER_A.id}/update`;
    await waitFor(() => expect(calls("POST", path)).toHaveLength(1));
    const sent = calls("POST", path)[0]?.body as {
      name: string;
      expectedUpdatedAt: string;
      floors: { id?: string; units: { id?: string; name: string }[] }[];
    };
    const floor1 = TOWER_A.floors[5];
    await expect(sent.expectedUpdatedAt).toBe(TOWER_A.updatedAt);
    await expect(sent.floors[5]).toEqual({
      id: floor1?.id,
      kind: "typed",
      name: "Commercial Floor 1",
      units: [
        { id: floor1?.units[0]?.id, name: "Shop 1" },
        { id: floor1?.units[1]?.id, name: "102" },
        { id: floor1?.units[2]?.id, name: "103" },
      ],
    });
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(
        `/app/projects/${KUMARI_HEIGHTS.id}/wings/${TOWER_A.id}`,
      ),
    );
  },
};

/** Someone saved in between: the save is refused with their reason. */
export const EditWingConflict: Story = {
  beforeEach: structureApi({
    saveError: {
      status: 409,
      code: "WING_CHANGED",
      message:
        "Someone else changed this Wing after you opened it. Reload to see their changes.",
    },
  }),
  render: EditWing.render,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Save Wing" }),
    );
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Someone else changed this Wing after you opened it. Reload to see their changes.",
    );
  },
};
