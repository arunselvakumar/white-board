import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";
import { ProjectShell } from "../project-shell";
import {
  KUMARI_HEIGHTS,
  PHASES_API,
  PHASE_1,
  TOWER_A,
  WINGS_API,
  mockStructureApi,
} from "./structure-fixtures";
import { WingsPage } from "./wings-page";

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
  title: "Projects/Structure/Wings",
  component: WingsPage,
  args: { projectId: KUMARI_HEIGHTS.id, access: ALL },
  beforeEach: structureApi(),
  parameters: {
    nextjs: {
      navigation: { pathname: `/app/projects/${KUMARI_HEIGHTS.id}/wings` },
    },
  },
  render: (args) => (
    <StoryQueries>
      <ProjectShell id={KUMARI_HEIGHTS.id}>
        <WingsPage {...args} />
      </ProjectShell>
    </StoryQueries>
  ),
} satisfies Meta<typeof WingsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Phases in order with their Wings, totals per Wing, Phase and Project. */
export const ByPhase: Story = {
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { level: 2, name: "Wings" }),
    ).toBeVisible();
    await expect(
      canvas.getByText("3 Wings · 25 floors · 126 units"),
    ).toBeVisible();
    const phase1 = within(canvas.getByRole("region", { name: "Phase 1" }));
    await expect(
      phase1.getByText("2 Wings · 24 floors · 102 units"),
    ).toBeVisible();
    await expect(
      phase1.getByText("Commercial · 9 floors · 24 units"),
    ).toBeVisible();
    await expect(phase1.getByRole("link", { name: "Tower A" })).toHaveAttribute(
      "href",
      `/app/projects/${KUMARI_HEIGHTS.id}/wings/${TOWER_A.id}`,
    );
    const phase2 = within(canvas.getByRole("region", { name: "Phase 2" }));
    await expect(phase2.getByText("Plotting scheme · 24 plots")).toBeVisible();
    await expect(
      phase2.getByRole("link", { name: "Add Wing" }),
    ).toHaveAttribute(
      "href",
      `/app/projects/${KUMARI_HEIGHTS.id}/wings/new?phase=0199c4a0-0000-7000-8000-0000000000f2`,
    );
  },
};

/** The Owner's first visit: one call to action, Phase 1 comes with the Wing. */
export const Empty: Story = {
  beforeEach: structureApi({ phases: [], wings: [] }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Set up this Project's Wings"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Add Wing" }),
    ).toHaveAttribute("href", `/app/projects/${KUMARI_HEIGHTS.id}/wings/new`);
    await expect(
      canvas.getByRole("button", { name: "Add Phase" }),
    ).toBeVisible();
  },
};

/** A Team Member who may only read. */
export const EmptyReadOnly: Story = {
  args: { access: { create: false, update: false, delete: false } },
  beforeEach: structureApi({ phases: [], wings: [] }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No Wings on this Project yet"),
    ).toBeVisible();
    await expect(canvas.queryByRole("link", { name: "Add Wing" })).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "Add Phase" }),
    ).toBeNull();
  },
};

/** Add Phase suggests the next name and refuses one in use. */
export const AddPhase: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add Phase" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    const name = dialog.getByLabelText("Phase name");
    await expect(name).toHaveValue("Phase 3");
    await userEvent.clear(name);
    await userEvent.type(name, "phase 1");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(
      await dialog.findByText("A Phase with this name already exists"),
    ).toBeVisible();
    await userEvent.clear(name);
    await userEvent.type(name, "Tower block");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
    await expect(calls("POST", PHASES_API)[0]?.body).toEqual({
      name: "Tower block",
    });
    await expect(
      await canvas.findByRole("region", { name: "Tower block" }),
    ).toBeVisible();
  },
};

/** Rename a Phase with the `updatedAt` it loaded. */
export const RenamePhase: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Actions for Phase 1" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Rename Phase" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    const name = dialog.getByLabelText("Phase name");
    await userEvent.clear(name);
    await userEvent.type(name, "Stage A");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(calls("POST", `${PHASES_API}/${PHASE_1.id}/rename`)).toHaveLength(
        1,
      ),
    );
    await expect(
      calls("POST", `${PHASES_API}/${PHASE_1.id}/rename`)[0]?.body,
    ).toEqual({ name: "Stage A", expectedUpdatedAt: PHASE_1.updatedAt });
    await expect(
      await canvas.findByRole("region", { name: "Stage A" }),
    ).toBeVisible();
  },
};

/** A Phase with Wings cannot be deleted; delete a Wing after confirming. */
export const DeleteWing: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Actions for Phase 1" }),
    );
    await expect(
      await body.findByRole("menuitem", { name: "Delete (has Wings)" }),
    ).toHaveAttribute("aria-disabled", "true");
    await userEvent.keyboard("{Escape}");

    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Tower A" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Delete" }),
    );
    const dialog = within(await body.findByRole("alertdialog"));
    await expect(dialog.getByText("Delete Tower A?")).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(calls("POST", `${WINGS_API}/${TOWER_A.id}/delete`)).toHaveLength(
        1,
      ),
    );
    await waitFor(() =>
      expect(canvas.queryByRole("link", { name: "Tower A" })).toBeNull(),
    );
  },
};
